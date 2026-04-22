/**
 * @taku128/core
 *
 * Minecraft Bedrock → Java NBT conversion primitives:
 *  - Block name mapping (Chunker-derived + 4-layer override)
 *  - Java Structure NBT builder
 *  - Bedrock SubChunk parser
 *  - Post-processing (pistons + redstone wire)
 *
 * Works in browsers and Node.js — mapping data is inlined at build time and
 * gzip uses `fflate` instead of Node's `zlib`.
 */
export { mapBlock, reportUnmapped, resetUnmapped } from './block-mapping.js';
export type { JavaBlockState } from './block-mapping.js';

export { buildStructureNbt } from './nbt-builder.js';
export type { BuildStructureOptions } from './nbt-builder.js';

export { parseSubChunk } from './subchunk-parser.js';
export type { SubChunkResult, PaletteEntry as SubChunkPaletteEntry } from './subchunk-parser.js';

export { postProcessBlocks } from './post-process.js';
export type { BlockEntry, PaletteEntry as StructurePaletteEntry } from './post-process.js';
