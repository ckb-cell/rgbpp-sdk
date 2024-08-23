# @rgbpp-sdk/service

## About

The `@rgbpp-sdk/service` package provides a wrapped class to interact with [`Bitcoin/RGB++ Assets Service`](https://github.com/ckb-cell/btc-assets-api) (BtcAssetsApi). It offers various features for interacting with Bitcoin and RGB++ assets:

- **Retrieve Blockchain Information** including Bitcoin chain info, blocks, headers, transactions, addresses, and RGB++ assets
- **Handle transactions** by posting to `/bitcoin/v1/transaction` or `/rgbpp/v1/transaction/ckb-tx`
- **Generate Bitcoin transaction Proof** via `/rgbpp/v1/btc-spv/proof` through [Bitcoin SPV Service on CKB](https://github.com/ckb-cell/ckb-bitcoin-spv-service)
- Simplify RGB++ assets workflows with **RGB++ CKB transaction Queue** and cron jobs
- More detailed API documentation can be found on [Testnet](https://api.testnet.rgbpp.io/docs), [Signet](https://api.signet.rgbpp.io/docs) and [Mainnet](https://api.rgbpp.io/docs)

> [!NOTE]
> [`Bitcoin/RGB++ Assets Service`](https://github.com/ckb-cell/btc-assets-api) is an open-source project designed to streamline the transaction workflow for Bitcoin and RGB++ Assets. Developers have the option to enhance it by implementing its features by themselves without limitations. For those who prefer to deploy their own `Bitcoin/RGB++ Assets Service`, please follow the instructions at the [Deployment](https://github.com/ckb-cell/btc-assets-api#deployment) section in the btc-assets-api repository.

## Installation

```bash
# Install via npm:
$ npm i @rgbpp-sdk/service
# Install via yarn:
$ yarn add @rgbpp-sdk/service
# Install via pnpm:
$ pnpm add @rgbpp-sdk/service
```

## Get started

### Get a service URL

You can start using the `Bitcoin/RGB++ Assets Service` by accessing one of our deployed services. For those who prefer to deploy their own `Bitcoin/RGB++ Assets Service`, the documentation for deployment can be found at: [Deployment - ckb-cell/btc-assets-api](https://github.com/ckb-cell/btc-assets-api#deployment).

- Testnet: https://api.testnet.rgbpp.io
- Signet: https://api.signet.rgbpp.io
- Mainnet: https://api.rgbpp.io

### Get an access token

You need an access token to interact with the service. The testnet/signet services are currently free to access, you can get an access token of the target network through the following documentation URLs:

- Testnet: [/token/generate](https://api.testnet.rgbpp.io/docs/static/index.html#/Token/post_token_generate)
- Signet: [/token/generate](https://api.signet.rgbpp.io/docs/static/index.html#/Token/post_token_generate)

As to the mainnet service, it's currently limited to verified apps only. When your app development is ready on testnet, and requires a mainnet access token, please email us at `f@cell.studio` to request a mainnet JWT token. In the email, please provide the following information about your app:

- Name: Your app name, e.g. "rgbpp-app"
- Domain: Your app domain, e.g. "rgbpp.app"

### Initialize the service

#### Browser

Initialize the service with the URL and your access token in browser environment:

```typescript
import { BtcAssetsApi } from '@rgbpp-sdk/service';

const service = BtcAssetsApi.fromToken('https://api.testnet.rgbpp.io', 'your_access_token');
```

#### Node.js

When initializing the service in Node.js, you should also pass the `origin` prop:

```typescript
import { BtcAssetsApi } from '@rgbpp-sdk/service';

const service = BtcAssetsApi.fromToken('https://api.testnet.rgbpp.io', 'your_access_token', 'https://your_app.origin');
```

The `origin` prop is used to verify your token's corresponding `domain`.
For example, if your token was generated in the domain of `your.app`,
you should pass `https://your.app` as the `origin` prop.
Otherwise, the service will reject your request.

Note the format difference `domain` and `origin`:

- `domain`: `your.app`, without protocol (`https://`, `http://`, etc.)
- `origin`: `https://your.app`, with protocol `https://`

### Interact with the service

Once initialized, you can start accessing the service:

```typescript
// Query the balance of an address
const res = await service.getBalance('tb1qm06rvrq8jyyckzc5v709u7qpthel9j4d9f7nh3');

console.log(res);
// {
//   address: 'tb1qm06rvrq8jyyckzc5v709u7qpthel9j4d9f7nh3',
//   satoshi: 72921,
//   pending_satoshi: 0,
//   utxo_count: 5
// }
```

All available APIs can be found in the [Types](#types) section.

### Handling service errors

You can identify the error by its `code` and `message`, or by its detailed `context`:

```ts
import { BtcAssetsApiError, ErrorCodes } from '@rgbpp-sdk/service';

try {
...
} catch (e) {
  if (e instanceof BtcAssetsApiError) {
    // check error code
    console.log(e.code === ErrorCodes.ASSETS_API_UNAUTHORIZED); // true
    // print the whole error
    console.log(JSON.stringify(e));
    /*{
      "message": "BtcAssetsAPI unauthorized, please check your token/origin: (401) Authorization token is invalid: The token header is not a valid base64url serialized JSON.",
      "code": 2,
      "context": {
        "request": {
          "url": "https://btc-assets-api.url/bitcoin/v1/info"
        },
        "response": {
          "status": 401,
            "data": {
            "message": "Authorization token is invalid: The token header is not a valid base64url serialized JSON."
          }
        }
      }
    }*/
  }
}
```

## Types

### BtcAssetsApi

```typescript
declare class BtcAssetsApi extends BtcAssetsApiBase implements BtcApis, RgbppApis {
  static fromToken(baseUrl: string, token: string, origin?: string): BtcAssetsApi;
}
```

### BtcAssetsApiBase

```typescript
declare class BtcAssetsApiBase implements BaseApis {}
```

### BaseApis

```typescript
interface BaseApis {
  request<T>(route: string, options?: BaseApiRequestOptions): Promise<T>;
  post<T>(route: string, options?: BaseApiRequestOptions): Promise<T>;
  generateToken(): Promise<BtcAssetsApiToken>;
  init(force?: boolean): Promise<void>;
}

interface BaseApiRequestOptions extends RequestInit {
  params?: Record<string, any>;
  method?: 'GET' | 'POST';
  requireToken?: boolean;
  allow404?: boolean;
}

interface BtcAssetsApiToken {
  token: string;
}
```

### BtcApis

```typescript
interface BtcApis {
  getBtcBlockchainInfo(): Promise<BtcApiBlockchainInfo>;
  getBtcBlockByHash(blockHash: string): Promise<BtcApiBlock>;
  getBtcBlockHeaderByHash(blockHash: string): Promise<BtcApiBlockHeader>;
  getBtcBlockHashByHeight(blockHeight: number): Promise<BtcApiBlockHash>;
  getBtcBlockTransactionIdsByHash(blockHash: number): Promise<BtcApiBlockTransactionIds>;
  getBtcRecommendedFeeRates(): Promise<BtcApiRecommendedFeeRates>;
  getBtcBalance(address: string, params?: BtcApiBalanceParams): Promise<BtcApiBalance>;
  getBtcUtxos(address: string, params?: BtcApiUtxoParams): Promise<BtcApiUtxo[]>;
  getBtcTransactions(address: string, params?: BtcApiTransactionParams): Promise<BtcApiTransaction[]>;
  getBtcTransaction(txId: string): Promise<BtcApiTransaction>;
  sendBtcTransaction(txHex: string): Promise<BtcApiSentTransaction>;
}

interface BtcApiBlockchainInfo {
  chain: string;
  blocks: number;
  bestblockhash: number;
  difficulty: number;
  mediantime: number;
}

interface BtcApiBlock {
  id: string;
  height: number;
  version: number;
  timestamp: number;
  tx_count: number;
  size: number;
  weight: number;
  merkle_root: string;
  previousblockhash: string;
  mediantime: number;
  nonce: number;
  bits: number;
  difficulty: number;
}

interface BtcApiBlockHash {
  hash: string;
}

interface BtcApiBlockHeader {
  header: string;
}

interface BtcApiBlockTransactionIds {
  txids: string[];
}

interface BtcApiRecommendedFeeRates {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

interface BtcApiBalanceParams {
  min_satoshi?: number;
  no_cache?: boolean;
}
interface BtcApiBalance {
  address: string;
  // @deprecated Use available_satoshi instead
  satoshi: number;
  total_satoshi: number;
  available_satoshi: number;
  pending_satoshi: number;
  rgbpp_satoshi: number;
  dust_satoshi: number;
  utxo_count: number;
}

interface BtcApiUtxoParams {
  only_non_rgbpp_utxos?: boolean;
  only_confirmed?: boolean;
  min_satoshi?: number;
  no_cache?: boolean;
}
interface BtcApiUtxo {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
    block_height: number;
    block_hash: string;
    block_time: number;
  };
}

interface BtcApiSentTransaction {
  txid: string;
}

interface BtcApiTransactionParams {
  after_txid?: string;
}

interface BtcApiTransaction {
  txid: string;
  version: number;
  locktime: number;
  vin: {
    txid: string;
    vout: number;
    prevout: {
      scriptpubkey: string;
      scriptpubkey_asm: string;
      scriptpubkey_type: string;
      scriptpubkey_address: string;
      value: number;
    };
    scriptsig: string;
    scriptsig_asm: string;
    witness: string[];
    is_coinbase: boolean;
    sequence: number;
  }[];
  vout: {
    scriptpubkey: string;
    scriptpubkey_asm: string;
    scriptpubkey_type: string;
    scriptpubkey_address: string;
    value: number;
  }[];
  weight: number;
  size: number;
  fee: number;
  status: {
    confirmed: boolean;
    block_height: number;
    block_hash: string;
    block_time: number;
  };
}
```

### RgbppApis

```typescript
interface RgbppApis {
  getRgbppPaymasterInfo(): Promise<RgbppApiPaymasterInfo>;
  getRgbppTransactionHash(btcTxId: string): Promise<RgbppApiCkbTransactionHash>;
  getRgbppTransactionState(btcTxId: string): Promise<RgbppApiTransactionState>;
  getRgbppAssetsByBtcTxId(btcTxId: string): Promise<RgbppCell[]>;
  getRgbppAssetsByBtcUtxo(btcTxId: string, vout: number): Promise<RgbppCell[]>;
  getRgbppAssetsByBtcAddress(btcAddress: string, params?: RgbppApiAssetsByAddressParams): Promise<RgbppCell[]>;
  getRgbppBalanceByBtcAddress(btcAddress: string, params?: RgbppApiBalanceByAddressParams): Promise<RgbppApiBalance>;
  getRgbppActivityByBtcAddress(btcAddress: string, params?: RgbppApiActivityByAddressParams): Promise<RgbppApiActivity>;
  getRgbppSpvProof(btcTxId: string, confirmations: number): Promise<RgbppApiSpvProof>;
  sendRgbppCkbTransaction(payload: RgbppApiSendCkbTransactionPayload): Promise<RgbppApiTransactionState>;
  retryRgbppCkbTransaction(payload: RgbppApiRetryCkbTransactionPayload): Promise<RgbppApiTransactionRetry>;
}

type RgbppTransactionState = 'completed' | 'failed' | 'delayed' | 'active' | 'waiting';

interface RgbppApiPaymasterInfo {
  btc_address: string;
  fee: number;
}

interface RgbppApiCkbTransactionHash {
  txhash: string;
}

interface RgbppApiTransactionStateParams {
  with_data?: boolean;
}

interface RgbppApiTransactionState {
  state: RgbppTransactionState;
  attempts: number;
  failedReason?: string;
  data?: {
    txid: string;
    ckbVirtualResult: {
      ckbRawTx: CKBComponents.RawTransaction;
      needPaymasterCell: boolean;
      sumInputsCapacity: string;
      commitment: string;
    };
  };
}

interface RgbppCell extends Cell {
  typeHash?: Hash;
}

interface RgbppApiAssetsByAddressParams {
  type_script?: string;
  no_cache?: boolean;
}

interface RgbppApiBalanceByAddressParams {
  type_script?: string;
  no_cache?: boolean;
}
interface RgbppApiBalance {
  address: string;
  xudt: RgbppApiXudtBalance[];
}
interface RgbppApiXudtBalance {
  name: string;
  decimal: number;
  symbol: string;
  total_amount: string;
  available_amount: string;
  pending_amount: string;
  type_hash: string;
  type_script: Script;
}

interface RgbppApiActivityByAddressParams {
  rgbpp_only?: boolean;
  type_script?: string;
  after_btc_txid?: string;
}
interface RgbppApiActivity {
  address: string;
  cursor: string;
  txs: {
    btcTx: BtcApiTransaction;
    isRgbpp: boolean;
    isomorphicTx?: {
      ckbRawTx?: CKBComponents.RawTransaction;
      ckbTx?: CKBComponents.Transaction;
      inputs?: CKBComponents.CellOutput[];
      outputs?: CKBComponents.CellOutput[];
      status: {
        confirmed: boolean;
      };
    };
  }[];
}

interface RgbppApiSpvProof {
  proof: string;
  spv_client: {
    tx_hash: string;
    index: string;
  };
}

interface RgbppApiSendCkbTransactionPayload {
  btc_txid: string;
  // Support ckbVirtualTxResult and it's JSON string as request parameter
  ckb_virtual_result: RgbppApiSendCkbVirtualResult | string;
}
interface RgbppApiSendCkbVirtualResult {
  ckbRawTx: CKBComponents.RawTransaction;
  needPaymasterCell: boolean;
  sumInputsCapacity: string;
  commitment: string;
}

interface RgbppApiRetryCkbTransactionPayload {
  btc_txid: string;
}

interface RgbppApiTransactionRetry {
  success: boolean;
  state: RgbppTransactionState;
}

```
