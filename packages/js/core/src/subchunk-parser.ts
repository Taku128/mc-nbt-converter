/**
 * Raw Bedrock SubChunk parser (version 8/9).
 * Decodes palette + block indices from a raw LevelDB value.
 *
 * Browser-compatible — uses DataView instead of Node Buffer APIs.
 */

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

export interface PaletteEntry {
  name: string;
  properties: Record<string, unknown>;
}

export interface SubChunkResult {
  palette: PaletteEntry[];
  blocks: Uint16Array;
}

class NbtReader {
  private view: DataView;
  private bytes: Uint8Array;
  private decoder = new TextDecoder('utf-8');
  public pos: number;

  constructor(bytes: Uint8Array, offset: number) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = offset;
  }

  readByte(): number {
    return this.view.getUint8(this.pos++);
  }
  readSignedByte(): number {
    return this.view.getInt8(this.pos++);
  }
  readShortLE(): number {
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }
  readIntLE(): number {
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }
  readLongLE(): number {
    const v = this.view.getBigInt64(this.pos, true);
    this.pos += 8;
    return Number(v);
  }
  readFloatLE(): number {
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }
  readDoubleLE(): number {
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }
  readStringLE(): string {
    const len = this.view.getUint16(this.pos, true);
    this.pos += 2;
    const bytes = this.bytes.subarray(this.pos, this.pos + len);
    this.pos += len;
    return this.decoder.decode(bytes);
  }

  readNamedTag(): { name: string; type: number; value: unknown } | null {
    const type = this.readByte();
    if (type === TAG_END) return null;
    const name = this.readStringLE();
    const value = this.readPayload(type);
    return { name, type, value };
  }

  readCompound(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    while (this.pos < this.bytes.length) {
      const tag = this.readNamedTag();
      if (tag === null) break;
      result[tag.name] = tag.value;
    }
    return result;
  }

  readPayload(type: number): unknown {
    switch (type) {
      case TAG_BYTE: return this.readSignedByte();
      case TAG_SHORT: return this.readShortLE();
      case TAG_INT: return this.readIntLE();
      case TAG_LONG: return this.readLongLE();
      case TAG_FLOAT: return this.readFloatLE();
      case TAG_DOUBLE: return this.readDoubleLE();
      case TAG_BYTE_ARRAY: {
        const len = this.readIntLE();
        const arr = this.bytes.subarray(this.pos, this.pos + len);
        this.pos += len;
        return arr;
      }
      case TAG_STRING: return this.readStringLE();
      case TAG_LIST: {
        const listType = this.readByte();
        const listLen = this.readIntLE();
        const items: unknown[] = [];
        for (let i = 0; i < listLen; i++) {
          items.push(this.readPayload(listType));
        }
        return items;
      }
      case TAG_COMPOUND: return this.readCompound();
      case TAG_INT_ARRAY: {
        const len = this.readIntLE();
        const arr: number[] = [];
        for (let i = 0; i < len; i++) arr.push(this.readIntLE());
        return arr;
      }
      case TAG_LONG_ARRAY: {
        const len = this.readIntLE();
        const arr: number[] = [];
        for (let i = 0; i < len; i++) arr.push(this.readLongLE());
        return arr;
      }
      default:
        throw new Error(`Unknown NBT tag type: ${type}`);
    }
  }
}

function readPaletteCompound(reader: NbtReader): PaletteEntry {
  const tagType = reader.readByte();
  if (tagType !== TAG_COMPOUND) {
    throw new Error(`Expected TAG_Compound (10), got ${tagType}`);
  }
  reader.readStringLE(); // root name (usually empty)
  const compound = reader.readCompound();

  const rawName = (compound.name as string | undefined) ?? 'minecraft:air';
  const states = (compound.states as Record<string, unknown> | undefined) ?? {};
  const properties: Record<string, unknown> = {};

  if (typeof states === 'object' && !(states instanceof Uint8Array)) {
    for (const [k, v] of Object.entries(states)) {
      properties[k] = v;
    }
  }

  return {
    name: rawName.includes(':') ? rawName : 'minecraft:' + rawName,
    properties,
  };
}

function readBlockStorage(bytes: Uint8Array, offset: number): SubChunkResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = view.getUint8(offset++);
  const bitsPerBlock = header >> 1;

  if (bitsPerBlock === 0) {
    const reader = new NbtReader(bytes, offset);
    const compound = readPaletteCompound(reader);
    return {
      palette: [compound],
      blocks: new Uint16Array(4096).fill(0),
    };
  }

  const blocksPerWord = Math.floor(32 / bitsPerBlock);
  const numWords = Math.ceil(4096 / blocksPerWord);
  const mask = (1 << bitsPerBlock) - 1;

  const blocks = new Uint16Array(4096);
  let blockIndex = 0;

  for (let word = 0; word < numWords; word++) {
    if (offset + 4 > bytes.length) break;
    const value = view.getUint32(offset, true);
    offset += 4;
    for (let b = 0; b < blocksPerWord && blockIndex < 4096; b++) {
      blocks[blockIndex++] = (value >>> (bitsPerBlock * b)) & mask;
    }
  }

  if (offset + 4 > bytes.length) {
    return { palette: [{ name: 'minecraft:air', properties: {} }], blocks };
  }
  const paletteSize = view.getInt32(offset, true);
  offset += 4;

  const palette: PaletteEntry[] = [];
  const reader = new NbtReader(bytes, offset);

  for (let i = 0; i < paletteSize; i++) {
    try {
      const entry = readPaletteCompound(reader);
      palette.push(entry);
    } catch {
      palette.push({ name: 'minecraft:unknown', properties: {} });
      break;
    }
  }

  return { palette, blocks };
}

/** Parse a raw SubChunk buffer from Bedrock LevelDB. Returns null on unsupported versions. */
export function parseSubChunk(buffer: Uint8Array): SubChunkResult | null {
  if (!buffer || buffer.length === 0) return null;

  let offset = 0;
  const version = buffer[offset++]!;
  if (version < 8) return null;

  const numLayers = buffer[offset++]!;
  if (version === 9) offset++; // skip y-index byte
  if (numLayers === 0) return null;

  return readBlockStorage(buffer, offset);
}
