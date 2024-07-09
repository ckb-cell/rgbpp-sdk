import { describe, it, expect } from 'vitest';
import { leToU128, reverseHex, u128ToLe, u32ToLe, u32ToLeHex, u64ToLe, u8ToHex, utf8ToHex } from './hex.js';
import { bytesToHex } from '@nervosnetwork/ckb-sdk-utils';

describe('number to little endian', () => {
  it('u32toLe', () => {
    const expected = u32ToLe(21000000);
    expect('406f4001').toBe(expected);
  });

  it('u32toLeHex', () => {
    expect('0x2c01').toBe(u32ToLeHex(300));
    expect('0x1').toBe(u32ToLeHex(1));
    expect('0xe803').toBe(u32ToLeHex(1000));
  });

  it('u64ToLe', () => {
    const expected = u64ToLe(BigInt(21000000));
    expect('406f400100000000').toBe(expected);
  });

  it('u128ToLe', () => {
    const expected = u128ToLe(BigInt(2100_0000) * BigInt(10 ** 8));
    expect('0040075af07507000000000000000000').toBe(expected);
  });

  it('leToU128', () => {
    const expected = leToU128('0x00b864d9450000000000000000000000');
    expect(BigInt(3000_0000_0000)).toBe(expected);
  });

  it('bytesToHex', () => {
    const expected = bytesToHex(new Uint8Array([0x12, 0x34, 0x56]));
    expect('0x123456').toBe(expected);
  });

  it('u8ToHex', () => {
    const actual = u8ToHex(8);
    expect(actual).toBe('08');
  });

  it('utf8ToHex', () => {
    const actual = utf8ToHex('RGBPP Test Token');
    expect(actual).toBe('0x5247425050205465737420546f6b656e');
  });

  it('reverseHex', () => {
    const expected1 = reverseHex('0x2f061a27abcab1d1d146514ffada6a83c0d974fe0813835ad8be2a39a6b1a6ee');
    expect(expected1).toBe('0xeea6b1a6392abed85a831308fe74d9c0836adafa4f5146d1d1b1caab271a062f');

    const expected2 = reverseHex('2f061a27abcab1d1d146514ffada6a83c0d974fe0813835ad8be2a39a6b1a6ee');
    expect(expected2).toBe('0xeea6b1a6392abed85a831308fe74d9c0836adafa4f5146d1d1b1caab271a062f');
  });
});
