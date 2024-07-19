import { BtcAssetsApiError, genCreateClusterCkbVirtualTx, sendRgbppUtxos } from 'rgbpp';
import { isMainnet, collector, btcAccount, btcDataSource, btcService, BTC_TESTNET_TYPE } from '../../env';
import { CLUSTER_DATA } from './0-cluster-info';
import {
  appendCkbTxWitnesses,
  buildRgbppLockArgs,
  generateClusterCreateCoBuild,
  sendCkbTx,
  updateCkbTxWithRealBtcTxId,
} from 'rgbpp/ckb';
import { saveCkbVirtualTxResult } from '../../shared/utils';
import { signAndSendPsbt } from '../../shared/btc-account';

// Warning: Before runing this file, please run 1-prepare-cluster.ts
const createCluster = async ({ ownerRgbppLockArgs }: { ownerRgbppLockArgs: string }) => {
  const ckbVirtualTxResult = await genCreateClusterCkbVirtualTx({
    collector,
    rgbppLockArgs: ownerRgbppLockArgs,
    clusterData: CLUSTER_DATA,
    isMainnet,
    ckbFeeRate: BigInt(2000),
    btcTestnetType: BTC_TESTNET_TYPE,
  });

  // Save ckbVirtualTxResult
  saveCkbVirtualTxResult(ckbVirtualTxResult, '2-create-cluster');

  const { commitment, ckbRawTx, clusterId, needPaymasterCell } = ckbVirtualTxResult;

  console.log('clusterId: ', clusterId);

  // Send BTC tx
  const psbt = await sendRgbppUtxos({
    ckbVirtualTx: ckbRawTx,
    commitment,
    tos: [btcAccount.from],
    needPaymaster: needPaymasterCell,
    ckbCollector: collector,
    from: btcAccount.from,
    fromPubkey: btcAccount.fromPubkey,
    source: btcDataSource,
    feeRate: 30,
  });

  const { txId: btcTxId, rawTxHex: btcTxBytes } = await signAndSendPsbt(psbt, btcAccount, btcService);
  console.log('BTC TxId: ', btcTxId);

  const interval = setInterval(async () => {
    try {
      console.log('Waiting for BTC tx and proof to be ready');
      const rgbppApiSpvProof = await btcService.getRgbppSpvProof(btcTxId, 0);
      clearInterval(interval);
      // Update CKB transaction with the real BTC txId
      const newCkbRawTx = updateCkbTxWithRealBtcTxId({ ckbRawTx, btcTxId, isMainnet });

      console.log('The cluster rgbpp lock args: ', newCkbRawTx.outputs[0].lock.args);
      console.log('The cluster rgbpp lock args -- btc tx id: ', btcTxId);
      console.log('The cluster rgbpp lock args -- btc tx out index: 1');

      const ckbTx = await appendCkbTxWitnesses({
        ckbRawTx: newCkbRawTx,
        btcTxBytes,
        rgbppApiSpvProof,
      });
      // Replace cobuild witness with the final rgbpp lock script
      ckbTx.witnesses[ckbTx.witnesses.length - 1] = generateClusterCreateCoBuild(
        ckbTx.outputs[0],
        ckbTx.outputsData[0],
      );

      console.log(JSON.stringify(ckbTx));

      const txHash = await sendCkbTx({ collector, signedTx: ckbTx });
      console.info(`RGB++ Cluster has been created and tx hash is ${txHash}`);
    } catch (error) {
      if (!(error instanceof BtcAssetsApiError)) {
        console.error(error);
      }
    }
  }, 30 * 1000);
};

// Please use your real BTC UTXO information on the BTC Testnet which should be same as the 1-prepare-cluster.ts
// BTC Testnet3: https://mempool.space/testnet
// BTC Signet: https://mempool.space/signet

// rgbppLockArgs: outIndexU32 + btcTxId
createCluster({
  ownerRgbppLockArgs: buildRgbppLockArgs(3, 'aee4e8e3aa95e9e9ab1f0520714031d92d3263262099dcc7f7d64e62fa2fcb44'),
});
