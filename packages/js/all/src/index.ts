/**
 * bedrock-nbt-converter — Node-side meta-package.
 *
 * Re-exports the split packages so existing users can keep `import 'bedrock-nbt-converter'`
 * unchanged. New code is encouraged to depend on the specific sub-packages:
 *   - @taku128/core          — mapping + NBT builder + SubChunk parser
 *   - @taku128/mcstructure   — .mcstructure → Java NBT (browser + Node)
 *   - @taku128/mcworld       — .mcworld → Java NBT (Node only)
 */

export {
  mapBlock,
  reportUnmapped,
  resetUnmapped,
  buildStructureNbt,
  parseSubChunk,
  postProcessBlocks,
} from '@taku128/core';

export type {
  JavaBlockState,
  BuildStructureOptions,
  SubChunkResult,
  SubChunkPaletteEntry,
  BlockEntry,
  StructurePaletteEntry,
} from '@taku128/core';

export { convertMcstructure, convertMcstructureBuffer } from '@taku128/mcstructure/node';
export type { ConvertResult } from '@taku128/mcstructure/node';

export { convertMcworld } from '@taku128/mcworld';
export type { ConvertMcworldOptions } from '@taku128/mcworld';
