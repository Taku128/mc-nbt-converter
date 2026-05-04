import { inflateSync, unzlibSync } from 'fflate';
import { readVarint64, compareBytes } from './varint.js';
import { decodeBlock, findFirstGE, type BlockEntry, type DecodedBlock } from './block.js';
import { buildLookupKey, compareInternalKey, userKeyOf, typeOf } from './internal-key.js';

const TABLE_MAGIC_LO = 0x8b80fb57;
const TABLE_MAGIC_HI = 0xdb477524;

const COMPRESSION_NONE = 0;
const COMPRESSION_ZLIB = 2;
const COMPRESSION_ZLIB_RAW = 4;

const TYPE_VALUE = 1;

interface BlockHandle { offset: bigint; size: bigint }

function readBlockHandle(buf: Uint8Array, pos: number): { handle: BlockHandle; pos: number } {
  const { value: offset, pos: p1 } = readVarint64(buf, pos);
  const { value: size, pos: p2 } = readVarint64(buf, p1);
  return { handle: { offset, size }, pos: p2 };
}

function decompressBlock(payload: Uint8Array, type: number): Uint8Array {
  if (type === COMPRESSION_NONE) return payload;
  if (type === COMPRESSION_ZLIB) return unzlibSync(payload);
  if (type === COMPRESSION_ZLIB_RAW) return inflateSync(payload);
  throw new Error(`unsupported block compression type: ${type}`);
}

function readBlockBytes(file: Uint8Array, handle: BlockHandle): Uint8Array {
  const off = Number(handle.offset);
  const size = Number(handle.size);
  if (off + size + 5 > file.length) throw new Error('block extends past end of file');
  const payload = file.subarray(off, off + size);
  const type = file[off + size]!;
  return decompressBlock(payload, type);
}

export interface TableEntry {
  internalKey: Uint8Array;
  value: Uint8Array;
}

export interface TableReader {
  /**
   * Returns the value for the latest version of `userKey`, or null if not found
   * or if the latest version is a deletion tombstone.
   */
  getUserKey(userKey: Uint8Array): Uint8Array | null;
  /** Iterate every entry in the table (internal key + value), ascending. */
  iterate(): Iterable<TableEntry>;
}

export function openTable(file: Uint8Array): TableReader {
  if (file.length < 48) throw new Error('SST file too short');
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const magicLo = view.getUint32(file.length - 8, true);
  const magicHi = view.getUint32(file.length - 4, true);
  if (magicLo !== TABLE_MAGIC_LO || magicHi !== TABLE_MAGIC_HI) {
    throw new Error('SST footer magic mismatch');
  }
  let pos = file.length - 48;
  pos = readBlockHandle(file, pos).pos;
  const idx = readBlockHandle(file, pos);

  const indexRaw = readBlockBytes(file, idx.handle);
  const indexBlock = decodeBlock(indexRaw);

  const dataBlockCache = new Map<string, DecodedBlock>();
  function loadDataBlock(handle: BlockHandle): DecodedBlock {
    const cacheKey = `${handle.offset}:${handle.size}`;
    const cached = dataBlockCache.get(cacheKey);
    if (cached) return cached;
    const block = decodeBlock(readBlockBytes(file, handle));
    dataBlockCache.set(cacheKey, block);
    return block;
  }

  function findFirstGEInternal(entries: BlockEntry[], target: Uint8Array): number {
    return findFirstGE(entries, (e) => compareInternalKey(e.key, target) < 0);
  }

  return {
    getUserKey(userKey: Uint8Array): Uint8Array | null {
      const lookup = buildLookupKey(userKey);
      const idxPos = findFirstGEInternal(indexBlock.entries, lookup);
      if (idxPos >= indexBlock.entries.length) return null;
      const idxEntry = indexBlock.entries[idxPos]!;
      const { handle } = readBlockHandle(idxEntry.value, 0);
      const data = loadDataBlock(handle);
      const dataPos = findFirstGEInternal(data.entries, lookup);
      if (dataPos >= data.entries.length) return null;
      const dataEntry = data.entries[dataPos]!;
      if (compareBytes(userKeyOf(dataEntry.key), userKey) !== 0) return null;
      if (typeOf(dataEntry.key) !== TYPE_VALUE) return null;
      return dataEntry.value;
    },
    *iterate() {
      for (const idxEntry of indexBlock.entries) {
        const { handle } = readBlockHandle(idxEntry.value, 0);
        const data = decodeBlock(readBlockBytes(file, handle));
        for (const e of data.entries) yield { internalKey: e.key, value: e.value };
      }
    },
  };
}
