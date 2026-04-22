/**
 * bedrock-converter
 * 
 * Convert Bedrock .mcworld / .mcstructure files to Java Structure NBT format.
 * 
 * @example
 * import { convertMcstructure, convertMcworld } from 'bedrock-converter';
 * 
 * // From .mcstructure file
 * const result = await convertMcstructure('./my-build.mcstructure');
 * fs.writeFileSync('output.nbt', result.nbt);
 * 
 * // From .mcworld file with coordinate range
 * const world = await convertMcworld('./world.mcworld', {
 *   minX: -10, maxX: 10, minY: -64, maxY: 64, minZ: -10, maxZ: 10
 * });
 * fs.writeFileSync('region.nbt', world.nbt);
 */
export { convertMcworld } from './mcworld.js';
export { convertMcstructure, convertMcstructureBuffer } from './mcstructure.js';
export { mapBlock, reportUnmapped, resetUnmapped } from './block-mapping.js';

// Low-level APIs for custom chunk handling
export { parseSubChunk } from './subchunk-parser.js';
export { buildStructureNbt } from './nbt-builder.js';
