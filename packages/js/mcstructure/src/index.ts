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
import { NbtCompound, NbtFile, NbtIntArray, NbtList, NbtTag, NbtType } from 'deepslate/nbt';
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
 * (primary + waterlogging) of length x*y*z. We only use layer 0 — layer 1 is
 * rarely meaningful for our Java target.
 *  - format_version 1: each layer is a List<Int>
 *  - format_version 2 (Bedrock 26.50+): each layer is an IntArray, and layer 1
 *    is left out when nothing is stored in it
 */
function readLayer0(structure: NbtCompound): number[] {
  const indicesList = structure.getList('block_indices');
  if (indicesList.length === 0) {
    throw new Error('[mcstructure] block_indices list is empty');
  }
  if (indicesList.getType() === NbtType.IntArray) {
    const first = indicesList.get(0);
    if (!(first instanceof NbtIntArray)) {
      throw new Error('[mcstructure] block_indices layer 0 is not an IntArray');
    }
    return first.toSimplifiedJson();
  }
  // Each layer is itself a List<Int>.
  const layer0 = indicesList.getList(0, NbtType.Int);
  const out: number[] = new Array(layer0.length);
  for (let i = 0; i < layer0.length; i++) out[i] = layer0.getNumber(i);
  return out;
}

/**
 * Upper limit for the inflated size of a compressed `structure`. Even the
 * largest Bedrock structure (64×384×64) stores about 12.6 MB of
 * `block_indices` (two IntArray layers), so this leaves plenty of room while
 * stopping a small file that inflates without bound (zip bomb).
 */
const MAX_INFLATED_STRUCTURE_BYTES = 64 * 1024 * 1024;

/** Inflate zlib (RFC 1950) data, giving up past `limit` bytes. */
async function inflateZlib(data: Uint8Array, limit: number): Promise<Uint8Array> {
  // DecompressionStream's 'deflate' is the zlib format. Available in browsers
  // and Node 18+.
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error(`[mcstructure] structure inflates past ${limit} bytes`);
      }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('[mcstructure]')) throw e;
    throw new Error(`[mcstructure] structure is not valid zlib data: ${e instanceof Error ? e.message : String(e)}`);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/**
 * The root's `structure` compound.
 *  - no `compression`, or 0 (up to Bedrock 26.50): `structure` is a compound
 *  - `compression` 1 (Bedrock 26.60+): `structure` is a ByteArray holding the
 *    compound as little-endian NBT (empty root name), zlib-compressed. Its
 *    contents are format_version 1 or 2 like an uncompressed one
 */
async function readStructure(root: NbtCompound): Promise<NbtCompound> {
  const tag = root.get('structure');
  if (tag === undefined || !tag.isByteArray()) {
    return root.getCompound('structure');
  }
  const compression = root.hasNumber('compression') ? root.getNumber('compression') : 0;
  if (compression !== 1) {
    throw new Error(`[mcstructure] unknown structure compression ${compression}`);
  }
  const packed = Uint8Array.from(tag.getItems(), (b) => b.getAsNumber() & 0xff);
  const inner = await inflateZlib(packed, MAX_INFLATED_STRUCTURE_BYTES);
  return NbtFile.read(inner, { littleEndian: true, compression: 'none' }).root;
}

function convertParsed(root: NbtCompound, structure: NbtCompound): ConvertResult {
  const sizeList = root.getList('size', NbtType.Int);
  const size = readIntTuple3(sizeList);

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
  return convertParsed(file.root, await readStructure(file.root));
}
