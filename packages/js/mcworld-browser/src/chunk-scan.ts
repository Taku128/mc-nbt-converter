import type { LevelDBReader } from './leveldb/reader.js';

const TAG_SUBCHUNK_PREFIX = 47;

export interface ChunkInfo {
  cx: number;
  cz: number;
  subchunkYs: Set<number>;
}

export interface DimensionScan {
  dimension: number;
  chunks: Map<string, ChunkInfo>;
  bbox: {
    minCX: number; maxCX: number;
    minCZ: number; maxCZ: number;
    minSY: number; maxSY: number;
  } | null;
}

export interface WorldScan {
  /** Per-dimension chunk maps (0=overworld, 1=nether, 2=end). */
  dimensions: Map<number, DimensionScan>;
}

function readInt32LE(b: Uint8Array, off: number): number {
  const view = new DataView(b.buffer, b.byteOffset + off, 4);
  return view.getInt32(0, true);
}

function readInt8(b: Uint8Array, off: number): number {
  const v = b[off]!;
  return v < 0x80 ? v : v - 0x100;
}

export function scanChunks(reader: LevelDBReader): WorldScan {
  const dims = new Map<number, DimensionScan>();
  for (const { key } of reader.iterate({ values: false })) {
    const len = key.length;
    if (len < 9) continue;
    let dim: number, tagByte: number, sy: number;
    let cx: number, cz: number;
    if (len === 9 || len === 10) {
      dim = 0;
      cx = readInt32LE(key, 0);
      cz = readInt32LE(key, 4);
      tagByte = key[8]!;
      if (tagByte !== TAG_SUBCHUNK_PREFIX) continue;
      if (len !== 10) continue;
      sy = readInt8(key, 9);
    } else if (len === 13 || len === 14) {
      cx = readInt32LE(key, 0);
      cz = readInt32LE(key, 4);
      dim = readInt32LE(key, 8);
      tagByte = key[12]!;
      if (tagByte !== TAG_SUBCHUNK_PREFIX) continue;
      if (len !== 14) continue;
      sy = readInt8(key, 13);
    } else {
      continue;
    }
    let dimScan = dims.get(dim);
    if (!dimScan) {
      dimScan = { dimension: dim, chunks: new Map(), bbox: null };
      dims.set(dim, dimScan);
    }
    const posKey = `${cx},${cz}`;
    let info = dimScan.chunks.get(posKey);
    if (!info) {
      info = { cx, cz, subchunkYs: new Set() };
      dimScan.chunks.set(posKey, info);
    }
    info.subchunkYs.add(sy);
  }
  for (const dimScan of dims.values()) {
    let minCX = Infinity, maxCX = -Infinity;
    let minCZ = Infinity, maxCZ = -Infinity;
    let minSY = Infinity, maxSY = -Infinity;
    for (const c of dimScan.chunks.values()) {
      if (c.cx < minCX) minCX = c.cx;
      if (c.cx > maxCX) maxCX = c.cx;
      if (c.cz < minCZ) minCZ = c.cz;
      if (c.cz > maxCZ) maxCZ = c.cz;
      for (const sy of c.subchunkYs) {
        if (sy < minSY) minSY = sy;
        if (sy > maxSY) maxSY = sy;
      }
    }
    if (dimScan.chunks.size > 0) {
      dimScan.bbox = { minCX, maxCX, minCZ, maxCZ, minSY, maxSY };
    }
  }
  return { dimensions: dims };
}

export function buildSubChunkKey(cx: number, cy: number, cz: number, dim: number): Uint8Array {
  if (dim) {
    const buf = new Uint8Array(14);
    const view = new DataView(buf.buffer);
    view.setInt32(0, cx, true);
    view.setInt32(4, cz, true);
    view.setInt32(8, dim, true);
    buf[12] = TAG_SUBCHUNK_PREFIX;
    view.setInt8(13, cy);
    return buf;
  }
  const buf = new Uint8Array(10);
  const view = new DataView(buf.buffer);
  view.setInt32(0, cx, true);
  view.setInt32(4, cz, true);
  buf[8] = TAG_SUBCHUNK_PREFIX;
  view.setInt8(9, cy);
  return buf;
}
