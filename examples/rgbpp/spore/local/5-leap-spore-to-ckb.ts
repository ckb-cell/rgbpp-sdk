import {
  buildRgbppLockArgs,
  appendCkbTxWitnesses,
  updateCkbTxWithRealBtcTxId,
  sendCkbTx,
  getSporeTypeScript,
  Hex,
  generateSporeTransferCoBuild,
  genLeapSporeFromBtcToCkbVirtualTx,
} from 'rgbpp/ckb';
import { sendRgbppUtxos } from 'rgbpp/btc';
import { serializeScript } from '@nervosnetwork/ckb-sdk-utils';
import { isMainnet, collector, btcDataSource, btcService, btcAccount, BTC_TESTNET_TYPE } from '../../env';
import { BtcAssetsApiError } from 'rgbpp';
import { saveCkbVirtualTxResult } from '../../shared/utils';
import { signAndSendPsbt } from '../../shared/btc-account';

interface SporeLeapParams {
  sporeRgbppLockArgs: Hex;
  toCkbAddress: string;
  sporeTypeArgs: Hex;
}

// Warning: It is not recommended for developers to use local examples unless you understand the entire process of RGB++ transactions.
const leapSpore = async ({ sporeRgbppLockArgs, toCkbAddress, sporeTypeArgs }: SporeLeapParams) => {
  // The spore type script is from 3-create-spore.ts, you can find it from the ckb tx spore output cells
  const sporeTypeBytes = serializeScript({
    ...getSporeTypeScript(isMainnet),
    args: sporeTypeArgs,
  });

  const ckbVirtualTxResult = await genLeapSporeFromBtcToCkbVirtualTx({
    collector,
    sporeRgbppLockArgs,
    sporeTypeBytes,
    toCkbAddress,
    isMainnet,
    btcTestnetType: BTC_TESTNET_TYPE,
  });

  // Save ckbVirtualTxResult
  saveCkbVirtualTxResult(ckbVirtualTxResult, '5-leap-spore-to-ckb-local');

  const { commitment, ckbRawTx, sporeCell, needPaymasterCell } = ckbVirtualTxResult;

  // console.log(JSON.stringify(ckbRawTx))

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
    feeRate: 120,
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

      const ckbTx = await appendCkbTxWitnesses({
        ckbRawTx: newCkbRawTx,
        btcTxBytes,
        rgbppApiSpvProof,
      });

      // Replace cobuild witness with the final rgbpp lock script
      ckbTx.witnesses[ckbTx.witnesses.length - 1] = generateSporeTransferCoBuild(
        [sporeCell],
        ckbTx.outputs.slice(0, 1),
      );

      // console.log('ckbTx: ', JSON.stringify(ckbTx));

      const txHash = await sendCkbTx({ collector, signedTx: ckbTx });
      console.info(`RGB++ Spore has been leaped from BTC to CKB and tx hash is ${txHash}`);
    } catch (error) {
      if (!(error instanceof BtcAssetsApiError)) {
        console.error(error);
      }
    }
  }, 30 * 1000);
};

// Please use your real BTC UTXO information on the BTC Testnet
// BTC Testnet3: https://mempool.space/testnet
// BTC Signet: https://mempool.space/signet

// rgbppLockArgs: outIndexU32 + btcTxId
leapSpore({
  // The spore rgbpp lock args is from 3-create-spore.ts
  sporeRgbppLockArgs: buildRgbppLockArgs(3, 'd8a31796fbd42c546f6b22014b9b82b16586ce1df81b0e7ca9a552cdc492a0af'),
  toCkbAddress: 'ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq0e4xk4rmg5jdkn8aams492a7jlg73ue0gc0ddfj',
  // Please use your own RGB++ spore asset's sporeTypeArgs
  sporeTypeArgs: '0x42898ea77062256f46e8f1b861d526ae47810ecc51ab50477945d5fa90452706',
});
