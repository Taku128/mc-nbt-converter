import {
  mapBlock,
  parseSubChunk,
  type BlockEntry,
  type StructurePaletteEntry,
} from '@taku128/core';
import type { LevelDBReader } from './leveldb/reader.js';
import type { WorldScan } from './chunk-scan.js';
import { buildSubChunkKey } from './chunk-scan.js';

export interface ReadBlocksOptions {
  minX?: number; maxX?: number;
  minY?: number; maxY?: number;
  minZ?: number; maxZ?: number;
  dimension?: number;
}

export interface ReadBlocksResult {
  palette: StructurePaletteEntry[];
  blocks: BlockEntry[];
  bounds: {
    minX: number; minY: number; minZ: number;
    maxX: number; maxY: number; maxZ: number;
  } | null;
}

export function readBlocks(
  reader: LevelDBReader,
  scan: WorldScan,
  options: ReadBlocksOptions = {},
): ReadBlocksResult {
  const opts = {
    minX: -Infinity, maxX: Infinity,
    minY: -64, maxY: 320,
    minZ: -Infinity, maxZ: Infinity,
    dimension: 0,
    ...options,
  };
  const dimScan = scan.dimensions.get(opts.dimension);
  if (!dimScan) return { palette: [], blocks: [], bounds: null };

  const minCX = Math.floor(opts.minX / 16);
  const maxCX = Math.floor(opts.maxX / 16);
  const minCZ = Math.floor(opts.minZ / 16);
  const maxCZ = Math.floor(opts.maxZ / 16);
  const minSY = Math.floor(opts.minY / 16);
  const maxSY = Math.floor(opts.maxY / 16);

  const paletteMap = new Map<string, number>();
  const palette: StructurePaletteEntry[] = [];
  const blocks: BlockEntry[] = [];
  let bMinX = Infinity, bMinY = Infinity, bMinZ = Infinity;
  let bMaxX = -Infinity, bMaxY = -Infinity, bMaxZ = -Infinity;

  for (const chunk of dimScan.chunks.values()) {
    if (chunk.cx < minCX || chunk.cx > maxCX) continue;
    if (chunk.cz < minCZ || chunk.cz > maxCZ) continue;
    const sortedY = [...chunk.subchunkYs].sort((a, b) => a - b);
    for (const sy of sortedY) {
      if (sy < minSY || sy > maxSY) continue;
      const key = buildSubChunkKey(chunk.cx, sy, chunk.cz, opts.dimension);
      const data = reader.get(key);
      if (!data) continue;
      let result;
      try { result = parseSubChunk(data); } catch { continue; }
      if (!result) continue;
      const { palette: rawPalette, blocks: rawBlocks } = result;
      for (let idx = 0; idx < 4096; idx++) {
        const rawIdx = rawBlocks[idx]!;
        if (rawIdx >= rawPalette.length) continue;
        const entry = rawPalette[rawIdx]!;
        if (!entry || entry.name === 'minecraft:air') continue;
        const by = idx % 16;
        const bz = Math.floor(idx / 16) % 16;
        const bx = Math.floor(idx / 256);
        const worldX = chunk.cx * 16 + bx;
        const worldY = sy * 16 + by;
        const worldZ = chunk.cz * 16 + bz;
        if (worldX < opts.minX || worldX > opts.maxX) continue;
        if (worldY < opts.minY || worldY > opts.maxY) continue;
        if (worldZ < opts.minZ || worldZ > opts.maxZ) continue;
        const javaEntry = mapBlock(entry.name, entry.properties);
        const propEntries = Object.entries(javaEntry.properties)
          .sort((a, b) => a[0].localeCompare(b[0]));
        const propStr = propEntries.map(([k, v]) => `${k}=${v}`).join(',');
        const stateKey = `${javaEntry.name}|${propStr}`;
        let paletteIdx = paletteMap.get(stateKey);
        if (paletteIdx === undefined) {
          paletteIdx = palette.length;
          paletteMap.set(stateKey, paletteIdx);
          const pEntry: StructurePaletteEntry = { Name: javaEntry.name };
          if (propEntries.length > 0) pEntry.Properties = Object.fromEntries(propEntries);
          palette.push(pEntry);
        }
        blocks.push({ pos: [worldX, worldY, worldZ], state: paletteIdx });
        if (worldX < bMinX) bMinX = worldX;
        if (worldY < bMinY) bMinY = worldY;
        if (worldZ < bMinZ) bMinZ = worldZ;
        if (worldX > bMaxX) bMaxX = worldX;
        if (worldY > bMaxY) bMaxY = worldY;
        if (worldZ > bMaxZ) bMaxZ = worldZ;
      }
    }
  }

  if (blocks.length === 0) return { palette, blocks, bounds: null };
  return {
    palette,
    blocks,
    bounds: { minX: bMinX, minY: bMinY, minZ: bMinZ, maxX: bMaxX, maxY: bMaxY, maxZ: bMaxZ },
  };
}
