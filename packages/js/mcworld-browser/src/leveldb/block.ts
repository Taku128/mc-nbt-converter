import { readVarint32 } from './varint.js';

export interface BlockEntry {
  key: Uint8Array;
  value: Uint8Array;
}

export interface DecodedBlock {
  entries: BlockEntry[];
}

export function decodeBlock(raw: Uint8Array): DecodedBlock {
  if (raw.length < 4) throw new Error('block too short');
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const numRestarts = view.getUint32(raw.length - 4, true);
  const restartsStart = raw.length - 4 - numRestarts * 4;
  const entries: BlockEntry[] = [];
  let pos = 0;
  let lastKey = new Uint8Array(0);
  while (pos < restartsStart) {
    const { value: shared, pos: p1 } = readVarint32(raw, pos);
    const { value: nonShared, pos: p2 } = readVarint32(raw, p1);
    const { value: valueLen, pos: p3 } = readVarint32(raw, p2);
    const keyDelta = raw.subarray(p3, p3 + nonShared);
    const value = raw.subarray(p3 + nonShared, p3 + nonShared + valueLen);
    const key = new Uint8Array(shared + nonShared);
    key.set(lastKey.subarray(0, shared), 0);
    key.set(keyDelta, shared);
    entries.push({ key, value });
    lastKey = key;
    pos = p3 + nonShared + valueLen;
  }
  return { entries };
}

export function findFirstGE<T>(arr: T[], lessOrEqualToTarget: (item: T) => boolean): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lessOrEqualToTarget(arr[mid]!)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
