import { readVarint32, readVarint64, readLengthPrefixed } from './varint.js';
import { readRecords } from './record.js';

const TAG_COMPARATOR = 1;
const TAG_LOG_NUMBER = 2;
const TAG_NEXT_FILE_NUMBER = 3;
const TAG_LAST_SEQUENCE = 4;
const TAG_COMPACT_POINTER = 5;
const TAG_DELETED_FILE = 6;
const TAG_NEW_FILE = 7;
const TAG_PREV_LOG_NUMBER = 9;

export interface SstFileMeta {
  level: number;
  fileNumber: number;
  fileSize: number;
}

export interface ManifestState {
  logNumber: number;
  prevLogNumber: number;
  liveFiles: SstFileMeta[];
}

export function parseManifest(file: Uint8Array): ManifestState {
  let logNumber = 0;
  let prevLogNumber = 0;
  const fileMap = new Map<number, SstFileMeta>();
  const deleted = new Set<number>();
  for (const rec of readRecords(file)) {
    let pos = 0;
    while (pos < rec.length) {
      const t = readVarint32(rec, pos); pos = t.pos;
      const tag = t.value;
      if (tag === TAG_COMPARATOR) {
        const r = readLengthPrefixed(rec, pos); pos = r.pos;
      } else if (tag === TAG_LOG_NUMBER) {
        const r = readVarint64(rec, pos); pos = r.pos;
        logNumber = Number(r.value);
      } else if (tag === TAG_NEXT_FILE_NUMBER) {
        const r = readVarint64(rec, pos); pos = r.pos;
      } else if (tag === TAG_LAST_SEQUENCE) {
        const r = readVarint64(rec, pos); pos = r.pos;
      } else if (tag === TAG_COMPACT_POINTER) {
        const lvl = readVarint32(rec, pos); pos = lvl.pos;
        const r = readLengthPrefixed(rec, pos); pos = r.pos;
      } else if (tag === TAG_DELETED_FILE) {
        const lvl = readVarint32(rec, pos); pos = lvl.pos;
        const fn = readVarint64(rec, pos); pos = fn.pos;
        deleted.add(Number(fn.value));
      } else if (tag === TAG_NEW_FILE) {
        const lvl = readVarint32(rec, pos); pos = lvl.pos;
        const fn = readVarint64(rec, pos); pos = fn.pos;
        const fs = readVarint64(rec, pos); pos = fs.pos;
        const sk = readLengthPrefixed(rec, pos); pos = sk.pos;
        const lk = readLengthPrefixed(rec, pos); pos = lk.pos;
        fileMap.set(Number(fn.value), {
          level: lvl.value,
          fileNumber: Number(fn.value),
          fileSize: Number(fs.value),
        });
      } else if (tag === TAG_PREV_LOG_NUMBER) {
        const r = readVarint64(rec, pos); pos = r.pos;
        prevLogNumber = Number(r.value);
      } else {
        throw new Error(`unknown VersionEdit tag: ${tag}`);
      }
    }
  }
  for (const fn of deleted) fileMap.delete(fn);
  return {
    logNumber,
    prevLogNumber,
    liveFiles: [...fileMap.values()],
  };
}
