/**
 * Java Structure NBT builder. Browser-compatible — uses `fflate` for gzip
 * instead of Node's `zlib` module.
 */
import nbt from 'prismarine-nbt';
import { gzipSync } from 'fflate';

export interface BuildStructureOptions {
  size: [number, number, number];
  palette: Array<{ Name: string; Properties?: Record<string, unknown> }>;
  blocks: Array<{ pos: [number, number, number]; state: number }>;
  /** Java data version. Defaults to 1.20.4 (3700). */
  dataVersion?: number;
}

/** Build a gzipped Java Structure NBT buffer. */
export function buildStructureNbt({
  size,
  palette,
  blocks,
  dataVersion = 3953,
}: BuildStructureOptions): Uint8Array {
  const nbtBlocks = blocks.map((b) => ({
    pos: {
      type: 'list',
      value: { type: 'int', value: b.pos },
    },
    state: { type: 'int', value: b.state },
  }));

  const nbtPalette = palette.map((entry) => {
    const p: Record<string, unknown> = {
      Name: { type: 'string', value: entry.Name },
    };
    if (entry.Properties && Object.keys(entry.Properties).length > 0) {
      const propsCompound: Record<string, { type: 'string'; value: string }> = {};
      for (const [k, v] of Object.entries(entry.Properties)) {
        propsCompound[k] = { type: 'string', value: String(v) };
      }
      p.Properties = { type: 'compound', value: propsCompound };
    }
    return p;
  });

  const rootObj = {
    type: 'compound' as const,
    name: '',
    value: {
      size: { type: 'list', value: { type: 'int', value: size } },
      palette: { type: 'list', value: { type: 'compound', value: nbtPalette } },
      blocks: { type: 'list', value: { type: 'compound', value: nbtBlocks } },
      DataVersion: { type: 'int', value: dataVersion },
    },
  };

  // prismarine-nbt returns a Buffer (Node) or Uint8Array (browser shim).
  const rawNbt = nbt.writeUncompressed(rootObj as never, 'big');
  return gzipSync(new Uint8Array(rawNbt));
}
