import { describe, it, expect } from 'vitest';
import { sha256 } from 'js-sha256';
import { addressToScript, hexToBytes, serializeScript } from '@nervosnetwork/ckb-sdk-utils';
import {
  btcTxIdAndAfterFromBtcTimeLockArgs,
  buildPreLockArgs,
  buildRgbppLockArgs,
  calculateCommitment,
  estimateWitnessSize,
  calculateRgbppTokenInfoSize,
  encodeRgbppTokenInfo,
  genBtcTimeLockArgs,
  genBtcTimeLockScript,
  lockScriptFromBtcTimeLockArgs,
  replaceLockArgsWithRealBtcTxId,
  transformSpvProof,
  throwErrorWhenTxInputsExceeded,
  throwErrorWhenRgbppCellsInvalid,
  isRgbppCapacitySufficientForChange,
  unpackRgbppLockArgs,
} from './rgbpp';
import { getXudtTypeScript } from '../constants';
import { IndexerCell, RgbppCkbVirtualTx } from '../types';
import { calculateUdtCellCapacity } from './ckb-tx';
import {
  InputsOrOutputsLenError,
  NoRgbppLiveCellError,
  RgbppCkbTxInputsExceededError,
  RgbppUtxoBindMultiTypeAssetsError,
} from '../error';
import { remove0x } from './hex';

describe('rgbpp tests', () => {
  it('sha256', () => {
    const message = '0x2f061a27abcab1d1d146514ffada6a83c0d974fe0813835ad8be2a39a6b1a6ee';
    const hash = sha256(hexToBytes(message));
    expect(hash).toBe('c0a45d9d7c024adcc8076c18b3f07c08de7c42120cdb7e6cbc05a28266b15b5f');
  });

  it('calculateCommitment with the test data which is from RGBPP lock contract test cases', () => {
    const rgbppVirtualTx: RgbppCkbVirtualTx = {
      inputs: [
        {
          previousOutput: {
            txHash: '0x047b6894a0b7a4d7a73b1503d1ae35c51fc5fa6306776dcf22b1fb3daaa32a29',
            index: '0x0',
          },
          since: '0x0',
        },
      ],
      outputs: [
        {
          lock: {
            codeHash: '0xd5a4e241104041f6f12f11bddcf30bd7b2f818722f78353fde019f5081cd6b49',
            hashType: 'type',
            args: '0x010000000000000000000000000000000000000000000000000000000000000000000000',
          },
          capacity: '0x0000000000000000',
          type: {
            codeHash: '0xc4957f239eb3db9f5c5fb949e9dd99adbb8068b8ac7fe7ae49495486d5e5d235',
            hashType: 'type',
            args: '0x43094caf2f2bcdf6f5ab02c2de744936897278d558a2b6924db98a4f27d629e2',
          },
        },
        {
          lock: {
            codeHash: '0xd5a4e241104041f6f12f11bddcf30bd7b2f818722f78353fde019f5081cd6b49',
            hashType: 'type',
            args: '0x010000000000000000000000000000000000000000000000000000000000000000000000',
          },
          capacity: '0x0000000000000000',
          type: {
            codeHash: '0xc4957f239eb3db9f5c5fb949e9dd99adbb8068b8ac7fe7ae49495486d5e5d235',
            hashType: 'type',
            args: '0x43094caf2f2bcdf6f5ab02c2de744936897278d558a2b6924db98a4f27d629e2',
          },
        },
      ],
      outputsData: ['0x2c010000000000000000000000000000', '0xbc020000000000000000000000000000'],
    };
    const commitment = calculateCommitment(rgbppVirtualTx);
    expect('7cdecc8cc293d491a0cbf44e92feabfc29e79408c1d2f7547b334c42efe13131').toBe(commitment);

    const invalidRgbppVirtualTx: RgbppCkbVirtualTx = {
      inputs: new Array(300).fill({
        previousOutput: {
          txHash: '0x047b6894a0b7a4d7a73b1503d1ae35c51fc5fa6306776dcf22b1fb3daaa32a29',
          index: '0x0',
        },
        since: '0x0',
      }),
      outputs: [
        {
          lock: {
            codeHash: '0xd5a4e241104041f6f12f11bddcf30bd7b2f818722f78353fde019f5081cd6b49',
            hashType: 'type',
            args: '0x010000000000000000000000000000000000000000000000000000000000000000000000',
          },
          capacity: '0x0000000000000000',
          type: {
            codeHash: '0xc4957f239eb3db9f5c5fb949e9dd99adbb8068b8ac7fe7ae49495486d5e5d235',
            hashType: 'type',
            args: '0x43094caf2f2bcdf6f5ab02c2de744936897278d558a2b6924db98a4f27d629e2',
          },
        },
      ],
      outputsData: ['0xbc020000000000000000000000000000'],
    };
    try {
      calculateCommitment(invalidRgbppVirtualTx);
    } catch (error) {
      if (error instanceof InputsOrOutputsLenError) {
        expect(108).toBe(error.code);
        expect('The inputs or outputs length of RGB++ CKB virtual tx cannot be greater than 255').toBe(error.message);
      }
    }
  });

  it('genBtcTimeLockArgs', () => {
    const toLock: CKBComponents.Script = {
      args: '0x0202020202020202020202020202020202020202',
      codeHash: '0x0101010101010101010101010101010101010101010101010101010101010101',
      hashType: 'type',
    };
    const btcTxId = '0x0303030303030303030303030303030303030303030303030303030303030303';
    const after = 0x2a;
    const args = genBtcTimeLockArgs(toLock, btcTxId, after);
    expect(args).toBe(
      '0x7d00000010000000590000005d000000490000001000000030000000310000000101010101010101010101010101010101010101010101010101010101010101011400000002020202020202020202020202020202020202022a0000000303030303030303030303030303030303030303030303030303030303030303',
    );
  });

  it('genBtcTimeLockArgs2', () => {
    const toLock: CKBComponents.Script = {
      args: '0x00016c61f984f12d3c8a4f649e60acda5deda0b8837c',
      codeHash: '0xd23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac',
      hashType: 'type',
    };
    const btcTxId = '018025fb6989eed484774170eefa2bef1074b0c24537f992a64dbc138277bc4a';
    const after = 0x20;
    const args = genBtcTimeLockArgs(toLock, btcTxId, after);
    expect(args).toBe(
      '0x7f000000100000005b0000005f0000004b000000100000003000000031000000d23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac011600000000016c61f984f12d3c8a4f649e60acda5deda0b8837c200000004abc778213bc4da692f93745c2b07410ef2bfaee70417784d4ee8969fb258001',
    );

    const btcTimeLockArgs = btcTxIdAndAfterFromBtcTimeLockArgs(args);
    expect(btcTimeLockArgs.after).toBe(after);
    expect(remove0x(btcTimeLockArgs.btcTxId)).toBe(btcTxId);
  });

  it('genBtcTimeLockArgs3', () => {
    const toAddress =
      'ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqq9kxr7vy7yknezj0vj0xptx6thk6pwyr0sxamv6q';
    const btcTxId = 'd44e5f02bc28394b97f6d584cf9e43ba731cc049655599cbb3c1274789bf1372';
    const after = 0x6;
    const args = genBtcTimeLockArgs(addressToScript(toAddress), btcTxId, after);
    expect(args).toBe(
      '0x7f000000100000005b0000005f0000004b000000100000003000000031000000d23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac011600000000016c61f984f12d3c8a4f649e60acda5deda0b8837c060000007213bf894727c1b3cb99556549c01c73ba439ecf84d5f6974b3928bc025f4ed4',
    );
    const toLock = lockScriptFromBtcTimeLockArgs(args);
    expect(toLock.args).toBe('0x00016c61f984f12d3c8a4f649e60acda5deda0b8837c');

    const btcTimeLockArgs = btcTxIdAndAfterFromBtcTimeLockArgs(args);
    expect(btcTimeLockArgs.after).toBe(after);
    expect(remove0x(btcTimeLockArgs.btcTxId)).toBe(btcTxId);
  });

  it('genBtcTimeLockScript', () => {
    const lock: CKBComponents.Script = {
      args: '0xc0a45d9d7c024adcc8076c18b3f07c08de7c42120cdb7e6cbc05a28266b15b5f',
      codeHash: '0x28e83a1277d48add8e72fadaa9248559e1b632bab2bd60b27955ebc4c03800a5',
      hashType: 'data',
    };
    const btcTimeLock = genBtcTimeLockScript(lock, false);
    expect(btcTimeLock.args).toBe(
      '0x890000001000000065000000690000005500000010000000300000003100000028e83a1277d48add8e72fadaa9248559e1b632bab2bd60b27955ebc4c03800a50020000000c0a45d9d7c024adcc8076c18b3f07c08de7c42120cdb7e6cbc05a28266b15b5f060000000000000000000000000000000000000000000000000000000000000000000000',
    );

    const btcTimeLockArgs = genBtcTimeLockScript(lock, false, 'Testnet3', 4032).args;
    expect(btcTimeLockArgs).toBe(
      '0x890000001000000065000000690000005500000010000000300000003100000028e83a1277d48add8e72fadaa9248559e1b632bab2bd60b27955ebc4c03800a50020000000c0a45d9d7c024adcc8076c18b3f07c08de7c42120cdb7e6cbc05a28266b15b5fc00f00000000000000000000000000000000000000000000000000000000000000000000',
    );
  });

  it('lockScriptFromBtcTimeLockArgs', () => {
    let lockArgs =
      '0x7d00000010000000590000005d000000490000001000000030000000310000000101010101010101010101010101010101010101010101010101010101010101011400000002020202020202020202020202020202020202022a0000000303030303030303030303030303030303030303030303030303030303030303';
    const lock = lockScriptFromBtcTimeLockArgs(lockArgs);
    expect(lock.codeHash).toBe('0x0101010101010101010101010101010101010101010101010101010101010101');
    expect(lock.args).toBe('0x0202020202020202020202020202020202020202');

    lockArgs =
      '0x890000001000000065000000690000005500000010000000300000003100000028e83a1277d48add8e72fadaa9248559e1b632bab2bd60b27955ebc4c03800a50020000000c0a45d9d7c024adcc8076c18b3f07c08de7c42120cdb7e6cbc05a28266b15b5f060000000000000000000000000000000000000000000000000000000000000000000000';
    const { codeHash, args, hashType } = lockScriptFromBtcTimeLockArgs(lockArgs);
    expect(codeHash).toBe('0x28e83a1277d48add8e72fadaa9248559e1b632bab2bd60b27955ebc4c03800a5');
    expect(args).toBe('0xc0a45d9d7c024adcc8076c18b3f07c08de7c42120cdb7e6cbc05a28266b15b5f');
    expect(hashType).toBe('data');

    lockArgs =
      '0x7f000000100000005b0000005f0000004b0000001000000030000000310000009b819793a64463aed77c615d6cb226eea5487ccfc0783043a587254cda2b6f2601160000000430455c7db8901bee35dc70eeff078c2adfc729920006000000964663ab3b35fd5f02ac29f268ea29401504255707c0b3a943fe143196e80770';
    const result = lockScriptFromBtcTimeLockArgs(lockArgs);
    expect(result.codeHash).toBe('0x9b819793a64463aed77c615d6cb226eea5487ccfc0783043a587254cda2b6f26');
    expect(result.args).toBe('0x0430455c7db8901bee35dc70eeff078c2adfc7299200');
    expect(hashType).toBe('data');
  });

  it('btcTxIdAndAfterFromBtcTimeLockArgs', () => {
    let lockArgs =
      '0x7f000000100000005b0000005f0000004b000000100000003000000031000000d23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac011600000000016c61f984f12d3c8a4f649e60acda5deda0b8837c060000007213bf894727c1b3cb99556549c01c73ba439ecf84d5f6974b3928bc025f4ed4';
    const { btcTxId, after } = btcTxIdAndAfterFromBtcTimeLockArgs(lockArgs);
    expect(btcTxId).toBe('0xd44e5f02bc28394b97f6d584cf9e43ba731cc049655599cbb3c1274789bf1372');
    expect(after).toBe(6);

    lockArgs =
      '0x7f000000100000005b0000005f0000004b0000001000000030000000310000009b819793a64463aed77c615d6cb226eea5487ccfc0783043a587254cda2b6f2601160000000430455c7db8901bee35dc70eeff078c2adfc729920006000000964663ab3b35fd5f02ac29f268ea29401504255707c0b3a943fe143196e80770';
    const result = btcTxIdAndAfterFromBtcTimeLockArgs(lockArgs);
    expect(result.btcTxId).toBe('0x7007e8963114fe43a9b3c007572504154029ea68f229ac025ffd353bab634696');
    expect(result.after).toBe(6);
  });

  it('calculateUdtCellCapacity', () => {
    const joyIDLock: CKBComponents.Script = {
      codeHash: '0xd23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac',
      hashType: 'type',
      args: '0x0001f21be6c96d2103946d37a1ee882011f7530a92a7',
    };
    const xudtType: CKBComponents.Script = {
      codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
      hashType: 'type',
      args: '0x06ec22c2def100bba3e295a1ff279c490d227151bf3166a4f3f008906c849399',
    };
    const capacity = calculateUdtCellCapacity(joyIDLock, xudtType);
    expect(BigInt(145_0000_0000)).toBe(capacity);
  });

  it('buildRgbppLockArgs', () => {
    const expected = buildRgbppLockArgs(2, '0x9993846c9008f0f3a46631bf5171220d499c27ffa195e2a3bb00f1dec222ec06');
    expect('0x0200000006ec22c2def100bba3e295a1ff279c490d227151bf3166a4f3f008906c849399').toBe(expected);
  });

  it('buildPreLockArgs', () => {
    expect('0x020000000000000000000000000000000000000000000000000000000000000000000000').toBe(buildPreLockArgs(2));
  });

  it('unpackRgbppLockArgs', () => {
    const unpacked = unpackRgbppLockArgs('0x0200000006ec22c2def100bba3e295a1ff279c490d227151bf3166a4f3f008906c849399');
    expect('0x9993846c9008f0f3a46631bf5171220d499c27ffa195e2a3bb00f1dec222ec06').toBe(unpacked.btcTxId);
    expect(2).toBe(unpacked.outIndex);
  });

  it('replaceRealBtcTxId', () => {
    const rgbppLockArgs = '0x020000000000000000000000000000000000000000000000000000000000000000000000';
    const realBtcTxId = '0x9993846c9008f0f3a46631bf5171220d499c27ffa195e2a3bb00f1dec222ec06';
    const lockArgs = replaceLockArgsWithRealBtcTxId(rgbppLockArgs, realBtcTxId);
    expect('0x0200000006ec22c2def100bba3e295a1ff279c490d227151bf3166a4f3f008906c849399').toBe(lockArgs);

    const btcTimeLockArgs =
      '0x850000001000000061000000650000005100000010000000300000003100000028e83a1277d48add8e72fadaa9248559e1b632bab2bd60b27955ebc4c03800a500c0a45d9d7c024adcc8076c18b3f07c08de7c42120cdb7e6cbc05a28266b15b5f060000000000000000000000000000000000000000000000000000000000000000000000';
    const args = replaceLockArgsWithRealBtcTxId(btcTimeLockArgs, realBtcTxId);
    expect(
      '0x850000001000000061000000650000005100000010000000300000003100000028e83a1277d48add8e72fadaa9248559e1b632bab2bd60b27955ebc4c03800a500c0a45d9d7c024adcc8076c18b3f07c08de7c42120cdb7e6cbc05a28266b15b5f0600000006ec22c2def100bba3e295a1ff279c490d227151bf3166a4f3f008906c849399',
    ).toBe(args);
  });

  it('transformSpvProof', () => {
    const expected = transformSpvProof({
      spv_client: {
        tx_hash: '0x047b6894a0b7a4d7a73b1503d1ae35c51fc5fa6306776dcf22b1fb3daaa32a29',
        index: '0xa',
      },
      proof: '0x2f061a27abcab1d1d146514ffada6a83c0d974fe0813835ad8be2a39a6b1a6ee',
    });
    expect('0x047b6894a0b7a4d7a73b1503d1ae35c51fc5fa6306776dcf22b1fb3daaa32a29').toBe(expected.spvClient.txHash);
    expect('0xa').toBe(expected.spvClient.index);
    expect('0x2f061a27abcab1d1d146514ffada6a83c0d974fe0813835ad8be2a39a6b1a6ee').toBe(expected.proof);
  });

  it('estimatedWitnessSize', () => {
    const actual = estimateWitnessSize([
      '0x000000002f061a27abcab1d1d146514ffada6a83c0d974fe0813835ad8be2a39a6b1a6ee',
      '0x010000002f061a27abcab1d1d146514ffada6a83c0d974fe0813835ad8be2a39a6b1a6ee',
      '0x01000000047b6894a0b7a4d7a73b1503d1ae35c51fc5fa6306776dcf22b1fb3daaa32a29',
      '0x010000002f061a27abcab1d1d146514ffada6a83c0d974fe0813835ad8be2a39a6b1a6ee',
    ]);
    expect(actual).toBe(15000);
  });

  it('encodeRgbppTokenInfo', () => {
    const actual = encodeRgbppTokenInfo({ decimal: 8, name: 'RGBPP Test Token', symbol: 'RTT' });
    expect(actual).toBe('0x08105247425050205465737420546f6b656e03525454');
  });

  it('calculateRgbppTokenInfoSize', () => {
    const actual = calculateRgbppTokenInfoSize({ decimal: 8, name: 'RGBPP Test Token', symbol: 'RTT' });
    expect(actual).toBe(BigInt(22));
  });

  it('throwErrorWhenTxInputsExceeded', () => {
    try {
      throwErrorWhenTxInputsExceeded(10);
    } catch (error) {
      if (error instanceof RgbppCkbTxInputsExceededError) {
        expect(109).toBe(error.code);
        expect('Please ensure the tx inputs do not exceed 10').toBe(error.message);
      }
    }
  });

  it('throwErrorWhenRgbppCellsInvalid', () => {
    const xudtTypeBytes = serializeScript({
      ...getXudtTypeScript(false),
      args: '0x205fe15af04e59d3ff1ff8e0b0a1e3bc201af406a38964760c24848ed6029b6b',
    });

    try {
      throwErrorWhenRgbppCellsInvalid([], xudtTypeBytes, false);
    } catch (error) {
      if (error instanceof NoRgbppLiveCellError) {
        expect(104).toBe(error.code);
        expect('No rgbpp cells found with the rgbpp lock args').toBe(error.message);
      }
    }

    const typeNullCells: IndexerCell[] = [
      {
        blockNumber: '0x0',
        outPoint: {
          txHash: '0xf2bfcd0ec5f7b2a33577168b7a647e71cc81a731560a7ad23b1c31fc08bbe1bb',
          index: '0x1',
        },
        output: {
          capacity: '0x460913c00',
          lock: {
            args: '0x0200000050b34b391fd8f8084bf9b6af4368350c1510df4964496b87495ebee4bd8d86d5',
            codeHash: '0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248',
            hashType: 'type',
          },
        },
        outputData: '0x2d000000100000001e0000002d0000000a000000746578742f706c61696e0b00000046697273742053706f7265',
        txIndex: '0x0',
      },
    ];
    try {
      throwErrorWhenRgbppCellsInvalid(typeNullCells, xudtTypeBytes, false);
    } catch (error) {
      if (error instanceof NoRgbppLiveCellError) {
        expect(104).toBe(error.code);
        expect('No rgbpp cells found with the rgbpp lock args').toBe(error.message);
      }
    }

    const nonXUDTCells: IndexerCell[] = [
      {
        blockNumber: '0x0',
        outPoint: {
          txHash: '0xf2bfcd0ec5f7b2a33577168b7a647e71cc81a731560a7ad23b1c31fc08bbe1bb',
          index: '0x1',
        },
        output: {
          capacity: '0x460913c00',
          lock: {
            args: '0x0200000050b34b391fd8f8084bf9b6af4368350c1510df4964496b87495ebee4bd8d86d5',
            codeHash: '0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248',
            hashType: 'type',
          },
          type: {
            args: '0xf2bfcd0ec5f7b2a33577168b7a647e71cc81a731560a7ad23b1c31fc08bbe1bb',
            codeHash: '0xf2bfcd0ec5f7b2a33577168b7a647e71cc81a731560a7ad23b1c31fc08bbe1bb',
            hashType: 'data1',
          },
        },
        outputData: '0x2d000000100000001e0000002d0000000a000000746578742f706c61696e0b00000046697273742053706f7265',
        txIndex: '0x0',
      },
    ];
    try {
      throwErrorWhenRgbppCellsInvalid(nonXUDTCells, xudtTypeBytes, false);
    } catch (error) {
      if (error instanceof RgbppUtxoBindMultiTypeAssetsError) {
        expect(110).toBe(error.code);
        expect('The BTC UTXO must not be bound to xUDT and other type cells at the same time').toBe(error.message);
      }
    }

    const noTargetCells: IndexerCell[] = [
      {
        blockNumber: '0x0',
        outPoint: {
          txHash: '0xf2bfcd0ec5f7b2a33577168b7a647e71cc81a731560a7ad23b1c31fc08bbe1bb',
          index: '0x1',
        },
        output: {
          capacity: '0x460913c00',
          lock: {
            args: '0x0200000050b34b391fd8f8084bf9b6af4368350c1510df4964496b87495ebee4bd8d86d5',
            codeHash: '0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248',
            hashType: 'type',
          },
          type: {
            args: '0xf2bfcd0ec5f7b2a33577168b7a647e71cc81a731560a7ad23b1c31fc08bbe1bb',
            codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
            hashType: 'data1',
          },
        },
        outputData: '0x2d000000100000001e0000002d0000000a000000746578742f706c61696e0b00000046697273742053706f7265',
        txIndex: '0x0',
      },
    ];
    try {
      throwErrorWhenRgbppCellsInvalid(noTargetCells, xudtTypeBytes, false);
    } catch (error) {
      if (error instanceof NoRgbppLiveCellError) {
        expect(104).toBe(error.code);
        expect('No rgbpp cells found with the xudt type script and the rgbpp lock args').toBe(error.message);
      }
    }
  });

  it('isRgbppCapacityEnoughForChange', () => {
    expect(false).toBe(
      isRgbppCapacitySufficientForChange(BigInt(500) * BigInt(10000_0000), BigInt(254) * BigInt(10000_0000)),
    );
    expect(false).toBe(
      isRgbppCapacitySufficientForChange(BigInt(507) * BigInt(10000_0000), BigInt(254) * BigInt(10000_0000)),
    );
    expect(true).toBe(
      isRgbppCapacitySufficientForChange(BigInt(508) * BigInt(10000_0000), BigInt(254) * BigInt(10000_0000)),
    );
  });
});
