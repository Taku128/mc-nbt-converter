/**
 * @taku128/mcstructure
 *
 * Convert Bedrock .mcstructure files (Little-Endian NBT) to Java Structure NBT.
 * Browser-compatible: consumes Uint8Array / ArrayBuffer buffers.
 *
 * Uses deepslate for both Bedrock NBT parsing and Java NBT emission — no
 * `prismarine-nbt` / Node `zlib` / Node `Buffer` dependencies.
 *
 * For file-path (Node-only) APIs, import from `@taku128/mcstructure/node`.
 */
import { NbtCompound, NbtFile, NbtList, NbtTag, NbtType } from 'deepslate/nbt';
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

function readIntTuple3(list: NbtList): [number, number, number] {
  return [list.getNumber(0), list.getNumber(1), list.getNumber(2)];
}

function simplifyStates(states: NbtCompound): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  states.forEach((key, tag) => {
    out[key] = simplifyTag(tag);
  });
  return out;
}

function simplifyTag(tag: NbtTag): unknown {
  if (tag.isNumber()) return tag.getAsNumber();
  if (tag.isString()) return tag.getAsString();
  if (tag.isCompound()) return simplifyStates(tag);
  return undefined;
}

/**
 * Read the `block_indices` list. Bedrock mcstructure stores two layers
 * (primary + waterlogging); both are int lists of length x*y*z. We only use
 * layer 0 — layer 1 is rarely meaningful for our Java target.
 */
function readLayer0(structure: NbtCompound): number[] {
  const indicesList = structure.getList('block_indices', NbtType.List);
  if (indicesList.length === 0) {
    throw new Error('[mcstructure] block_indices list is empty');
  }
  // Each layer is itself a List<Int>.
  const layer0 = indicesList.getList(0, NbtType.Int);
  const out: number[] = new Array(layer0.length);
  for (let i = 0; i < layer0.length; i++) out[i] = layer0.getNumber(i);
  return out;
}

function convertParsed(root: NbtCompound): ConvertResult {
  const sizeList = root.getList('size', NbtType.Int);
  const size = readIntTuple3(sizeList);

  const structure = root.getCompound('structure');
  const blockIndices = readLayer0(structure);

  const rawPalette = structure
    .getCompound('palette')
    .getCompound('default')
    .getList('block_palette', NbtType.Compound);

  const javaPaletteMap = new Map<string, number>();
  const javaPalette: StructurePaletteEntry[] = [];
  const javaBlocks: BlockEntry[] = [];

  for (let x = 0; x < size[0]; x++) {
    for (let y = 0; y < size[1]; y++) {
      for (let z = 0; z < size[2]; z++) {
        const idx = x * size[1] * size[2] + y * size[2] + z;
        const paletteIdx = blockIndices[idx]!;

        if (paletteIdx < 0 || paletteIdx >= rawPalette.length) continue;

        const entry = rawPalette.getCompound(paletteIdx);
        const bedrockName = entry.hasString('name')
          ? entry.getString('name')
          : 'minecraft:air';
        if (bedrockName === 'minecraft:air') continue;

        const bedrockStates: Record<string, unknown> = entry.hasCompound('states')
          ? simplifyStates(entry.getCompound('states'))
          : {};

        const javaEntry = mapBlock(bedrockName, bedrockStates);
        if (javaEntry.name === 'minecraft:air') continue;

        const propEntries = Object.entries(javaEntry.properties).sort((a, b) =>
          a[0].localeCompare(b[0]),
        );
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
  const file = NbtFile.read(u8, { littleEndian: true, compression: 'none' });
  return convertParsed(file.root);
}
