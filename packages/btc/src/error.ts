export enum ErrorCodes {
  UNKNOWN,
  INSUFFICIENT_UTXO,
  UNSUPPORTED_ADDRESS_TYPE,
  ASSETS_API_RESPONSE_ERROR,
  ASSETS_API_REQUIRE_TOKEN,
  ASSETS_API_REQUIRE_APP_INFO,
  ASSETS_API_RESPONSE_DECODE_ERROR,
}

export const ErrorMessages = {
  [ErrorCodes.UNKNOWN]: 'Unknown error',
  [ErrorCodes.INSUFFICIENT_UTXO]: 'Insufficient UTXO',
  [ErrorCodes.UNSUPPORTED_ADDRESS_TYPE]: 'Unsupported address type',
  [ErrorCodes.ASSETS_API_RESPONSE_ERROR]: 'AssetsAPI returned an error',
  [ErrorCodes.ASSETS_API_REQUIRE_TOKEN]: 'AssetsAPI requires "token" to authenticate your request',
  [ErrorCodes.ASSETS_API_REQUIRE_APP_INFO]: 'AssetsAPI requires "app" and "domain" to generate a token',
  [ErrorCodes.ASSETS_API_RESPONSE_DECODE_ERROR]: 'Failed to decode the response of AssetsAPI',
};

export class TxBuildError extends Error {
  public code = ErrorCodes.UNKNOWN;
  constructor(code: ErrorCodes, message = ErrorMessages[code] || 'Unknown error') {
    super(message);
    this.code = code;
    Object.setPrototypeOf(this, TxBuildError.prototype);
  }
}
