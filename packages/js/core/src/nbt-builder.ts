/**
 * Java Structure NBT builder. Browser-compatible — uses deepslate for NBT
 * encoding (pako-based gzip) so no Node `zlib` / `Buffer` polyfill is needed.
 */
import {
  NbtCompound,
  NbtFile,
  NbtInt,
  NbtList,
  NbtString,
  NbtType,
} from 'deepslate/nbt';

export interface BuildStructureOptions {
  size: [number, number, number];
  palette: Array<{ Name: string; Properties?: Record<string, unknown> }>;
  blocks: Array<{ pos: [number, number, number]; state: number }>;
  /** Java data version. Defaults to 1.20.4 (3953 kept for parity with prior behaviour). */
  dataVersion?: number;
}

function intList(values: number[]): NbtList<NbtInt> {
  const list = new NbtList<NbtInt>([], NbtType.Int);
  for (const v of values) list.add(new NbtInt(v));
  return list;
}

/** Build a gzipped Java Structure NBT buffer. */
export function buildStructureNbt({
  size,
  palette,
  blocks,
  dataVersion = 3953,
}: BuildStructureOptions): Uint8Array {
  const root = new NbtCompound();

  root.set('size', intList(size));

  const paletteList = new NbtList<NbtCompound>([], NbtType.Compound);
  for (const entry of palette) {
    const pEntry = new NbtCompound();
    pEntry.set('Name', new NbtString(entry.Name));
    if (entry.Properties && Object.keys(entry.Properties).length > 0) {
      const props = new NbtCompound();
      for (const [k, v] of Object.entries(entry.Properties)) {
        props.set(k, new NbtString(String(v)));
      }
      pEntry.set('Properties', props);
    }
    paletteList.add(pEntry);
  }
  root.set('palette', paletteList);

  const blocksList = new NbtList<NbtCompound>([], NbtType.Compound);
  for (const b of blocks) {
    const bEntry = new NbtCompound();
    bEntry.set('pos', intList(b.pos));
    bEntry.set('state', new NbtInt(b.state));
    blocksList.add(bEntry);
  }
  root.set('blocks', blocksList);

  root.set('DataVersion', new NbtInt(dataVersion));

  const file = new NbtFile('', root, 'gzip', false, undefined);
  return file.write();
}
