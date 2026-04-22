/**
 * bedrock-converter/src/mcstructure.js
 * 
 * Convert a Bedrock .mcstructure file to Java Structure NBT.
 * Reads the Bedrock Little Endian NBT structure directly.
 */
import nbt from 'prismarine-nbt';
import fs from 'fs';
import path from 'path';
import { mapBlock } from './block-mapping.js';
import { buildStructureNbt } from './nbt-builder.js';
import { postProcessBlocks } from './post-process.js';

/**
 * Internal conversion from parsed Bedrock NBT data.
 * @param {object} root - Parsed Bedrock NBT root
 * @returns {{nbt: Buffer, size: number[], blockCount: number, paletteCount: number}}
 */
function convertParsed(root) {
  const size = root.size.value.value;          // [x, y, z]
  const blockIndices = root.structure.value.block_indices.value.value[0].value;
  const rawPalette = root.structure.value.palette.value.default.value.block_palette.value.value;

  const javaPaletteMap = new Map();
  const javaPalette = [];
  const javaBlocks = [];

  for (let x = 0; x < size[0]; x++) {
    for (let y = 0; y < size[1]; y++) {
      for (let z = 0; z < size[2]; z++) {
        const idx = x * size[1] * size[2] + y * size[2] + z;
        const paletteIdx = blockIndices[idx];

        if (paletteIdx < 0 || paletteIdx >= rawPalette.length) continue;

        const entry = rawPalette[paletteIdx];
        const bedrockName = entry.name?.value || 'minecraft:air';
        if (bedrockName === 'minecraft:air') continue;

        const bedrockStates = {};
        const statesCompound = entry.states?.value;
        if (statesCompound && typeof statesCompound === 'object') {
          for (const [k, v] of Object.entries(statesCompound)) {
            bedrockStates[k] = (typeof v === 'object' && v !== null && 'value' in v) ? v.value : v;
          }
        }

        const javaEntry = mapBlock(bedrockName, bedrockStates);
        if (javaEntry.name === 'minecraft:air') continue;

        const propEntries = Object.entries(javaEntry.properties).sort((a, b) => a[0].localeCompare(b[0]));
        const propStr = propEntries.map(([pk, pv]) => `${pk}=${pv}`).join(',');
        const stateKey = `${javaEntry.name}|${propStr}`;

        let javaIdx = javaPaletteMap.get(stateKey);
        if (javaIdx === undefined) {
          javaIdx = javaPalette.length;
          javaPaletteMap.set(stateKey, javaIdx);
          const pEntry = { Name: javaEntry.name };
          if (propEntries.length > 0) {
            pEntry.Properties = Object.fromEntries(propEntries);
          }
          javaPalette.push(pEntry);
        }

        javaBlocks.push({ pos: [x, y, z], state: javaIdx });
      }
    }
  }

  // Post-process: fix piston extended state based on adjacent piston_heads
  const processed = postProcessBlocks(javaBlocks, javaPalette);

  const nbtBuffer = buildStructureNbt({
    size: [size[0], size[1], size[2]],
    palette: processed.palette,
    blocks: processed.blocks
  });

  return {
    nbt: nbtBuffer,
    size: [size[0], size[1], size[2]],
    blockCount: javaBlocks.length,
    paletteCount: javaPalette.length
  };
}

/**
 * Convert a .mcstructure file to Java Structure NBT.
 * @param {string} inputPath - Path to .mcstructure file
 * @returns {Promise<{nbt: Buffer, size: number[], blockCount: number, paletteCount: number}>}
 */
export async function convertMcstructure(inputPath) {
  const filePath = path.resolve(inputPath);
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const rawData = fs.readFileSync(filePath);
  const parsed = await nbt.parse(rawData);
  return convertParsed(parsed.parsed.value);
}

/**
 * Convert a .mcstructure buffer to Java Structure NBT.
 * Useful when the file is provided as a Buffer (e.g., from File API in browsers).
 * @param {Buffer|Uint8Array} buffer
 * @returns {Promise<{nbt: Buffer, size: number[], blockCount: number, paletteCount: number}>}
 */
export async function convertMcstructureBuffer(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const parsed = await nbt.parse(buf);
  return convertParsed(parsed.parsed.value);
}
