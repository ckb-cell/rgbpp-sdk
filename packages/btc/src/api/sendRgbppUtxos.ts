import { Collector, isRgbppLockCell, isBtcTimeLockCell, calculateCommitment } from '@rgbpp-sdk/ckb';
import { bitcoin } from '../bitcoin';
import { Utxo } from '../transaction/utxo';
import { DataSource } from '../query/source';
import { NetworkType } from '../preset/types';
import { ErrorCodes, TxBuildError } from '../error';
import { InitOutput, TxAddressOutput, TxBuilder } from '../transaction/build';
import { networkTypeToConfig } from '../preset/config';
import { unpackRgbppLockArgs } from '../ckb/molecule';
import { createSendUtxosBuilder } from './sendUtxos';

export interface SendRgbppUtxosProps {
  ckbVirtualTx: CKBComponents.RawTransaction;
  commitment: string;
  tos?: string[];
  paymaster?: TxAddressOutput;

  ckbCollector: Collector;
  rgbppMinUtxoSatoshi?: number;

  from: string;
  source: DataSource;
  fromPubkey?: string;
  changeAddress?: string;
  minUtxoSatoshi?: number;
  feeRate?: number;
}

export async function sendRgbppUtxosBuilder(props: SendRgbppUtxosProps): Promise<{
  builder: TxBuilder;
  feeRate: number;
  fee: number;
}> {
  const btcInputs: Utxo[] = [];
  const btcOutputs: InitOutput[] = [];
  let lastCkbTypeInputIndex = -1;
  let lastCkbTypeOutputIndex = -1;

  const ckbVirtualTx = props.ckbVirtualTx;
  const config = networkTypeToConfig(props.source.networkType);
  const isCkbMainnet = props.source.networkType === NetworkType.MAINNET;

  // Handle and check inputs
  for (let i = 0; i < ckbVirtualTx.inputs.length; i++) {
    const ckbInput = ckbVirtualTx.inputs[i];

    const ckbLiveCell = await props.ckbCollector.getLiveCell(ckbInput.previousOutput!);
    const isRgbppLock = isRgbppLockCell(ckbLiveCell.output, isCkbMainnet);

    // If input.type !== null, input.lock must be RgbppLock or RgbppTimeLock
    if (ckbLiveCell.output.type) {
      if (!isRgbppLock) {
        throw new TxBuildError(ErrorCodes.CKB_INVALID_CELL_LOCK);
      }

      // If input.type !== null，update lastTypeInput
      lastCkbTypeInputIndex = i;
    }

    // If input.lock == RgbppLock, add to inputs if:
    // 1. input.lock.args can be unpacked to RgbppLockArgs
    // 2. utxo can be found via the DataSource.getUtxo() API
    // 3. utxo.scriptPk == addressToScriptPk(props.from)
    // 4. utxo is not duplicated in the inputs
    if (isRgbppLock) {
      const args = unpackRgbppLockArgs(ckbLiveCell.output.lock.args);
      const utxo = await props.source.getUtxo(args.btcTxid, args.outIndex);
      if (!utxo) {
        throw new TxBuildError(ErrorCodes.CANNOT_FIND_UTXO);
      }
      if (utxo.address !== props.from) {
        throw new TxBuildError(ErrorCodes.REFERENCED_UNPROVABLE_UTXO);
      }

      const foundInInputs = btcInputs.some((v) => v.txid === utxo.txid && v.vout === utxo.vout);
      if (foundInInputs) {
        continue;
      }

      btcInputs.push({
        ...utxo,
        pubkey: props.fromPubkey, // For P2TR addresses, a pubkey is required
      });
    }
  }

  // The inputs.length should be >= 1
  if (btcInputs.length < 1) {
    throw new TxBuildError(ErrorCodes.CKB_INVALID_INPUTS);
  }

  // Handle and check outputs
  for (let i = 0; i < ckbVirtualTx.outputs.length; i++) {
    const ckbOutput = ckbVirtualTx.outputs[i];
    const isRgbppLock = isRgbppLockCell(ckbOutput, isCkbMainnet);
    const isBtcTimeLock = isBtcTimeLockCell(ckbOutput, isCkbMainnet);

    // If output.type !== null, then the output.lock must be RgbppLock or RgbppTimeLock
    if (ckbOutput.type) {
      if (!isRgbppLock && !isBtcTimeLock) {
        throw new TxBuildError(ErrorCodes.CKB_INVALID_CELL_LOCK);
      }

      // If output.type !== null，update lastTypeInput
      lastCkbTypeOutputIndex = i;
    }

    // If output.lock == RgbppLock, generate a corresponding output in outputs
    if (isRgbppLock) {
      const toBtcAddress = props.tos?.[i];
      const minUtxoSatoshi = props.rgbppMinUtxoSatoshi ?? config.rgbppUtxoDustLimit;
      btcOutputs.push({
        fixed: true,
        address: toBtcAddress ?? props.from,
        value: minUtxoSatoshi,
        minUtxoSatoshi,
      });
    }
  }

  // By rules, the length of type outputs should be >= 1
  // The "lastTypeOutputIndex" is -1 by default so if (index < 0) it's invalid
  if (lastCkbTypeOutputIndex < 0) {
    throw new TxBuildError(ErrorCodes.CKB_INVALID_OUTPUTS);
  }

  // Verify the provided commitment
  const calculatedCommitment = calculateCommitment({
    inputs: [...ckbVirtualTx.inputs].slice(0, lastCkbTypeInputIndex + 1),
    outputs: [...ckbVirtualTx.outputs].slice(0, lastCkbTypeOutputIndex + 1),
    outputsData: [...ckbVirtualTx.outputsData].slice(0, lastCkbTypeOutputIndex + 1),
  });
  if (props.commitment !== calculatedCommitment) {
    throw new TxBuildError(ErrorCodes.CKB_UNMATCHED_COMMITMENT);
  }

  const mergedBtcOutputs = (() => {
    const merged: InitOutput[] = [];

    // Add commitment to the beginning of outputs
    merged.push({
      data: props.commitment,
      fixed: true,
      value: 0,
    });

    // Add outputs
    merged.push(...btcOutputs);

    // Add paymaster if provided
    if (props.paymaster) {
      merged.push({
        ...props.paymaster,
        fixed: true,
      });
    }

    return merged;
  })();

  return await createSendUtxosBuilder({
    inputs: btcInputs,
    outputs: mergedBtcOutputs,
    from: props.from,
    source: props.source,
    fromPubkey: props.fromPubkey,
    changeAddress: props.changeAddress,
    minUtxoSatoshi: props.minUtxoSatoshi,
    feeRate: props.feeRate,
  });
}

export async function sendRgbppUtxos(props: SendRgbppUtxosProps): Promise<bitcoin.Psbt> {
  const { builder } = await sendRgbppUtxosBuilder(props);
  return builder.toPsbt();
}
