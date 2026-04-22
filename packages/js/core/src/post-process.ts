/**
 * Post-processing for cross-block state dependencies:
 *   - Piston: set `extended=true` when an adjacent `piston_head` faces it.
 *   - Redstone wire: resolve N/S/E/W connections by looking at neighbours.
 *
 * Pure in-memory; safe for browsers.
 */
import chunker from '../data/chunker-mappings.json' with { type: 'json' };

export interface PaletteEntry {
  Name: string;
  Properties?: Record<string, string>;
}

export interface BlockEntry {
  pos: [number, number, number];
  state: number;
}

const DIR_OFFSETS: Record<string, [number, number, number]> = {
  down: [0, -1, 0],
  up: [0, 1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  west: [-1, 0, 0],
  east: [1, 0, 0],
};

const redstoneConnectableNames: string[] =
  (chunker as unknown as { redstoneConnectables?: string[] }).redstoneConnectables ?? [];
const REDSTONE_CONNECTABLES = new Set<string>(redstoneConnectableNames);

function isRedstoneConnectable(
  name: string,
  props: Record<string, string> | undefined,
  dx: number,
  dz: number,
): boolean {
  if (name === 'minecraft:redstone_wire') return true;

  if (name === 'minecraft:repeater' || name === 'minecraft:comparator' || name === 'minecraft:observer') {
    const facing = props?.facing;
    if (dx !== 0 && (facing === 'east' || facing === 'west')) return true;
    if (dz !== 0 && (facing === 'north' || facing === 'south')) return true;
    return false;
  }

  if (REDSTONE_CONNECTABLES.has(name)) return true;
  if (
    name.includes('button') ||
    name.includes('pressure_plate') ||
    name.includes('trapdoor') ||
    name.includes('door') ||
    name.includes('rail')
  ) {
    return true;
  }
  return false;
}

export function postProcessBlocks(
  blocks: BlockEntry[],
  palette: PaletteEntry[],
): { blocks: BlockEntry[]; palette: PaletteEntry[] } {
  const posMap = new Map<string, number>();
  for (let i = 0; i < blocks.length; i++) {
    const [x, y, z] = blocks[i]!.pos;
    posMap.set(`${x},${y},${z}`, i);
  }

  const modifiedPalette: PaletteEntry[] = [...palette];
  const paletteMap = new Map<string, number>();
  for (let i = 0; i < modifiedPalette.length; i++) {
    const e = modifiedPalette[i]!;
    const props = e.Properties ?? {};
    const propStr = Object.entries(props)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    paletteMap.set(`${e.Name}|${propStr}`, i);
  }

  const getOrCreatePalette = (name: string, props: Record<string, string>): number => {
    const propStr = Object.entries(props)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    const key = `${name}|${propStr}`;
    let idx = paletteMap.get(key);
    if (idx === undefined) {
      idx = modifiedPalette.length;
      modifiedPalette.push({ Name: name, Properties: { ...props } });
      paletteMap.set(key, idx);
    }
    return idx;
  };

  const modifiedBlocks: BlockEntry[] = blocks.map((b) => ({ ...b, pos: [...b.pos] as [number, number, number] }));

  const getBlockAt = (x: number, y: number, z: number): PaletteEntry | null => {
    const idx = posMap.get(`${x},${y},${z}`);
    if (idx === undefined) return null;
    return modifiedPalette[modifiedBlocks[idx]!.state]!;
  };

  for (let i = 0; i < blocks.length; i++) {
    const stateIdx = blocks[i]!.state;
    const entry = modifiedPalette[stateIdx]!;
    const name = entry.Name;
    const [hx, hy, hz] = blocks[i]!.pos;

    // Piston head: extend the base piston
    if (name === 'minecraft:piston_head') {
      const facing = entry.Properties?.facing;
      if (facing && DIR_OFFSETS[facing]) {
        const off = DIR_OFFSETS[facing];
        const baseX = hx - off[0], baseY = hy - off[1], baseZ = hz - off[2];
        const baseBlockIdx = posMap.get(`${baseX},${baseY},${baseZ}`);
        if (baseBlockIdx !== undefined) {
          const baseEntry = modifiedPalette[modifiedBlocks[baseBlockIdx]!.state]!;
          if (baseEntry.Name === 'minecraft:piston' || baseEntry.Name === 'minecraft:sticky_piston') {
            const extProps = { ...(baseEntry.Properties ?? {}), extended: 'true' };
            modifiedBlocks[baseBlockIdx]!.state = getOrCreatePalette(baseEntry.Name, extProps);
          }
        }
      }
    }

    // Redstone wire: resolve connections
    if (name === 'minecraft:redstone_wire') {
      const origProps = entry.Properties ?? {};
      const newProps: Record<string, string> = { ...origProps };

      const checkDir = (dx: number, dz: number): string => {
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

      // Straighten single-axis lines
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

      modifiedBlocks[i]!.state = getOrCreatePalette(name, newProps);
    }
  }

  return { blocks: modifiedBlocks, palette: modifiedPalette };
}
