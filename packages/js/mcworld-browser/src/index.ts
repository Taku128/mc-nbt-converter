/**
 * @taku128/mcworld-browser
 *
 * Browser-only Bedrock .mcworld → Java Structure NBT converter.
 * Pure JavaScript — no native LevelDB binding required.
 */

import { buildStructureNbt, postProcessBlocks, type BlockEntry } from '@taku128/core';
import { extractDbFiles } from './zip.js';
import { openLevelDB, type LevelDBReader } from './leveldb/reader.js';
import { scanChunks, type WorldScan, type DimensionScan } from './chunk-scan.js';
import { readBlocks, type ReadBlocksOptions, type ReadBlocksResult } from './read-blocks.js';

export type { LevelDBReader, LevelDBEntry } from './leveldb/reader.js';
export type { WorldScan, DimensionScan, ChunkInfo } from './chunk-scan.js';
export type { ReadBlocksOptions, ReadBlocksResult } from './read-blocks.js';
export { openLevelDB } from './leveldb/reader.js';
export { extractDbFiles } from './zip.js';

export interface WorldHandle {
  scan: WorldScan;
  readBlocks(opts?: ReadBlocksOptions): ReadBlocksResult;
  convertRange(opts?: ReadBlocksOptions): ConvertRangeResult;
  /** Lower-level access if needed. */
  reader: LevelDBReader;
}

export interface ConvertRangeResult {
  nbt: Uint8Array;
  size: [number, number, number];
  blockCount: number;
  paletteCount: number;
}

export function openMcworld(zipBytes: Uint8Array): WorldHandle {
  const files = extractDbFiles(zipBytes);
  if (files.size === 0) throw new Error('No db/ files found in .mcworld');
  const reader = openLevelDB(files);
  const scan = scanChunks(reader);
  return {
    scan,
    reader,
    readBlocks(opts?: ReadBlocksOptions): ReadBlocksResult {
      return readBlocks(reader, scan, opts);
    },
    convertRange(opts?: ReadBlocksOptions): ConvertRangeResult {
      const { palette, blocks, bounds } = readBlocks(reader, scan, opts);
      if (!bounds || blocks.length === 0) {
        throw new Error('No blocks in specified range');
      }
      const sizeX = bounds.maxX - bounds.minX + 1;
      const sizeY = bounds.maxY - bounds.minY + 1;
      const sizeZ = bounds.maxZ - bounds.minZ + 1;
      const shifted: BlockEntry[] = blocks.map((b) => ({
        pos: [b.pos[0] - bounds.minX, b.pos[1] - bounds.minY, b.pos[2] - bounds.minZ],
        state: b.state,
      }));
      const processed = postProcessBlocks(shifted, palette);
      const nbt = buildStructureNbt({
        size: [sizeX, sizeY, sizeZ],
        palette: processed.palette,
        blocks: processed.blocks,
      });
      return { nbt, size: [sizeX, sizeY, sizeZ], blockCount: blocks.length, paletteCount: palette.length };
    },
  };
}
