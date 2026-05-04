import { openTable, type TableReader } from './table.js';
import { parseManifest, type SstFileMeta } from './manifest.js';
import { parseLog, bytesToHex, hexToBytes, type MemtableEntry } from './log.js';
import { userKeyOf, typeOf } from './internal-key.js';

const TYPE_VALUE = 1;

export interface LevelDBEntry {
  key: Uint8Array;
  value: Uint8Array;
}

export interface LevelDBReader {
  /** Return the latest value for `userKey`, or null if not found / deleted. */
  get(userKey: Uint8Array): Uint8Array | null;
  /** Iterate user keys (deduplicated, latest version). With `values:true` also yields values. */
  iterate(opts?: { values?: boolean }): Iterable<LevelDBEntry>;
}

function parseFileNumber(name: string, suffix: string): number | null {
  if (!name.endsWith(suffix)) return null;
  const stem = name.substring(0, name.length - suffix.length);
  if (!/^\d+$/.test(stem)) return null;
  return parseInt(stem, 10);
}

function findSstBytes(files: Map<string, Uint8Array>, fileNumber: number): Uint8Array | null {
  const padded = fileNumber.toString().padStart(6, '0');
  return files.get(`${padded}.ldb`) ?? files.get(`${padded}.sst`) ?? null;
}

function decodeCurrentFile(buf: Uint8Array): string {
  return new TextDecoder('utf-8').decode(buf).trim();
}

export function openLevelDB(files: Map<string, Uint8Array>): LevelDBReader {
  const current = files.get('CURRENT');
  if (!current) throw new Error('LevelDB: CURRENT file missing');
  const manifestName = decodeCurrentFile(current);
  const manifestBytes = files.get(manifestName);
  if (!manifestBytes) throw new Error(`LevelDB: ${manifestName} missing`);
  const state = parseManifest(manifestBytes);

  const tables: Array<{ meta: SstFileMeta; table: TableReader }> = [];
  for (const f of state.liveFiles) {
    const bytes = findSstBytes(files, f.fileNumber);
    if (!bytes) continue;
    tables.push({ meta: f, table: openTable(bytes) });
  }
  const level0 = tables
    .filter((t) => t.meta.level === 0)
    .sort((a, b) => b.meta.fileNumber - a.meta.fileNumber);
  const otherLevels = tables
    .filter((t) => t.meta.level !== 0)
    .sort((a, b) => a.meta.level - b.meta.level || a.meta.fileNumber - b.meta.fileNumber);
  const ordered = [...level0, ...otherLevels];

  const memtable = new Map<string, MemtableEntry>();
  for (const [name, bytes] of files) {
    const num = parseFileNumber(name, '.log');
    if (num === null) continue;
    if (num !== state.logNumber && num !== state.prevLogNumber) continue;
    const m = parseLog(bytes);
    for (const [hex, entry] of m) {
      const cur = memtable.get(hex);
      if (!cur || cur.sequence < entry.sequence) memtable.set(hex, entry);
    }
  }

  return {
    get(userKey: Uint8Array): Uint8Array | null {
      const hex = bytesToHex(userKey);
      const mem = memtable.get(hex);
      if (mem) return mem.type === TYPE_VALUE ? mem.value : null;
      for (const { table } of ordered) {
        const v = table.getUserKey(userKey);
        if (v !== null) return v;
      }
      return null;
    },
    *iterate(opts?: { values?: boolean }) {
      const wantValues = opts?.values !== false;
      const seen = new Set<string>();
      for (const [hex, entry] of memtable) {
        seen.add(hex);
        if (entry.type !== TYPE_VALUE) continue;
        yield { key: hexToBytes(hex), value: wantValues ? entry.value : EMPTY };
      }
      for (const { table } of ordered) {
        let lastUserHex: string | null = null;
        for (const e of table.iterate()) {
          const u = userKeyOf(e.internalKey);
          const hex = bytesToHex(u);
          if (lastUserHex === hex) continue;
          lastUserHex = hex;
          if (seen.has(hex)) continue;
          seen.add(hex);
          if (typeOf(e.internalKey) !== TYPE_VALUE) continue;
          yield { key: u, value: wantValues ? e.value : EMPTY };
        }
      }
    },
  };
}

const EMPTY = new Uint8Array(0);
