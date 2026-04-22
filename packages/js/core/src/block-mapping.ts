/**
 * Bedrock → Java block mapping.
 *
 * Name resolution uses a 4-layer lookup (aliases → overrides → chunker → fallbacks).
 * Block-specific property conversions (torches, pistons, repeaters, redstone wire, etc.)
 * are applied afterwards.
 *
 * Mapping JSON is inlined at build time so this module works in browsers
 * without any fs access.
 */
import chunker from '../data/chunker-mappings.json' with { type: 'json' };
import overrides from '../data/overrides.json' with { type: 'json' };
import aliasesData from '../data/aliases.json' with { type: 'json' };
import fallbacks from '../data/fallbacks.json' with { type: 'json' };

export interface JavaBlockState {
  name: string;
  properties: Record<string, string>;
}

interface MappingTable {
  names?: Record<string, string>;
  flatten?: Record<string, Record<string, Record<string, string>>>;
}

interface AliasesTable {
  bedrockAliases?: Record<string, string>;
}

interface FallbacksTable {
  defaultBlock?: string;
  useIdentityFallback?: boolean;
  stripPropertiesOnFallback?: boolean;
  logUnmapped?: boolean;
}

const CHUNKER = chunker as MappingTable;
const OVERRIDES = overrides as MappingTable;
const ALIASES = aliasesData as AliasesTable;
const FALLBACKS = fallbacks as FallbacksTable;

const FLIP_DIR: Record<string, string> = {
  north: 'south', south: 'north', east: 'west', west: 'east',
};
const TRAPDOOR_DIR = ['east', 'west', 'south', 'north'];
const RAIL_SHAPE: Record<string, string> = {
  '0': 'north_south', '1': 'east_west', '2': 'ascending_east',
  '3': 'ascending_west', '4': 'ascending_north', '5': 'ascending_south',
};

const unmappedSet = new Set<string>();

/** Returns Bedrock block names that fell through every mapping layer. */
export function reportUnmapped(): string[] {
  return [...unmappedSet];
}

/** Clears the unmapped set (primarily for tests). */
export function resetUnmapped(): void {
  unmappedSet.clear();
}

function lookupFlatten(
  flatten: MappingTable['flatten'] | undefined,
  name: string,
  props: Record<string, string>,
): string | null {
  const rules = flatten?.[name];
  if (!rules) return null;
  for (const [stateKey, valueMap] of Object.entries(rules)) {
    const val = props[stateKey];
    if (val !== undefined) {
      const resolved = valueMap[String(val)];
      if (resolved) {
        delete props[stateKey];
        return resolved;
      }
    }
  }
  return null;
}

function resolveJavaName(
  bedrockName: string,
  props: Record<string, string>,
): string {
  const aliased = ALIASES.bedrockAliases?.[bedrockName];
  if (aliased) bedrockName = aliased;

  const o = lookupFlatten(OVERRIDES.flatten, bedrockName, props);
  if (o) return o;
  if (OVERRIDES.names?.[bedrockName]) return OVERRIDES.names[bedrockName];

  const c = lookupFlatten(CHUNKER.flatten, bedrockName, props);
  if (c) return c;
  if (CHUNKER.names?.[bedrockName]) return CHUNKER.names[bedrockName];

  if (FALLBACKS.logUnmapped) unmappedSet.add(bedrockName);

  if (FALLBACKS.useIdentityFallback !== false) {
    const name = 'minecraft:' + bedrockName.replace('minecraft:', '');
    if (FALLBACKS.stripPropertiesOnFallback) {
      for (const k of Object.keys(props)) delete props[k];
    }
    return name;
  }
  return FALLBACKS.defaultBlock ?? 'minecraft:stone';
}

/**
 * Map a Bedrock block name + properties to Java-compatible format.
 */
export function mapBlock(
  bedrockName: string,
  bedrockProps: Record<string, unknown> = {},
): JavaBlockState {
  const props: Record<string, string> = {};
  for (const [k, v] of Object.entries(bedrockProps)) {
    props[k] = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
  }

  // Step 1: Normalize namespaced property keys
  const nsKeys: Record<string, string> = {
    'minecraft:cardinal_direction': 'cardinal_direction',
    'minecraft:facing_direction': 'mc_facing_direction',
    'minecraft:vertical_half': 'vertical_half',
    'minecraft:block_face': 'block_face',
  };
  for (const [ns, local] of Object.entries(nsKeys)) {
    if (props[ns] !== undefined) {
      props[local] = props[ns];
      delete props[ns];
    }
  }

  // Step 2: Resolve Java name via 4-layer lookup
  let javaName = resolveJavaName(bedrockName, props);
  let shortName = javaName.replace('minecraft:', '');

  // Step 3: Basic property conversions

  if (props.facing_direction !== undefined) {
    const fMap = ['down', 'up', 'north', 'south', 'west', 'east'];
    const n = Number(props.facing_direction);
    props.facing = Number.isFinite(n) ? fMap[Math.min(5, Math.max(0, n))]! : String(props.facing_direction);
    delete props.facing_direction;
  }

  if (props.mc_facing_direction !== undefined) {
    props.facing = String(props.mc_facing_direction);
    delete props.mc_facing_direction;
  }

  if (props.cardinal_direction !== undefined) {
    props.facing = String(props.cardinal_direction);
    delete props.cardinal_direction;
  }

  if (props.pillar_axis !== undefined) {
    props.axis = props.pillar_axis;
    delete props.pillar_axis;
  }

  if (props.vertical_half !== undefined) {
    props.type = props.vertical_half === 'top' ? 'top' : 'bottom';
    delete props.vertical_half;
  }

  // Step 4: Block-specific conversions

  // Redstone torch: wall vs standing, direction INVERTED
  if (shortName === 'redstone_wall_torch' || shortName === 'redstone_torch') {
    const torchDir = props.torch_facing_direction;
    delete props.torch_facing_direction;
    const isLit = !bedrockName.includes('unlit');

    if (torchDir && torchDir !== 'top' && torchDir !== 'unknown') {
      javaName = 'minecraft:redstone_wall_torch';
      props.facing = FLIP_DIR[torchDir] ?? torchDir;
    } else {
      javaName = 'minecraft:redstone_torch';
    }
    props.lit = isLit ? 'true' : 'false';
    shortName = javaName.replace('minecraft:', '');
  }

  // Regular torch
  if (shortName === 'wall_torch' || shortName === 'torch') {
    const torchDir = props.torch_facing_direction;
    delete props.torch_facing_direction;

    if (torchDir && torchDir !== 'top' && torchDir !== 'unknown') {
      javaName = 'minecraft:wall_torch';
      props.facing = FLIP_DIR[torchDir] ?? torchDir;
    } else {
      javaName = 'minecraft:torch';
    }
    shortName = javaName.replace('minecraft:', '');
  }

  // Soul torch
  if (shortName === 'soul_wall_torch' || shortName === 'soul_torch') {
    const torchDir = props.torch_facing_direction;
    delete props.torch_facing_direction;

    if (torchDir && torchDir !== 'top' && torchDir !== 'unknown') {
      javaName = 'minecraft:soul_wall_torch';
      props.facing = FLIP_DIR[torchDir] ?? torchDir;
    } else {
      javaName = 'minecraft:soul_torch';
    }
    shortName = javaName.replace('minecraft:', '');
  }

  // Piston head
  if (shortName === 'piston_head' || shortName === 'piston_arm_collision') {
    javaName = 'minecraft:piston_head';
    shortName = 'piston_head';
    if (bedrockName.includes('sticky')) props.type = 'sticky';
    else if (!props.type) props.type = 'normal';
    if (!props.short) props.short = 'false';
    if (['north', 'south', 'east', 'west'].includes(props.facing ?? '')) {
      props.facing = FLIP_DIR[props.facing]!;
    }
  }

  // Piston / Sticky Piston
  if (shortName === 'piston' || shortName === 'sticky_piston') {
    if (props.extended === undefined) props.extended = 'false';
    if (['north', 'south', 'east', 'west'].includes(props.facing ?? '')) {
      props.facing = FLIP_DIR[props.facing]!;
    }
  }

  // Comparator
  if (shortName === 'comparator') {
    if (props.output_subtract_bit !== undefined) {
      props.mode = (props.output_subtract_bit === '1' || props.output_subtract_bit === 'true') ? 'subtract' : 'compare';
      delete props.output_subtract_bit;
    } else if (!props.mode) {
      props.mode = 'compare';
    }
    if (props.output_lit_bit !== undefined) {
      props.powered = (props.output_lit_bit === '1' || props.output_lit_bit === 'true') ? 'true' : 'false';
      delete props.output_lit_bit;
    } else {
      props.powered = (bedrockName === 'minecraft:powered_comparator') ? 'true' : 'false';
    }
  }

  // Repeater
  if (shortName === 'repeater') {
    props.powered = (bedrockName === 'minecraft:powered_repeater') ? 'true' : 'false';
    if (props.repeater_delay !== undefined) {
      props.delay = String(Number(props.repeater_delay) + 1);
      delete props.repeater_delay;
    } else if (!props.delay) {
      props.delay = '1';
    }
    if (!props.locked) props.locked = 'false';
  }

  // Observer
  if (shortName === 'observer') {
    if (props.powered_bit !== undefined) {
      props.powered = (props.powered_bit === '1' || props.powered_bit === 'true') ? 'true' : 'false';
      delete props.powered_bit;
    } else if (props.powered === undefined) {
      props.powered = 'false';
    }
  }

  // Button
  if (shortName.includes('button')) {
    if (props.button_pressed_bit !== undefined) {
      props.powered = (props.button_pressed_bit === '1' || props.button_pressed_bit === 'true') ? 'true' : 'false';
      delete props.button_pressed_bit;
    }
    if (props.facing) {
      const f = props.facing;
      if (f === 'down') { props.face = 'ceiling'; props.facing = 'north'; }
      else if (f === 'up') { props.face = 'floor'; props.facing = 'north'; }
      else { props.face = 'wall'; }
    }
  }

  // Barrel
  if (shortName === 'barrel') {
    if (props.open_bit !== undefined) {
      props.open = (props.open_bit === '1' || props.open_bit === 'true') ? 'true' : 'false';
      delete props.open_bit;
    } else if (!props.open) {
      props.open = 'false';
    }
  }

  // Dropper / Dispenser
  if (shortName === 'dropper' || shortName === 'dispenser') {
    if (props.triggered_bit !== undefined) {
      props.triggered = (props.triggered_bit === '1' || props.triggered_bit === 'true') ? 'true' : 'false';
      delete props.triggered_bit;
    }
  }

  // Hopper
  if (shortName === 'hopper') {
    if (props.toggle_bit !== undefined) {
      props.enabled = (props.toggle_bit === '0' || props.toggle_bit === 'false') ? 'true' : 'false';
      delete props.toggle_bit;
    }
  }

  // Trapdoor
  if (shortName.includes('trapdoor')) {
    if (props.direction !== undefined) {
      const idx = Number(props.direction);
      props.facing = Number.isFinite(idx) ? (TRAPDOOR_DIR[idx] ?? 'north') : 'north';
      delete props.direction;
    }
    if (props.upside_down_bit !== undefined) {
      props.half = (props.upside_down_bit === '1' || props.upside_down_bit === 'true') ? 'top' : 'bottom';
      delete props.upside_down_bit;
    }
    if (props.open_bit !== undefined) {
      props.open = (props.open_bit === '1' || props.open_bit === 'true') ? 'true' : 'false';
      delete props.open_bit;
    }
    if (!props.open) props.open = 'false';
    if (!props.half) props.half = 'bottom';
    if (!props.waterlogged) props.waterlogged = 'false';
    if (props.powered === undefined) props.powered = 'false';
  }

  // Powered / activator / detector rail
  if (shortName === 'powered_rail' || shortName === 'activator_rail' || shortName === 'detector_rail') {
    if (props.rail_direction !== undefined) {
      props.shape = RAIL_SHAPE[props.rail_direction] ?? 'north_south';
      delete props.rail_direction;
    }
    if (props.rail_data_bit !== undefined) {
      props.powered = (props.rail_data_bit === '1' || props.rail_data_bit === 'true') ? 'true' : 'false';
      delete props.rail_data_bit;
    }
    if (props.powered === undefined) props.powered = 'false';
    if (!props.waterlogged) props.waterlogged = 'false';
  }

  // Lectern
  if (shortName === 'lectern') {
    if (props.powered_bit !== undefined) {
      props.has_book = (props.powered_bit === '1' || props.powered_bit === 'true') ? 'true' : 'false';
      delete props.powered_bit;
    }
    if (props.powered === undefined) props.powered = 'false';
    if (!props.has_book) props.has_book = 'false';
  }

  // Redstone wire
  if (shortName === 'redstone_wire') {
    if (props.redstone_signal !== undefined) {
      props.power = String(props.redstone_signal);
      delete props.redstone_signal;
    }
    if (props.east === undefined) props.east = 'none';
    if (props.north === undefined) props.north = 'none';
    if (props.south === undefined) props.south = 'none';
    if (props.west === undefined) props.west = 'none';
    if (props.power === undefined) props.power = '0';
  }

  // Step 5: Final cleanup
  const finalProps: Record<string, string> = {};
  for (const [k, v] of Object.entries(props)) {
    if (k.includes('update') || k === 'age_bit' || k === 'age') continue;
    if (k.startsWith('minecraft:')) continue;
    finalProps[k] = v;
  }

  return { name: javaName, properties: finalProps };
}
