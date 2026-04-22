/**
 * @taku128/mcstructure
 *
 * Convert Bedrock .mcstructure files (Little-Endian NBT) to Java Structure NBT.
 * Browser-compatible: consumes Uint8Array / ArrayBuffer buffers.
 *
 * For file-path (Node-only) APIs, import from `@taku128/mcstructure/node`.
 */
import nbt from 'prismarine-nbt';
import {
  mapBlock,
  buildStructureNbt,
  postProcessBlocks,
  type BlockEntry,
  type StructurePaletteEntry,
} from '@taku128/core';

export interface ConvertResult {
  /** Gzipped Java Structure NBT buffer. */
  nbt: Uint8Array;
  /** [x, y, z] dimensions. */
  size: [number, number, number];
  /** Number of non-air Java blocks. */
  blockCount: number;
  /** Unique Java block states used. */
  paletteCount: number;
}

interface BedrockRoot {
  size: { value: { value: [number, number, number] } };
  structure: {
    value: {
      block_indices: { value: { value: Array<{ value: number[] }> } };
      palette: {
        value: {
          default: {
            value: {
              block_palette: {
                value: {
                  value: Array<{
                    name?: { value: string };
                    states?: { value: Record<string, unknown> };
                  }>;
                };
              };
            };
          };
        };
      };
    };
  };
}

function unwrap(v: unknown): unknown {
  if (v && typeof v === 'object' && 'value' in v) return (v as { value: unknown }).value;
  return v;
}

function convertParsed(root: BedrockRoot): ConvertResult {
  const size = root.size.value.value;
  const blockIndices = root.structure.value.block_indices.value.value[0]!.value;
  const rawPalette = root.structure.value.palette.value.default.value.block_palette.value.value;

  const javaPaletteMap = new Map<string, number>();
  const javaPalette: StructurePaletteEntry[] = [];
  const javaBlocks: BlockEntry[] = [];

  for (let x = 0; x < size[0]; x++) {
    for (let y = 0; y < size[1]; y++) {
      for (let z = 0; z < size[2]; z++) {
        const idx = x * size[1] * size[2] + y * size[2] + z;
        const paletteIdx = blockIndices[idx]!;

        if (paletteIdx < 0 || paletteIdx >= rawPalette.length) continue;

        const entry = rawPalette[paletteIdx]!;
        const bedrockName = entry.name?.value ?? 'minecraft:air';
        if (bedrockName === 'minecraft:air') continue;

        const bedrockStates: Record<string, unknown> = {};
        const statesCompound = entry.states?.value;
        if (statesCompound && typeof statesCompound === 'object') {
          for (const [k, v] of Object.entries(statesCompound)) {
            bedrockStates[k] = unwrap(v);
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
          const pEntry: StructurePaletteEntry = { Name: javaEntry.name };
          if (propEntries.length > 0) {
            pEntry.Properties = Object.fromEntries(propEntries);
          }
          javaPalette.push(pEntry);
        }

        javaBlocks.push({ pos: [x, y, z], state: javaIdx });
      }
    }
  }

  const processed = postProcessBlocks(javaBlocks, javaPalette);

  const nbtBuffer = buildStructureNbt({
    size: [size[0], size[1], size[2]],
    palette: processed.palette,
    blocks: processed.blocks,
  });

  return {
    nbt: nbtBuffer,
    size: [size[0], size[1], size[2]],
    blockCount: javaBlocks.length,
    paletteCount: javaPalette.length,
  };
}

/**
 * Convert a .mcstructure buffer (Uint8Array / ArrayBuffer) to Java Structure NBT.
 * Works in the browser (File API → `await file.arrayBuffer()` → here).
 */
export async function convertMcstructureBuffer(
  buffer: Uint8Array | ArrayBuffer,
): Promise<ConvertResult> {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  // prismarine-nbt requires a Node Buffer under Node; its browser shim accepts Uint8Array.
  // Buffer is a Uint8Array subclass so we upgrade to Buffer when available.
  const data: Uint8Array =
    typeof Buffer !== 'undefined'
      ? (Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength) as unknown as Uint8Array)
      : u8;
  const parsed = await (nbt as unknown as {
    parse: (b: Uint8Array) => Promise<{ parsed: { value: BedrockRoot } }>;
  }).parse(data);
  return convertParsed(parsed.parsed.value);
}
