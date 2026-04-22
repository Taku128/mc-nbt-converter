/**
 * bedrock-nbt-converter — Node-side meta-package.
 *
 * Re-exports the split packages so existing users can keep `import 'bedrock-nbt-converter'`
 * unchanged. New code is encouraged to depend on the specific sub-packages:
 *   - @mc-nbt/core          — mapping + NBT builder + SubChunk parser
 *   - @mc-nbt/mcstructure   — .mcstructure → Java NBT (browser + Node)
 *   - @mc-nbt/mcworld       — .mcworld → Java NBT (Node only)
 */

export {
  mapBlock,
  reportUnmapped,
  resetUnmapped,
  buildStructureNbt,
  parseSubChunk,
  postProcessBlocks,
} from '@mc-nbt/core';

export type {
  JavaBlockState,
  BuildStructureOptions,
  SubChunkResult,
  SubChunkPaletteEntry,
  BlockEntry,
  StructurePaletteEntry,
} from '@mc-nbt/core';

export { convertMcstructure, convertMcstructureBuffer } from '@mc-nbt/mcstructure/node';
export type { ConvertResult } from '@mc-nbt/mcstructure/node';

export { convertMcworld } from '@mc-nbt/mcworld';
export type { ConvertMcworldOptions } from '@mc-nbt/mcworld';
