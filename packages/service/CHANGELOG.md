# @rgbpp-sdk/service

## v0.3.0

### Minor Changes

- [#208](https://github.com/ckb-cell/rgbpp-sdk/pull/208): Adapt btc-assets-api#154, adding new props and return values to the /balance and /unspent APIs ([@ShookLyngs](https://github.com/ShookLyngs))

  - Add `available_satoshi` and `total_satoshi` to the BtcAssetsApi.getBtcBalance() API
  - Add `only_non_rgbpp_utxos` to the props of the BtcAssetsApi.getBtcUtxos() API
  - Remove `service.getRgbppAssetsByBtcUtxo()` lines from the DataCollector.collectSatoshi()
  - Remove `hasRgbppAssets` related variables/function from the DataCache

## v0.2.0

### Minor Changes

- [#165](https://github.com/ckb-cell/rgbpp-sdk/pull/165): Replace all "void 0" to "undefined" in the btc/service lib ([@ShookLyngs](https://github.com/ShookLyngs))

### Patch Changes

- [#181](https://github.com/ckb-cell/rgbpp-sdk/pull/181): add no_cache params to btc/rgbpp service api ([@ahonn](https://github.com/ahonn))

## v0.1.0

- Release @rgbpp-sdk/service for communicating with the [btc-assets-api](https://github.com/ckb-cell/btc-assets-api), providing APIs to query data from or post transactions to the service. Read the docs for more information: https://github.com/ckb-cell/rgbpp-sdk/tree/develop/packages/service
