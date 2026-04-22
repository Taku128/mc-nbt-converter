/**
 * bedrock-converter/src/subchunk-parser.js
 * 
 * Raw Bedrock SubChunk parser.
 * Decodes the Bedrock SubChunk binary format with custom NBT palette reader.
 * Works with Bedrock 1.18+.
 */

// NBT Tag IDs
const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_SHORT = 2;
const TAG_INT = 3;
const TAG_LONG = 4;
const TAG_FLOAT = 5;
const TAG_DOUBLE = 6;
const TAG_BYTE_ARRAY = 7;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;
const TAG_INT_ARRAY = 11;
const TAG_LONG_ARRAY = 12;

class NbtReader {
  constructor(buffer, offset) {
    this.buf = buffer;
    this.pos = offset;
  }

  readByte() { return this.buf[this.pos++]; }
  readSignedByte() { return this.buf.readInt8(this.pos++); }
  readShortLE() { const v = this.buf.readInt16LE(this.pos); this.pos += 2; return v; }
  readIntLE() { const v = this.buf.readInt32LE(this.pos); this.pos += 4; return v; }
  readLongLE() { const v = this.buf.readBigInt64LE(this.pos); this.pos += 8; return Number(v); }
  readFloatLE() { const v = this.buf.readFloatLE(this.pos); this.pos += 4; return v; }
  readDoubleLE() { const v = this.buf.readDoubleLE(this.pos); this.pos += 8; return v; }
  readStringLE() {
    const len = this.buf.readUInt16LE(this.pos);
    this.pos += 2;
    const str = this.buf.toString('utf8', this.pos, this.pos + len);
    this.pos += len;
    return str;
  }

  readNamedTag() {
    const type = this.readByte();
    if (type === TAG_END) return null;
    const name = this.readStringLE();
    const value = this.readPayload(type);
    return { name, type, value };
  }

  readCompound() {
    const result = {};
    while (this.pos < this.buf.length) {
      const tag = this.readNamedTag();
      if (tag === null) break;
      result[tag.name] = tag.value;
    }
    return result;
  }

  readPayload(type) {
    switch (type) {
      case TAG_BYTE: return this.readSignedByte();
      case TAG_SHORT: return this.readShortLE();
      case TAG_INT: return this.readIntLE();
      case TAG_LONG: return this.readLongLE();
      case TAG_FLOAT: return this.readFloatLE();
      case TAG_DOUBLE: return this.readDoubleLE();
      case TAG_BYTE_ARRAY: {
        const len = this.readIntLE();
        const arr = this.buf.slice(this.pos, this.pos + len);
        this.pos += len;
        return arr;
      }
      case TAG_STRING: return this.readStringLE();
      case TAG_LIST: {
        const listType = this.readByte();
        const listLen = this.readIntLE();
        const items = [];
        for (let i = 0; i < listLen; i++) {
          items.push(this.readPayload(listType));
        }
        return items;
      }
      case TAG_COMPOUND: return this.readCompound();
      case TAG_INT_ARRAY: {
        const len = this.readIntLE();
        const arr = [];
        for (let i = 0; i < len; i++) arr.push(this.readIntLE());
        return arr;
      }
      case TAG_LONG_ARRAY: {
        const len = this.readIntLE();
        const arr = [];
        for (let i = 0; i < len; i++) arr.push(this.readLongLE());
        return arr;
      }
      default:
        throw new Error(`Unknown NBT tag type: ${type}`);
    }
  }
}

/**
 * Parse a raw SubChunk buffer from LevelDB.
 * @param {Buffer} buffer - Raw SubChunk data
 * @returns {{ palette: Array<{name: string, properties: object}>, blocks: Uint16Array }} | null
 */
export function parseSubChunk(buffer) {
  if (!buffer || buffer.length === 0) return null;

  let offset = 0;
  const version = buffer[offset++];

  if (version < 8) return null;

  const numLayers = buffer[offset++];
  if (version === 9) offset++; // skip y-index byte
  if (numLayers === 0) return null;

  return readBlockStorage(buffer, offset);
}

function readBlockStorage(buffer, offset) {
  const header = buffer[offset++];
  const bitsPerBlock = header >> 1;

  if (bitsPerBlock === 0) {
    const reader = new NbtReader(buffer, offset);
    const compound = readPaletteCompound(reader);
    return {
      palette: [compound],
      blocks: new Uint16Array(4096).fill(0)
    };
  }

  const blocksPerWord = Math.floor(32 / bitsPerBlock);
  const numWords = Math.ceil(4096 / blocksPerWord);
  const mask = (1 << bitsPerBlock) - 1;

  const blocks = new Uint16Array(4096);
  let blockIndex = 0;

  for (let word = 0; word < numWords; word++) {
    if (offset + 4 > buffer.length) break;
    const value = buffer.readUInt32LE(offset);
    offset += 4;
    for (let b = 0; b < blocksPerWord && blockIndex < 4096; b++) {
      blocks[blockIndex++] = (value >> (bitsPerBlock * b)) & mask;
    }
  }

  if (offset + 4 > buffer.length) {
    return { palette: [{ name: 'minecraft:air', properties: {} }], blocks };
  }
  const paletteSize = buffer.readInt32LE(offset);
  offset += 4;

  const palette = [];
  const reader = new NbtReader(buffer, offset);

  for (let i = 0; i < paletteSize; i++) {
    try {
      const entry = readPaletteCompound(reader);
      palette.push(entry);
    } catch (e) {
      palette.push({ name: 'minecraft:unknown', properties: {} });
      break;
    }
  }

  return { palette, blocks };
}

function readPaletteCompound(reader) {
  const tagType = reader.readByte();
  if (tagType !== TAG_COMPOUND) {
    throw new Error(`Expected TAG_Compound (10), got ${tagType}`);
  }
  reader.readStringLE(); // root name (usually empty)
  const compound = reader.readCompound();

  const name = compound.name || 'minecraft:air';
  const states = compound.states || {};
  const properties = {};

  if (typeof states === 'object' && !Buffer.isBuffer(states)) {
    for (const [k, v] of Object.entries(states)) {
      properties[k] = v;
    }
  }

  return {
    name: name.includes(':') ? name : 'minecraft:' + name,
    properties
  };
}
