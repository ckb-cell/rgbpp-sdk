import { AddressPrefix, addressToScript, privateKeyToAddress, serializeScript } from '@nervosnetwork/ckb-sdk-utils';
import {
  Collector,
  SPVService,
  appendCkbTxWitnesses,
  buildRgbppLockArgs,
  genBtcTransferCkbVirtualTx,
  remove0x,
  reverseHex,
  sendCkbTx,
  updateCkbTxWithRealBtcTxId,
} from '@rgbpp-sdk/ckb';
import { transactionToHex, sendRgbppUtxos, BtcAssetsApi, DataSource, ECPair, bitcoin, NetworkType } from '@rgbpp-sdk/btc';

// CKB SECP256K1 private key
const CKB_TEST_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';
// BTC SECP256K1 private key
const BTC_TEST_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';

const BTC_ASSETS_API_URL = 'https://btc-assets-api-url';

const BTC_ASSETS_TOKEN = '';

const SPV_SERVICE_URL = 'http://spv-service-url';

interface Params {
  rgbppLockArgsList: string[];
  toBtcAddress: string;
  transferAmount: bigint;
}
const transferRgbppOnBtc = async ({ rgbppLockArgsList, toBtcAddress, transferAmount }: Params) => {
  const collector = new Collector({
    ckbNodeUrl: 'https://testnet.ckb.dev/rpc',
    ckbIndexerUrl: 'https://testnet.ckb.dev/indexer',
  });
  const ckbAddress = privateKeyToAddress(CKB_TEST_PRIVATE_KEY, { prefix: AddressPrefix.Testnet });
  console.log('ckb address: ', ckbAddress);
  // const fromLock = addressToScript(ckbAddress);

  const network = bitcoin.networks.testnet;
  const keyPair = ECPair.fromPrivateKey(Buffer.from(BTC_TEST_PRIVATE_KEY, 'hex'), { network });
  const { address: btcAddress } = bitcoin.payments.p2wpkh({
    pubkey: keyPair.publicKey,
    network,
  });

  console.log('btc address: ', btcAddress);

  const networkType = NetworkType.TESTNET;
  const service = BtcAssetsApi.fromToken(BTC_ASSETS_API_URL, BTC_ASSETS_TOKEN, 'localhost');
  const source = new DataSource(service, networkType);

  // TODO: Use the real XUDT type script
  const xudtType: CKBComponents.Script = {
    codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
    hashType: 'type',
    args: '0x1ba116c119d1cfd98a53e9d1a615cf2af2bb87d95515c9d217d367054cfc696b',
  };

  const ckbVirtualTxResult = await genBtcTransferCkbVirtualTx({
    collector,
    rgbppLockArgsList,
    xudtTypeBytes: serializeScript(xudtType),
    transferAmount,
    isMainnet: false,
  });

  const { commitment, ckbRawTx, needPaymasterCell } = ckbVirtualTxResult;

  // Send BTC tx
  const psbt = await sendRgbppUtxos({
    ckbVirtualTx: ckbRawTx,
    paymaster: needPaymasterCell
      ? {
          address: btcAddress!,
          value: 1000,
        }
      : void 0,
    commitment,
    tos: [toBtcAddress],
    ckbCollector: collector,
    from: btcAddress!,
    source,
  });
  psbt.signAllInputs(keyPair);
  psbt.finalizeAllInputs();

  const btcTx = psbt.extractTransaction();
  // Remove the witness from BTC tx for RGBPP unlock
  const btcTxBytes = transactionToHex(btcTx, false);
  const { txid: btcTxId } = await service.sendTransaction(btcTx.toHex());

  console.log('BTC Tx bytes: ', btcTxBytes);
  console.log('BTC TxId: ', btcTxId);

  // Send CKB tx
  const newCkbRawTx = updateCkbTxWithRealBtcTxId({ ckbRawTx, btcTxId, isMainnet: false });

  const spvService = new SPVService(SPV_SERVICE_URL);

  let ckbTx = await appendCkbTxWitnesses({
    ckbRawTx: newCkbRawTx,
    btcTxBytes,
    spvService,
    btcTxIndexInBlock: 0, // ignore spv proof now
    btcTxId,
  });

  console.log(JSON.stringify(ckbTx));

  const txHash = await sendCkbTx({ collector, signedTx: ckbTx });
  console.info(`Rgbpp asset has been transferred on BTC and tx hash is ${txHash}`);
};


// TODO: Use real btc utxo information
// rgbppLockArgs: outIndexU32 + btcTxId
transferRgbppOnBtc({
  rgbppLockArgsList: [buildRgbppLockArgs(1, '53e7c02eba522d1e3b0698b4bf5405c25c33b32e7df84a1a6c19e2cf165681f0')],
  toBtcAddress: 'tb1qvt7p9g6mw70sealdewtfp0sekquxuru6j3gwmt',
  transferAmount: BigInt(800_0000_0000),
});
