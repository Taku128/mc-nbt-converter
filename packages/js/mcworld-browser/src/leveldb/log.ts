import { readLengthPrefixed } from './varint.js';
import { readRecords } from './record.js';

export interface MemtableEntry {
  /** 1 = Value, 0 = Deletion */
  type: number;
  sequence: bigint;
  value: Uint8Array;
}

const TYPE_DELETION = 0;
const TYPE_VALUE = 1;

export function parseLog(file: Uint8Array): Map<string, MemtableEntry> {
  const memtable = new Map<string, MemtableEntry>();
  for (const rec of readRecords(file)) {
    if (rec.length < 12) continue;
    const view = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
    const seqLow = view.getUint32(0, true);
    const seqHigh = view.getUint32(4, true);
    let sequence = (BigInt(seqHigh) << 32n) | BigInt(seqLow);
    const count = view.getUint32(8, true);
    let pos = 12;
    for (let i = 0; i < count; i++) {
      if (pos >= rec.length) break;
      const type = rec[pos++]!;
      if (type === TYPE_VALUE) {
        const k = readLengthPrefixed(rec, pos); pos = k.pos;
        const v = readLengthPrefixed(rec, pos); pos = v.pos;
        const hex = bytesToHex(k.bytes);
        const existing = memtable.get(hex);
        if (!existing || existing.sequence < sequence) {
          memtable.set(hex, { type, sequence, value: v.bytes.slice() });
        }
      } else if (type === TYPE_DELETION) {
        const k = readLengthPrefixed(rec, pos); pos = k.pos;
        const hex = bytesToHex(k.bytes);
        const existing = memtable.get(hex);
        if (!existing || existing.sequence < sequence) {
          memtable.set(hex, { type, sequence, value: new Uint8Array(0) });
        }
      } else {
        break;
      }
      sequence += 1n;
    }
  }
  return memtable;
}

export function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) {
    const v = b[i]!;
    s += (v < 16 ? '0' : '') + v.toString(16);
  }
  return s;
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
}
