// bedrock-nbt-converter/src/post-process.js

const DIR_OFFSETS = {
  'down':  [0, -1, 0],
  'up':    [0, 1, 0],
  'north': [0, 0, -1],
  'south': [0, 0, 1],
  'west':  [-1, 0, 0],
  'east':  [1, 0, 0]
};

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let REDSTONE_CONNECTABLES = new Set();
try {
  const p = resolve(__dirname, '..', 'data', 'chunker-mappings.json');
  if (existsSync(p)) {
    const d = JSON.parse(readFileSync(p, 'utf8'));
    if (d.redstoneConnectables) {
      REDSTONE_CONNECTABLES = new Set(d.redstoneConnectables);
    }
  }
} catch (e) { /* ignore */ }

function isRedstoneConnectable(name, props, dx, dz) {
  if (name === 'minecraft:redstone_wire') return true;

  // Directional blocks (repeaters, comparators, observers) only connect on their axis
  if (name === 'minecraft:repeater' || name === 'minecraft:comparator' || name === 'minecraft:observer') {
    const facing = props?.facing;
    // dx !== 0 means the block is East or West of the dust. True if the block is on the X axis (facing east or west)
    if (dx !== 0 && (facing === 'east' || facing === 'west')) return true;
    // dz !== 0 means the block is North or South of the dust. True if the block is on the Z axis (facing north or south)
    if (dz !== 0 && (facing === 'north' || facing === 'south')) return true;
    return false;
  }

  if (REDSTONE_CONNECTABLES.has(name)) return true;
  if (name.includes('button') || name.includes('pressure_plate') || name.includes('trapdoor') || name.includes('door') || name.includes('rail')) return true;
  return false;
}

export function postProcessBlocks(blocks, palette) {
  const posMap = new Map();
  for (let i = 0; i < blocks.length; i++) {
    const [x, y, z] = blocks[i].pos;
    posMap.set(`${x},${y},${z}`, i);
  }

  const modifiedPalette = [...palette];
  const paletteMap = new Map();
  for (let i = 0; i < modifiedPalette.length; i++) {
    const e = modifiedPalette[i];
    const props = e.Properties || {};
    const propStr = Object.entries(props).sort((a,b) => a[0].localeCompare(b[0])).map(([k,v]) => `${k}=${v}`).join(',');
    paletteMap.set(`${e.Name}|${propStr}`, i);
  }

  const getOrCreatePalette = (name, props) => {
    const propStr = Object.entries(props).sort((a,b) => a[0].localeCompare(b[0])).map(([k,v]) => `${k}=${v}`).join(',');
    const key = `${name}|${propStr}`;
    let idx = paletteMap.get(key);
    if (idx === undefined) {
      idx = modifiedPalette.length;
      modifiedPalette.push({ Name: name, Properties: { ...props } });
      paletteMap.set(key, idx);
    }
    return idx;
  };

  const modifiedBlocks = [...blocks];

  const getBlockAt = (x, y, z) => {
    const idx = posMap.get(`${x},${y},${z}`);
    if (idx === undefined) return null;
    return modifiedPalette[modifiedBlocks[idx].state];
  };

  for (let i = 0; i < blocks.length; i++) {
    const stateIdx = blocks[i].state;
    const entry = modifiedPalette[stateIdx];
    const name = entry.Name;
    const [hx, hy, hz] = blocks[i].pos;

    // --- PISTON HEAD PROCESSING ---
    if (name === 'minecraft:piston_head') {
      const facing = entry.Properties?.facing;
      if (facing && DIR_OFFSETS[facing]) {
        const off = DIR_OFFSETS[facing];
        const baseX = hx - off[0], baseY = hy - off[1], baseZ = hz - off[2];
        const baseBlockIdx = posMap.get(`${baseX},${baseY},${baseZ}`);
        if (baseBlockIdx !== undefined) {
          const baseEntry = modifiedPalette[modifiedBlocks[baseBlockIdx].state];
          if (baseEntry.Name === 'minecraft:piston' || baseEntry.Name === 'minecraft:sticky_piston') {
            const extProps = { ...(baseEntry.Properties || {}), extended: 'true' };
            modifiedBlocks[baseBlockIdx].state = getOrCreatePalette(baseEntry.Name, extProps);
          }
        }
      }
    }

    // --- REDSTONE WIRE PROCESSING ---
    if (name === 'minecraft:redstone_wire') {
      const origProps = entry.Properties || {};
      const newProps = { ...origProps };

      const checkDir = (dx, dz) => {
        const sideBlock = getBlockAt(hx + dx, hy, hz + dz);
        if (sideBlock && isRedstoneConnectable(sideBlock.Name, sideBlock.Properties, dx, dz)) return 'side';

        const upBlock = getBlockAt(hx + dx, hy + 1, hz + dz);
        if (upBlock && upBlock.Name === 'minecraft:redstone_wire') return 'up';

        const downBlock = getBlockAt(hx + dx, hy - 1, hz + dz);
        if (downBlock && downBlock.Name === 'minecraft:redstone_wire') return 'side';

        return 'none';
      };

      let north = checkDir(0, -1);
      let south = checkDir(0, 1);
      let east = checkDir(1, 0);
      let west = checkDir(-1, 0);

      // Fix half-lines: if a wire has only one connection on an axis and NO perpendicular connections,
      // it should draw as a straight line across the block.
      const hasNs = north !== 'none' || south !== 'none';
      const hasEw = east !== 'none' || west !== 'none';

      if (hasNs && !hasEw) {
        if (north === 'none') north = 'side';
        if (south === 'none') south = 'side';
      } else if (hasEw && !hasNs) {
        if (east === 'none') east = 'side';
        if (west === 'none') west = 'side';
      }

      newProps.north = north;
      newProps.south = south;
      newProps.east = east;
      newProps.west = west;
      
      // If no connections, it defaults to a dot (all none), so if we want it to look connected when solitary:
      // Actually deepslate handles the rendering of crossed wires properly if we provide none, but if all are none it's a dot.
      // Bedrock connects to blocks even if we don't know they are redstone (e.g. solid blocks). But we'll use this heuristic.

      modifiedBlocks[i].state = getOrCreatePalette(name, newProps);
    }
  }

  return { blocks: modifiedBlocks, palette: modifiedPalette };
}
