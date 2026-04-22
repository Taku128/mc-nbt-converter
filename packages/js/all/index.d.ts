// bedrock-nbt-converter/index.d.ts

// A minimal Buffer interface for return types so ts compilation passes without strict Node typings globally
export interface Buffer extends Uint8Array {
    readInt32LE(offset?: number): number;
    writeInt32LE(value: number, offset?: number): number;
}

export interface ConvertMcworldOptions {
    /** Minimum X coordinate to extract (inclusive) */
    minX?: number;
    /** Maximum X coordinate to extract (inclusive) */
    maxX?: number;
    /** Minimum Y coordinate to extract (inclusive) */
    minY?: number;
    /** Maximum Y coordinate to extract (inclusive) */
    maxY?: number;
    /** Minimum Z coordinate to extract (inclusive) */
    minZ?: number;
    /** Maximum Z coordinate to extract (inclusive) */
    maxZ?: number;
    /** Dimension ID (0=Overworld, 1=Nether, 2=The End). Default is 0. */
    dimension?: number;
}

export interface ConvertResult {
    /** Gzipped Java Structure NBT buffer */
    nbt: Buffer;
    /** The dimensions of the extracted area [x, y, z] */
    size: [number, number, number];
    /** The total number of valid mapped blocks */
    blockCount: number;
    /** The total number of unique Java block states used */
    paletteCount: number;
}

export interface JavaBlockState {
    name: string;
    properties: Record<string, string>;
}

export interface SubChunkResult {
    /** The list of discrete Minecraft block states found in this SubChunk */
    palette: Array<{ name: string; properties: Record<string, any> }>;
    /** A 4096-length array mapping SubChunk coordinates (X, Y, Z) to palette indices */
    blocks: Uint16Array;
}

/**
 * Convert a .mcworld file (or directory) into a Java Structure NBT buffer.
 */
export function convertMcworld(inputPath: string, options?: ConvertMcworldOptions): Promise<ConvertResult>;

/**
 * Convert a .mcstructure file into a Java Structure NBT buffer.
 */
export function convertMcstructure(inputPath: string): Promise<ConvertResult>;

/**
 * Convert a raw .mcstructure file buffer into a Java Structure NBT buffer.
 */
export function convertMcstructureBuffer(buffer: Buffer): Promise<ConvertResult>;

/**
 * Maps a Bedrock block name and its block states to a valid Java Edition block name and properties.
 */
export function mapBlock(bedrockName: string, bedrockStates: Record<string, any>): JavaBlockState;

/**
 * Returns Bedrock block names that fell through every mapping layer and were resolved
 * by the fallback (identity or defaultBlock). Useful for coverage tests.
 */
export function reportUnmapped(): string[];

/**
 * Clears the unmapped-name accumulator. Primarily used in tests.
 */
export function resetUnmapped(): void;

/**
 * Low-level API: Parses a binary Buffer of a Bedrock SubChunk (from LevelDB) into a usable palette and block array.
 */
export function parseSubChunk(buffer: Buffer): SubChunkResult | null;

export interface BuildStructureOptions {
    size: [number, number, number];
    palette: Array<{ Name: string; Properties?: Record<string, any> }>;
    blocks: Array<{ pos: [number, number, number]; state: number }>;
    dataVersion?: number;
}

/**
 * Low-level API: Builds and gzips a standard Java Structure NBT out of raw sizes, palettes, and block position data.
 */
export function buildStructureNbt(opts: BuildStructureOptions): Buffer;
