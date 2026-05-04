export interface VarintResult { value: number; pos: number }
export interface Varint64Result { value: bigint; pos: number }

export function readVarint32(buf: Uint8Array, pos: number): VarintResult {
  let result = 0;
  let shift = 0;
  for (let i = 0; i < 5; i++) {
    if (pos >= buf.length) throw new Error('varint32: out of bounds');
    const b = buf[pos++]!;
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value: result >>> 0, pos };
    shift += 7;
  }
  throw new Error('varint32: too long');
}

export function readVarint64(buf: Uint8Array, pos: number): Varint64Result {
  let result = 0n;
  let shift = 0n;
  for (let i = 0; i < 10; i++) {
    if (pos >= buf.length) throw new Error('varint64: out of bounds');
    const b = buf[pos++]!;
    result |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value: result, pos };
    shift += 7n;
  }
  throw new Error('varint64: too long');
}

export function readLengthPrefixed(buf: Uint8Array, pos: number): { bytes: Uint8Array; pos: number } {
  const { value: len, pos: p1 } = readVarint32(buf, pos);
  const end = p1 + len;
  if (end > buf.length) throw new Error('readLengthPrefixed: out of bounds');
  return { bytes: buf.subarray(p1, end), pos: end };
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const d = a[i]! - b[i]!;
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return a.length - b.length;
}
