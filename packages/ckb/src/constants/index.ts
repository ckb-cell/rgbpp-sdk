export const CKB_UNIT = BigInt(10000_0000);
export const MAX_FEE = BigInt(2000_0000);
export const MIN_CAPACITY = BigInt(61) * BigInt(10000_0000);
export const SECP256K1_WITNESS_LOCK_LEN = 65;

const TestnetInfo = {
  Secp256k1LockDep: {
    outPoint: {
      txHash: '0xf8de3bb47d055cdf460d93a2a6e1b05f7432f9777c8c474abf4eec1d4aee5d37',
      index: '0x0',
    },
    depType: 'depGroup',
  } as CKBComponents.CellDep,

  RgbppLockScript: {
    codeHash: '0xd23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac',
    hashType: 'type',
    args: '',
  } as CKBComponents.Script,

  RgbppLockDep: {
    outPoint: { txHash: '0x437d4343c1eb5901c74ba34f6e9b1a1a25d72b441659d73bb1b40e9924bda6fb', index: '0x0' },
    depType: 'depGroup',
  } as CKBComponents.CellDep,

  XUDTTypeScript: {
    codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
    hashType: 'type',
    args: '',
  } as CKBComponents.Script,

  XUDTTypeDep: {
    outPoint: {
      txHash: '0xbf6fb538763efec2a70a6a3dcb7242787087e1030c4e7d86585bc63a9d337f5f',
      index: '0x0',
    },
    depType: 'code',
  } as CKBComponents.CellDep,
};

const MainnetInfo = {
  Secp256k1LockDep: {
    outPoint: {
      txHash: '0x71a7ba8fc96349fea0ed3a5c47992e3b4084b031a42264a018e0072e8172e46c',
      index: '0x0',
    },
    depType: 'depGroup',
  } as CKBComponents.CellDep,

  RgbppLockScript: {
    codeHash: '0xd23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac',
    hashType: 'type',
    args: '',
  } as CKBComponents.Script,

  RgbppLockDep: {
    outPoint: { txHash: '0x437d4343c1eb5901c74ba34f6e9b1a1a25d72b441659d73bb1b40e9924bda6fb', index: '0x0' },
    depType: 'depGroup',
  } as CKBComponents.CellDep,

  XUDTTypeScript: {
    codeHash: '0x50bd8d6680b8b9cf98b73f3c08faf8b2a21914311954118ad6609be6e78a1b95',
    hashType: 'data1',
    args: '',
  } as CKBComponents.Script,

  XUDTTypeDep: {
    outPoint: {
      txHash: '0xc07844ce21b38e4b071dd0e1ee3b0e27afd8d7532491327f39b786343f558ab7',
      index: '0x0',
    },
    depType: 'code',
  } as CKBComponents.CellDep,
};

export const getSecp256k1CellDep = (isMainnet = false) =>
  isMainnet ? MainnetInfo.Secp256k1LockDep : TestnetInfo.Secp256k1LockDep;

export const getXudtTypeScript = (isMainnet = false) =>
  isMainnet ? MainnetInfo.XUDTTypeScript : TestnetInfo.XUDTTypeScript;
export const getXudtDep = (isMainnet = false) => (isMainnet ? MainnetInfo.XUDTTypeDep : TestnetInfo.XUDTTypeDep);

export const getRgbppLockScript = (isMainnet = false) =>
  isMainnet ? MainnetInfo.RgbppLockScript : TestnetInfo.RgbppLockScript;
export const getRgbppLockDep = (isMainnet = false) => (isMainnet ? MainnetInfo.RgbppLockDep : TestnetInfo.RgbppLockDep);