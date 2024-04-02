import clone from 'lodash/cloneDeep';
import { bitcoin } from '../bitcoin';
import { DataSource } from '../query/source';
import { ErrorCodes, TxBuildError } from '../error';
import { NetworkType, RgbppBtcConfig } from '../preset/types';
import { isMempoolRecommendedFeeType, RecommendedFeeRate } from '../query/mempool';
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

export type FeeRateOption = number | RecommendedFeeRate;

export class TxBuilder {
  inputs: TxInput[] = [];
  outputs: TxOutput[] = [];

  source: DataSource;
  config: RgbppBtcConfig;
  networkType: NetworkType;
  onlyConfirmedUtxos: boolean;
  minUtxoSatoshi: number;
  feeRate?: FeeRateOption;

  constructor(props: {
    source: DataSource;
    onlyConfirmedUtxos?: boolean;
    minUtxoSatoshi?: number;
    feeRate?: FeeRateOption;
  }) {
    this.source = props.source;
    this.networkType = this.source.networkType;
    this.config = networkTypeToConfig(this.networkType);
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
    feeRate?: FeeRateOption;
  }): Promise<{
    fee: number;
    feeRate: number;
  }> {
    const { address, publicKey, feeRate, changeAddress, deductFromOutputs } = props;
    const originalInputs = clone(this.inputs);
    const originalOutputs = clone(this.outputs);

    // Use the provided fee rate or get recommended fee rate from the mempool.space API
    const currentFeeRate = await this.getFeeRate(feeRate);

    let currentFee: number = 0;
    let previousFee: number = 0;
    while (true) {
      const { needCollect, needReturn, inputsTotal } = this.summary();
      const safeToProcess = inputsTotal > 0 || previousFee > 0;
      const returnAmount = needReturn - previousFee;
      if (safeToProcess && returnAmount > 0) {
        // If sum(inputs) - sum(outputs) > fee, return change while deducting fee
        // Note, should not deduct fee from outputs while also returning change at the same time
        await this.injectChange({
          address: changeAddress ?? address,
          amount: returnAmount,
          fromAddress: address,
          fromPublicKey: publicKey,
        });
      } else {
        const protectionAmount = safeToProcess ? 0 : 1;
        const targetAmount = needCollect - needReturn + previousFee + protectionAmount;
        await this.injectSatoshi({
          address,
          publicKey,
          targetAmount,
          changeAddress,
          deductFromOutputs,
        });
      }

      const addressType = getAddressType(address);
      currentFee = await this.calculateFee(addressType, currentFeeRate);
      if ([-1, 0, 1].includes(currentFee - previousFee)) {
        break;
      }

      previousFee = currentFee;
      this.inputs = clone(originalInputs);
      this.outputs = clone(originalOutputs);
    }

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
  }) {
    if (!isSupportedFromAddress(props.address)) {
      throw TxBuildError.withComment(ErrorCodes.UNSUPPORTED_ADDRESS_TYPE, props.address);
    }

    const injectCollected = props.injectCollected ?? false;
    const deductFromOutputs = props.deductFromOutputs ?? true;

    let collected = 0;
    let changeAmount = 0;
    let targetAmount = props.targetAmount;

    const _collect = async (_targetAmount: number, stack?: boolean) => {
      if (stack) {
        targetAmount += _targetAmount;
      }

      const { utxos, satoshi } = await this.source.collectSatoshi({
        address: props.address,
        targetAmount: _targetAmount,
        minUtxoSatoshi: this.minUtxoSatoshi,
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
    const _updateChangeAmount = () => {
      if (injectCollected) {
        changeAmount = collected + targetAmount;
      } else {
        changeAmount = collected - targetAmount;
      }
    };

    // Collect from outputs
    if (deductFromOutputs) {
      for (let i = 0; i < this.outputs.length; i++) {
        const output = this.outputs[i];
        if (output.fixed) {
          continue;
        }
        if (collected >= targetAmount) {
          break;
        }

        // If output.protected is true, do not destroy the output
        // Only collect the satoshi from (output.value - minUtxoSatoshi)
        const minUtxoSatoshi = output.minUtxoSatoshi ?? this.minUtxoSatoshi;
        const freeAmount = output.value - minUtxoSatoshi;
        const remain = targetAmount - collected;
        if (output.protected) {
          // freeAmount=100, remain=50, collectAmount=50
          // freeAmount=100, remain=150, collectAmount=100
          const collectAmount = Math.min(freeAmount, remain);
          output.value -= collectAmount;
          collected += collectAmount;
        } else {
          // output.value=200, freeAmount=100, remain=50, collectAmount=50
          // output.value=200, freeAmount=100, remain=150, collectAmount=100
          // output.value=100, freeAmount=0, remain=150, collectAmount=100
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

    // Collect target amount of satoshi from DataSource
    if (collected < targetAmount) {
      await _collect(targetAmount - collected);
    }

    // If 0 < change amount < minUtxoSatoshi, collect one more time
    const needForChange = changeAmount > 0 && changeAmount < this.minUtxoSatoshi;
    const changeUtxoNeedAmount = needForChange ? this.minUtxoSatoshi - changeAmount : 0;
    if (needForChange) {
      await _collect(changeUtxoNeedAmount);
    }

    // If not collected enough satoshi, throw error
    const insufficientBalance = collected < targetAmount;
    if (insufficientBalance) {
      throw TxBuildError.withComment(ErrorCodes.INSUFFICIENT_UTXO, `expected: ${targetAmount}, actual: ${collected}`);
    }
    const insufficientForChange = changeAmount > 0 && changeAmount < this.minUtxoSatoshi;
    if (insufficientForChange) {
      const shiftedExpectAmount = targetAmount + changeUtxoNeedAmount;
      throw TxBuildError.withComment(
        ErrorCodes.INSUFFICIENT_UTXO,
        `expected: ${shiftedExpectAmount}, actual: ${collected}`,
      );
    }

    // Return change
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

  async getFeeRate(feeRate?: FeeRateOption): Promise<number> {
    const _tryGetFeeRate = async (feeRate?: FeeRateOption): Promise<number | undefined> => {
      if (typeof feeRate === 'number' && feeRate > 0) {
        return feeRate;
      }
      if (isMempoolRecommendedFeeType(feeRate)) {
        return await this.source.getRecommendedFeeRate(feeRate);
      }
      return void 0;
    };

    const paramFeeRate = await _tryGetFeeRate(feeRate);
    if (paramFeeRate) {
      return paramFeeRate;
    }
    const innerFeeRate = await _tryGetFeeRate(this.feeRate);
    if (innerFeeRate) {
      return innerFeeRate;
    }

    return await this.source.getRecommendedFeeRate();
  }

  async injectChange(props: { amount: number; address: string; fromAddress: string; fromPublicKey?: string }) {
    const { address, fromAddress, fromPublicKey, amount } = props;

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
      const { collected } = await this.injectSatoshi({
        address: fromAddress,
        publicKey: fromPublicKey,
        targetAmount: amount,
        changeAddress: address,
        injectCollected: true,
        deductFromOutputs: false,
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

  async calculateFee(addressType: AddressType, feeRate?: FeeRateOption): Promise<number> {
    const currentFeeRate = await this.getFeeRate(feeRate);

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
