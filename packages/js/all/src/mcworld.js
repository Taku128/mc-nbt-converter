/**
 * bedrock-converter/src/mcworld.js
 * 
 * Convert a Bedrock .mcworld file to Java Structure NBT.
 * Extracts SubChunk data from the embedded LevelDB.
 */
import AdmZip from 'adm-zip';
import { LevelDB } from 'leveldb-zlib';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseSubChunk } from './subchunk-parser.js';
import { mapBlock } from './block-mapping.js';
import { buildStructureNbt } from './nbt-builder.js';
import { postProcessBlocks } from './post-process.js';

const TAG_SUBCHUNK_PREFIX = 47;

function extractMcworld(mcworldPath) {
  const zip = new AdmZip(mcworldPath);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcworld-'));
  zip.extractAllTo(tmpDir, true);
  return tmpDir;
}

function findDbDir(extractedDir) {
  const dbDir = path.join(extractedDir, 'db');
  if (fs.existsSync(dbDir)) return dbDir;
  for (const sub of fs.readdirSync(extractedDir)) {
    const candidate = path.join(extractedDir, sub, 'db');
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Could not find db/ directory in .mcworld');
}

function buildSubChunkKey(x, y, z, dimId) {
  if (dimId) {
    const buf = Buffer.alloc(14);
    buf.writeInt32LE(x, 0);
    buf.writeInt32LE(z, 4);
    buf.writeInt32LE(dimId, 8);
    buf.writeUInt8(TAG_SUBCHUNK_PREFIX, 12);
    buf.writeInt8(y, 13);
    return buf;
  }
  const buf = Buffer.alloc(10);
  buf.writeInt32LE(x, 0);
  buf.writeInt32LE(z, 4);
  buf.writeUInt8(TAG_SUBCHUNK_PREFIX, 8);
  buf.writeInt8(y, 9);
  return buf;
}

async function dbGet(db, key) {
  try { return await db.get(key); }
  catch { return null; }
}

async function enumerateChunks(db, dimension) {
  const chunks = new Map();
  for await (const [key] of db.getIterator({ values: false })) {
    const len = key.length;
    if (len < 9) continue;
    const cx = key.readInt32LE(0);
    const cz = key.readInt32LE(4);
    const isOverworld = (len === 9 || len === 10);
    const isOtherDim = (len === 13 || len === 14);
    let tagByte, dim;
    if (isOverworld) { tagByte = key[8]; dim = 0; }
    else if (isOtherDim) { dim = key.readInt32LE(8); tagByte = key[12]; }
    else continue;
    if (dim !== dimension) continue;
    const posKey = `${cx},${cz}`;
    if (tagByte === TAG_SUBCHUNK_PREFIX) {
      const cy = isOverworld ? key.readInt8(9) : key.readInt8(13);
      if (!chunks.has(posKey)) chunks.set(posKey, { x: cx, z: cz, subchunks: new Set() });
      chunks.get(posKey).subchunks.add(cy);
    }
  }
  return chunks;
}

/**
 * Convert a .mcworld file to Java Structure NBT.
 * @param {string} inputPath - Path to .mcworld file
 * @param {object} [options]
 * @param {number} [options.minX=-Infinity]
 * @param {number} [options.maxX=Infinity]
 * @param {number} [options.minY=-64]
 * @param {number} [options.maxY=320]
 * @param {number} [options.minZ=-Infinity]
 * @param {number} [options.maxZ=Infinity]
 * @param {number} [options.dimension=0] - 0=overworld, 1=nether, 2=end
 * @returns {Promise<{nbt: Buffer, size: number[], blockCount: number, paletteCount: number}>}
 */
export async function convertMcworld(inputPath, options = {}) {
  const opts = {
    minX: -Infinity, maxX: Infinity,
    minY: -64, maxY: 320,
    minZ: -Infinity, maxZ: Infinity,
    dimension: 0,
    ...options
  };

  const mcworldPath = path.resolve(inputPath);
  if (!fs.existsSync(mcworldPath)) throw new Error(`File not found: ${mcworldPath}`);

  const extractedDir = extractMcworld(mcworldPath);
  const dbDir = findDbDir(extractedDir);

  const db = new LevelDB(dbDir);
  await db.open();

  const chunks = await enumerateChunks(db, opts.dimension);

  const minCX = Math.floor(opts.minX / 16);
  const maxCX = Math.floor(opts.maxX / 16);
  const minCZ = Math.floor(opts.minZ / 16);
  const maxCZ = Math.floor(opts.maxZ / 16);
  const minSY = Math.floor(opts.minY / 16);
  const maxSY = Math.floor(opts.maxY / 16);

  const filtered = [...chunks.values()].filter(c =>
    c.x >= minCX && c.x <= maxCX && c.z >= minCZ && c.z <= maxCZ
  );

  if (filtered.length === 0) {
    await db.close();
    throw new Error('No chunks in specified range');
  }

  const paletteMap = new Map();
  const finalPalette = [];
  const finalBlocks = [];
  let actualMinX = Infinity, actualMinY = Infinity, actualMinZ = Infinity;
  let actualMaxX = -Infinity, actualMaxY = -Infinity, actualMaxZ = -Infinity;

  for (const { x, z, subchunks } of filtered) {
    const sortedY = [...subchunks].sort((a, b) => a - b);

    for (const sectionY of sortedY) {
      if (sectionY < minSY || sectionY > maxSY) continue;

      const key = buildSubChunkKey(x, sectionY, z, opts.dimension);
      const data = await dbGet(db, key);
      if (!data) continue;

      let result;
      try { result = parseSubChunk(data); } catch { continue; }
      if (!result) continue;

      const { palette: rawPalette, blocks: rawBlocks } = result;

      for (let idx = 0; idx < 4096; idx++) {
        const rawIdx = rawBlocks[idx];
        if (rawIdx >= rawPalette.length) continue;

        const entry = rawPalette[rawIdx];
        if (!entry || entry.name === 'minecraft:air') continue;

        // YZX order (confirmed correct for Bedrock SubChunks)
        const by = idx % 16;
        const bz = Math.floor(idx / 16) % 16;
        const bx = Math.floor(idx / 256);

        const worldX = (x * 16) + bx;
        const worldY = (sectionY * 16) + by;
        const worldZ = (z * 16) + bz;

        if (worldX < opts.minX || worldX > opts.maxX) continue;
        if (worldY < opts.minY || worldY > opts.maxY) continue;
        if (worldZ < opts.minZ || worldZ > opts.maxZ) continue;

        const javaEntry = mapBlock(entry.name, entry.properties);

        const propEntries = Object.entries(javaEntry.properties).sort((a, b) => a[0].localeCompare(b[0]));
        const propStr = propEntries.map(([pk, pv]) => `${pk}=${pv}`).join(',');
        const stateKey = `${javaEntry.name}|${propStr}`;

        let paletteIdx = paletteMap.get(stateKey);
        if (paletteIdx === undefined) {
          paletteIdx = finalPalette.length;
          paletteMap.set(stateKey, paletteIdx);
          const pEntry = { Name: javaEntry.name };
          if (propEntries.length > 0) {
            pEntry.Properties = Object.fromEntries(propEntries);
          }
          finalPalette.push(pEntry);
        }

        finalBlocks.push({ pos: [worldX, worldY, worldZ], state: paletteIdx });

        if (worldX < actualMinX) actualMinX = worldX;
        if (worldY < actualMinY) actualMinY = worldY;
        if (worldZ < actualMinZ) actualMinZ = worldZ;
        if (worldX > actualMaxX) actualMaxX = worldX;
        if (worldY > actualMaxY) actualMaxY = worldY;
        if (worldZ > actualMaxZ) actualMaxZ = worldZ;
      }
    }
  }

  await db.close();

  if (finalBlocks.length === 0) {
    throw new Error('No blocks found in specified range');
  }

  // Shift to 0,0,0 origin
  const sizeX = actualMaxX - actualMinX + 1;
  const sizeY = actualMaxY - actualMinY + 1;
  const sizeZ = actualMaxZ - actualMinZ + 1;

  const shiftedBlocks = finalBlocks.map(b => ({
    pos: [b.pos[0] - actualMinX, b.pos[1] - actualMinY, b.pos[2] - actualMinZ],
    state: b.state
  }));

  // Post-process: fix piston extended state
  const processed = postProcessBlocks(shiftedBlocks, finalPalette);

  const nbtBuffer = buildStructureNbt({
    size: [sizeX, sizeY, sizeZ],
    palette: processed.palette,
    blocks: processed.blocks
  });

  return {
    nbt: nbtBuffer,
    size: [sizeX, sizeY, sizeZ],
    blockCount: finalBlocks.length,
    paletteCount: finalPalette.length
  };
}
