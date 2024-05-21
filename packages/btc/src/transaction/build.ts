import clone from 'lodash/cloneDeep';
import { bitcoin } from '../bitcoin';
import { DataSource } from '../query/source';
import { ErrorCodes, TxBuildError } from '../error';
import { NetworkType, RgbppBtcConfig } from '../preset/types';
import { AddressType, addressToScriptPublicKeyHex, getAddressType, isSupportedFromAddress } from '../address';
import { dataToOpReturnScriptPubkey, isOpReturnScriptPubkey } from './embed';
import { networkTypeToConfig } from '../preset/config';
import { Utxo, utxoToInput } from './utxo';
import { FeeEstimator } from './fee';

export interface TxInput {
  data: {
    hash: string;
    index: number;
    witnessUtxo: { value: number; script: Buffer };
    tapInternalKey?: Buffer;
  };
  utxo: Utxo;
}

export type TxOutput = TxAddressOutput | TxScriptOutput;
export interface BaseOutput {
  value: number;
  fixed?: boolean;
  protected?: boolean;
  minUtxoSatoshi?: number;
}
export interface TxAddressOutput extends BaseOutput {
  address: string;
}
export interface TxScriptOutput extends BaseOutput {
  script: Buffer;
}

export type InitOutput = TxAddressOutput | TxDataOutput | TxScriptOutput;
export interface TxDataOutput extends BaseOutput {
  data: Buffer | string;
}

export class TxBuilder {
  inputs: TxInput[] = [];
  outputs: TxOutput[] = [];

  source: DataSource;
  config: RgbppBtcConfig;
  networkType: NetworkType;
  onlyNonRgbppUtxos: boolean;
  onlyConfirmedUtxos: boolean;
  minUtxoSatoshi: number;
  feeRate?: number;

  constructor(props: {
    source: DataSource;
    onlyNonRgbppUtxos?: boolean;
    onlyConfirmedUtxos?: boolean;
    minUtxoSatoshi?: number;
    feeRate?: number;
  }) {
    this.source = props.source;
    this.networkType = this.source.networkType;
    this.config = networkTypeToConfig(this.networkType);
    this.onlyNonRgbppUtxos = props.onlyNonRgbppUtxos ?? true;
    this.onlyConfirmedUtxos = props.onlyConfirmedUtxos ?? false;
    this.minUtxoSatoshi = props.minUtxoSatoshi ?? this.config.btcUtxoDustLimit;
    this.feeRate = props.feeRate;
  }

  hasInput(hash: string, index: number): boolean {
    return this.inputs.some((input) => input.data.hash === hash && input.data.index === index);
  }

  addInput(utxo: Utxo) {
    if (this.hasInput(utxo.txid, utxo.vout)) {
      throw TxBuildError.withComment(ErrorCodes.DUPLICATED_UTXO, `hash: ${utxo.txid}, index: ${utxo.vout}`);
    }

    utxo = clone(utxo);
    this.inputs.push(utxoToInput(utxo));
  }

  addInputs(utxos: Utxo[]) {
    utxos.forEach((utxo) => {
      this.addInput(utxo);
    });
  }

  async validateInputs() {
    for (const input of this.inputs) {
      const transactionConfirmed = await this.source.isTransactionConfirmed(input.data.hash);
      if (!transactionConfirmed) {
        throw TxBuildError.withComment(
          ErrorCodes.UNCONFIRMED_UTXO,
          `hash: ${input.data.hash}, index: ${input.data.index}`,
        );
      }
    }
  }

  addOutput(output: InitOutput) {
    let result: TxOutput | undefined;

    if ('data' in output) {
      result = {
        script: dataToOpReturnScriptPubkey(output.data),
        value: output.value,
        fixed: output.fixed,
        protected: output.protected,
        minUtxoSatoshi: output.minUtxoSatoshi,
      };
    }
    if ('address' in output || 'script' in output) {
      result = clone(output);
    }
    if (!result) {
      throw new TxBuildError(ErrorCodes.UNSUPPORTED_OUTPUT);
    }

    const minUtxoSatoshi = result.minUtxoSatoshi ?? this.minUtxoSatoshi;
    const isOpReturnOutput = 'script' in result && isOpReturnScriptPubkey(result.script);
    if (!isOpReturnOutput && result.value < minUtxoSatoshi) {
      throw TxBuildError.withComment(ErrorCodes.DUST_OUTPUT, `expected ${minUtxoSatoshi}, but defined ${result.value}`);
    }

    this.outputs.push(result);
  }

  addOutputs(outputs: InitOutput[]) {
    outputs.forEach((output) => {
      this.addOutput(output);
    });
  }

  async payFee(props: {
    address: string;
    publicKey?: string;
    changeAddress?: string;
    deductFromOutputs?: boolean;
    noUtxosCache?: boolean;
    feeRate?: number;
  }): Promise<{
    fee: number;
    feeRate: number;
  }> {
    const { address, publicKey, feeRate, changeAddress, deductFromOutputs, noUtxosCache } = props;
    const originalInputs = clone(this.inputs);
    const originalOutputs = clone(this.outputs);

    // Create a cache key to prevent querying the Utxo[] too often
    // TODO: consider provide an option to disable the cache
    const cacheKey = `${Date.now()}`;

    // Fill a default recommended fee rate if props.feeRate is not provided
    let defaultFeeRate: number | undefined;
    if (!feeRate && !this.feeRate) {
      const feeRates = await this.source.service.getBtcRecommendedFeeRates();
      defaultFeeRate = feeRates.fastestFee;
    }

    // Use props.feeRate if it's specified
    const currentFeeRate = feeRate ?? this.feeRate ?? defaultFeeRate!;

    let currentFee = 0;
    let previousFee = 0;
    let isLoopedOnce = false;
    let isFeeExpected = false;
    while (!isFeeExpected) {
      if (isLoopedOnce) {
        previousFee = currentFee;
        this.inputs = clone(originalInputs);
        this.outputs = clone(originalOutputs);
      }

      const { needCollect, needReturn, inputsTotal } = this.summary();
      const safeToProcess = inputsTotal > 0 || previousFee > 0;
      const returnAmount = needReturn - previousFee;
      if (safeToProcess && returnAmount > 0) {
        // If sum(inputs) - sum(outputs) > fee, return (change - fee) to a non-fixed output or to a new output.
        // Note when returning change to a new output, another satoshi collection may be needed.
        await this.injectChange({
          address: changeAddress ?? address,
          amount: returnAmount,
          fromAddress: address,
          fromPublicKey: publicKey,
          noUtxosCache,
          cacheKey,
        });
      } else {
        // If the inputs have insufficient satoshi, a satoshi collection is required.
        // For protection, at least collect 1 satoshi if the inputs are empty or the fee hasn't been calculated.
        const protectionAmount = safeToProcess ? 0 : 1;
        const targetAmount = needCollect - needReturn + previousFee + protectionAmount;
        await this.injectSatoshi({
          address,
          publicKey,
          targetAmount,
          changeAddress,
          deductFromOutputs,
          noUtxosCache,
          cacheKey,
        });
      }

      // Calculate network fee
      const addressType = getAddressType(address);
      currentFee = await this.calculateFee(addressType, currentFeeRate);

      // If (fee = previousFee ±1), the fee is considered acceptable/expected.
      isFeeExpected = [-1, 0, 1].includes(currentFee - previousFee);
      if (!isLoopedOnce) {
        isLoopedOnce = true;
      }
    }

    // Clear cache for the Utxo[] list
    this.source.cache.cleanUtxos(cacheKey);

    return {
      fee: currentFee,
      feeRate: currentFeeRate,
    };
  }

  async injectSatoshi(props: {
    address: string;
    publicKey?: string;
    targetAmount: number;
    changeAddress?: string;
    injectCollected?: boolean;
    deductFromOutputs?: boolean;
    noUtxosCache?: boolean;
    cacheKey?: string;
  }) {
    if (!isSupportedFromAddress(props.address)) {
      throw TxBuildError.withComment(ErrorCodes.UNSUPPORTED_ADDRESS_TYPE, props.address);
    }

    const targetAmount = props.targetAmount;
    const injectCollected = props.injectCollected ?? false;
    const deductFromOutputs = props.deductFromOutputs ?? true;

    let collected = 0;
    let changeAmount = 0;

    /**
     * Collect from the "from" address via DataSource.
     * Will update the value of inputs/collected/changeAmount.
     */
    const _collect = async (_targetAmount: number) => {
      const { utxos, satoshi } = await this.source.collectSatoshi({
        address: props.address,
        targetAmount: _targetAmount,
        allowInsufficient: true,
        cacheKey: props.cacheKey,
        noUtxosCache: props.noUtxosCache,
        minUtxoSatoshi: this.minUtxoSatoshi,
        onlyNonRgbppUtxos: this.onlyNonRgbppUtxos,
        onlyConfirmedUtxos: this.onlyConfirmedUtxos,
        excludeUtxos: this.inputs.map((row) => row.utxo),
      });
      utxos.forEach((utxo) => {
        this.addInput({
          ...utxo,
          pubkey: props.publicKey,
        });
      });

      collected += satoshi;
      _updateChangeAmount();
    };
    /**
     * Update changeAmount depends on injectedCollected:
     * - true: If targetAmount=1000, collected=2000, changeAmount=2000+1000=3000
     * - false: If targetAmount=1000, collected=2000, changeAmount=2000-1000=1000
     */
    const _updateChangeAmount = () => {
      if (injectCollected) {
        changeAmount = collected + targetAmount;
      } else {
        changeAmount = collected - targetAmount;
      }
    };

    // 1. Collect from the non-fixed outputs
    if (deductFromOutputs) {
      for (let i = 0; i < this.outputs.length; i++) {
        const output = this.outputs[i];
        if (output.fixed) {
          continue;
        }
        if (collected >= targetAmount) {
          break;
        }

        const minUtxoSatoshi = output.minUtxoSatoshi ?? this.minUtxoSatoshi;
        const freeAmount = output.value - minUtxoSatoshi;
        const remain = targetAmount - collected;
        if (output.protected) {
          // If output.protected=true:
          // - Only deduct free satoshi from the output
          // - Won't destroy the output, at least keep (output.value = minUtxoSatoshi)
          const collectAmount = Math.min(freeAmount, remain);
          output.value -= collectAmount;
          collected += collectAmount;
        } else {
          // If output.protected=false:
          // - If (target collect amount > output.value), deduct all output.value
          // - Destroy the output if all value is deducted
          const collectAmount = output.value > remain ? Math.min(freeAmount, remain) : output.value;
          output.value -= collectAmount;
          collected += collectAmount;

          if (output.value === 0) {
            this.outputs.splice(i, 1);
            i--;
          }
        }
      }
    }

    // 2. Collect from the "from" address
    if (collected < targetAmount) {
      await _collect(targetAmount - collected);
    }

    // 3. Collect from "from" one more time if:
    // - Need to create an output to return change (changeAmount > 0)
    // - The change is insufficient for a non-dust output (changeAmount < minUtxoSatoshi)
    const needForChange = changeAmount > 0 && changeAmount < this.minUtxoSatoshi;
    const changeUtxoNeedAmount = needForChange ? this.minUtxoSatoshi - changeAmount : 0;
    if (needForChange) {
      await _collect(changeUtxoNeedAmount);
    }

    // 4. If not collected enough satoshi, throw an error
    const insufficientBalance = collected < targetAmount;
    if (insufficientBalance) {
      const recommendedDeposit = targetAmount - collected + this.minUtxoSatoshi;
      throw TxBuildError.withComment(
        ErrorCodes.INSUFFICIENT_UTXO,
        `expected: ${targetAmount}, actual: ${collected}. You may wanna deposit more satoshi to prevent the error, for example: ${recommendedDeposit}`,
      );
    }
    const insufficientForChange = changeAmount > 0 && changeAmount < this.minUtxoSatoshi;
    if (insufficientForChange) {
      const shiftedExpectAmount = collected + changeUtxoNeedAmount;
      throw TxBuildError.withComment(
        ErrorCodes.INSUFFICIENT_UTXO,
        `expected: ${shiftedExpectAmount}, actual: ${collected}`,
      );
    }

    // 5. Return change:
    // - If changeAmount=0, no need to create a change output, and the changeIndex=-1
    // - If changeAmount>0, return change to an output or create a change output
    let changeIndex: number = -1;
    if (changeAmount > 0) {
      changeIndex = this.outputs.length;
      const changeAddress = props.changeAddress ?? props.address;
      await this.injectChange({
        amount: changeAmount,
        address: changeAddress,
        fromAddress: props.address,
        fromPublicKey: props.publicKey,
      });
    }

    return {
      collected,
      changeIndex,
      changeAmount,
    };
  }

  async injectChange(props: {
    amount: number;
    address: string;
    fromAddress: string;
    fromPublicKey?: string;
    noUtxosCache?: boolean;
    cacheKey?: string;
  }) {
    const { address, fromAddress, fromPublicKey, amount, noUtxosCache, cacheKey } = props;

    // If any (output.fixed != true) is found in the outputs (search in ASC order),
    // return the change value to the first matched output.
    for (let i = 0; i < this.outputs.length; i++) {
      const output = this.outputs[i];
      if (output.fixed) {
        continue;
      }
      if (!('address' in output) || output.address !== address) {
        continue;
      }

      output.value += amount;
      return;
    }

    if (amount < this.minUtxoSatoshi) {
      // If the change is not enough to create a non-dust output, try collect more.
      // - injectCollected=true, expect to put all (collected + amount) of satoshi as change
      // - deductFromOutputs=false, do not collect satoshi from the outputs
      // An example:
      // 1. Expected to return change of 500 satoshi, amount=500
      // 2. Collected 2000 satoshi from the "fromAddress", collected=2000
      // 3. Create a change output and return (collected + amount), output.value=2000+500=2500
      const { collected } = await this.injectSatoshi({
        address: fromAddress,
        publicKey: fromPublicKey,
        targetAmount: amount,
        changeAddress: address,
        injectCollected: true,
        deductFromOutputs: false,
        noUtxosCache,
        cacheKey,
      });
      if (collected < amount) {
        throw TxBuildError.withComment(ErrorCodes.INSUFFICIENT_UTXO, `expected: ${amount}, actual: ${collected}`);
      }
    } else {
      this.addOutput({
        address: address,
        value: amount,
      });
    }
  }

  async calculateFee(addressType: AddressType, feeRate?: number): Promise<number> {
    if (!feeRate && !this.feeRate) {
      throw TxBuildError.withComment(ErrorCodes.INVALID_FEE_RATE, `${feeRate ?? this.feeRate}`);
    }

    const currentFeeRate = feeRate ?? this.feeRate!;

    const psbt = await this.createEstimatedPsbt(addressType);
    const tx = psbt.extractTransaction(true);

    const inputs = tx.ins.length;
    const weightWithWitness = tx.byteLength(true);
    const weightWithoutWitness = tx.byteLength(false);

    const weight = weightWithoutWitness * 3 + weightWithWitness + inputs;
    const virtualSize = Math.ceil(weight / 4);
    return Math.ceil(virtualSize * currentFeeRate);
  }

  async createEstimatedPsbt(addressType: AddressType): Promise<bitcoin.Psbt> {
    const estimate = FeeEstimator.fromRandom(addressType, this.networkType);
    const estimateScriptPk = addressToScriptPublicKeyHex(estimate.address, this.networkType);

    const tx = this.clone();
    const utxos = tx.inputs.map((input) => input.utxo);
    tx.inputs = utxos.map((utxo) => {
      utxo.scriptPk = estimateScriptPk;
      utxo.pubkey = estimate.publicKey;
      return utxoToInput(utxo);
    });

    const psbt = tx.toPsbt();
    await estimate.signPsbt(psbt);
    return psbt;
  }

  summary() {
    const inputsTotal = this.inputs.reduce((acc, input) => acc + input.utxo.value, 0);
    const outputsTotal = this.outputs.reduce((acc, output) => acc + output.value, 0);

    const inputsRemaining = inputsTotal - outputsTotal;
    const outputsRemaining = outputsTotal - inputsTotal;

    return {
      inputsTotal,
      outputsTotal,
      inputsRemaining,
      outputsRemaining,
      needReturn: inputsRemaining > 0 ? inputsRemaining : 0,
      needCollect: outputsRemaining > 0 ? outputsRemaining : 0,
    };
  }

  clone(): TxBuilder {
    const tx = new TxBuilder({
      source: this.source,
      feeRate: this.feeRate,
      minUtxoSatoshi: this.minUtxoSatoshi,
    });

    tx.inputs = clone(this.inputs);
    tx.outputs = clone(this.outputs);

    return tx;
  }

  toPsbt(): bitcoin.Psbt {
    const network = this.config.network;
    const psbt = new bitcoin.Psbt({ network });
    this.inputs.forEach((input) => {
      psbt.data.addInput(input.data);
    });
    this.outputs.forEach((output) => {
      psbt.addOutput(output);
    });
    return psbt;
  }
}
