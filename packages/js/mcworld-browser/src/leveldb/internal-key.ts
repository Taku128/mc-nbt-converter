import { compareBytes } from './varint.js';

export function buildLookupKey(userKey: Uint8Array): Uint8Array {
  const out = new Uint8Array(userKey.length + 8);
  out.set(userKey, 0);
  for (let i = 0; i < 8; i++) out[userKey.length + i] = 0xff;
  return out;
}

function readTail(buf: Uint8Array, off: number): bigint {
  const view = new DataView(buf.buffer, buf.byteOffset + off, 8);
  const lo = view.getUint32(0, true);
  const hi = view.getUint32(4, true);
  return (BigInt(hi) << 32n) | BigInt(lo);
}

export function compareInternalKey(a: Uint8Array, b: Uint8Array): number {
  const aUserLen = a.length - 8;
  const bUserLen = b.length - 8;
  if (aUserLen < 0 || bUserLen < 0) throw new Error('internal key too short');
  const userCmp = compareBytes(a.subarray(0, aUserLen), b.subarray(0, bUserLen));
  if (userCmp !== 0) return userCmp;
  const aTail = readTail(a, aUserLen);
  const bTail = readTail(b, bUserLen);
  if (aTail > bTail) return -1;
  if (aTail < bTail) return 1;
  return 0;
}

export function userKeyOf(internalKey: Uint8Array): Uint8Array {
  return internalKey.subarray(0, internalKey.length - 8);
}

export function typeOf(internalKey: Uint8Array): number {
  return internalKey[internalKey.length - 8]!;
}

export function sequenceOf(internalKey: Uint8Array): bigint {
  return readTail(internalKey, internalKey.length - 8) >> 8n;
}
