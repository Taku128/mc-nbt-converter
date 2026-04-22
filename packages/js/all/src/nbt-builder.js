/**
 * bedrock-converter/src/nbt-builder.js
 * 
 * Shared utility to build Java Structure NBT from a list of blocks and palette.
 */
import nbt from 'prismarine-nbt';
import zlib from 'zlib';

/**
 * Build a gzipped Java Structure NBT buffer.
 * @param {object} opts
 * @param {number[]} opts.size - [x, y, z] structure dimensions
 * @param {Array<{Name: string, Properties?: object}>} opts.palette - Java palette entries
 * @param {Array<{pos: number[], state: number}>} opts.blocks - Block positions + palette indices
 * @param {number} [opts.dataVersion=3953] - Java data version
 * @returns {Buffer} Gzipped NBT data
 */
export function buildStructureNbt({ size, palette, blocks, dataVersion = 3953 }) {
  const nbtBlocks = blocks.map(b => ({
    pos: {
      type: 'list',
      value: { type: 'int', value: b.pos }
    },
    state: { type: 'int', value: b.state }
  }));

  const nbtPalette = palette.map(entry => {
    const p = { Name: { type: 'string', value: entry.Name } };
    if (entry.Properties && Object.keys(entry.Properties).length > 0) {
      const propsCompound = {};
      for (const [k, v] of Object.entries(entry.Properties)) {
        propsCompound[k] = { type: 'string', value: String(v) };
      }
      p.Properties = { type: 'compound', value: propsCompound };
    }
    return p;
  });

  const rootObj = {
    type: 'compound',
    name: '',
    value: {
      size: { type: 'list', value: { type: 'int', value: size } },
      palette: { type: 'list', value: { type: 'compound', value: nbtPalette } },
      blocks: { type: 'list', value: { type: 'compound', value: nbtBlocks } },
      DataVersion: { type: 'int', value: dataVersion }
    }
  };

  const rawNbt = nbt.writeUncompressed(rootObj, 'big');
  return zlib.gzipSync(rawNbt);
}
