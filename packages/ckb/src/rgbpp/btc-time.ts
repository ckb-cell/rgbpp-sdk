import { bytesToHex, getTransactionSize } from '@nervosnetwork/ckb-sdk-utils';
import { BTC_JUMP_CONFIRMATION_BLOCKS, getBtcTimeLockDep, getXudtDep } from '../constants';
import { BTCTimeUnlock } from '../schemas/generated/rgbpp';
import { BtcTimeCellsParams, Hex } from '../types';
import { append0x, btcTxIdFromBtcTimeLockArgs, calculateTransactionFee, lockScriptFromBtcTimeLockArgs } from '../utils';
import { buildSpvClientCellDep } from '../spv';

export const buildBtcTimeUnlockWitness = (btcTxProof: Hex): Hex => {
  const btcTimeUnlock = BTCTimeUnlock.pack({ btcTxProof });
  return append0x(bytesToHex(btcTimeUnlock));
};

/**
 * Collect btc time cells and spend them to create xudt cells for the specific lock scripts in the btc time lock args
 * The btc time lock args data structure is: lock_script | after | new_bitcoin_tx_id
 * @param btcTimeCells The btc time cells which have met the block confirmations and can be spent
 * @param spvService SPV RPC service
 * @param isMainnet
 */
export const buildBtcTimeCellsSpentTx = async ({
  btcTimeCells,
  spvService,
  isMainnet,
}: BtcTimeCellsParams): Promise<CKBComponents.RawTransaction> => {
  const inputs: CKBComponents.CellInput[] = btcTimeCells.map((cell) => ({
    previousOutput: cell.outPoint,
    since: '0x0',
  }));

  const outputs: CKBComponents.CellOutput[] = btcTimeCells.map((cell) => ({
    lock: lockScriptFromBtcTimeLockArgs(cell.output.lock.args),
    type: cell.output.type,
    capacity: cell.output.capacity,
  }));

  const outputsData = btcTimeCells.map((cell) => cell.outputData);

  const cellDeps: CKBComponents.CellDep[] = [getBtcTimeLockDep(isMainnet), getXudtDep(isMainnet)];

  const witnesses: Hex[] = inputs.map((_) => '0x');

  for await (const cell of btcTimeCells) {
    const { spvClient, proof } = await spvService.fetchSpvClientCellAndTxProof({
      btcTxId: btcTxIdFromBtcTimeLockArgs(cell.output.lock.args),
      confirmBlocks: BTC_JUMP_CONFIRMATION_BLOCKS,
    });
    cellDeps.push(buildSpvClientCellDep(spvClient));

    const btcTimeUnlock = buildBtcTimeUnlockWitness(proof);
    witnesses.push(btcTimeUnlock);
  }

  const ckbTx: CKBComponents.RawTransaction = {
    version: '0x0',
    cellDeps,
    headerDeps: [],
    inputs,
    outputs,
    outputsData,
    witnesses,
  };

  const txSize = getTransactionSize(ckbTx);
  const estimatedTxFee = calculateTransactionFee(txSize);
  const lastOutputCapacity = BigInt(outputs[outputs.length - 1].capacity) - estimatedTxFee;
  ckbTx.outputs[outputs.length - 1].capacity = append0x(lastOutputCapacity.toString(16));

  return ckbTx;
};