/**
 * Bedrock → Java block mapping.
 *
 * Name resolution uses a 4-layer lookup (aliases → overrides → chunker → fallbacks).
 * Block-state property conversions are DATA-DRIVEN: shared/mappings/state-rules.json
 * declares a `common` pass (generic key conversions) plus per-block `rules`, applied
 * by a small op engine. Rules match on the alias-applied Bedrock name (first match in
 * declaration order wins). This keeps the JS and Go implementations reading the same
 * JSON instead of duplicating hand-written branches.
 *
 * Neighbour-dependent state (redstone_wire connections, piston `extended` resolved from
 * the actual adjacent block) stays in post-process.ts — it is out of scope for a
 * per-block rule table.
 *
 * Mapping JSON is inlined at build time so this module works in browsers without fs.
 */
import chunker from '../data/chunker-mappings.json' with { type: 'json' };
import overrides from '../data/overrides.json' with { type: 'json' };
import aliasesData from '../data/aliases.json' with { type: 'json' };
import fallbacks from '../data/fallbacks.json' with { type: 'json' };
import stateRulesData from '../data/state-rules.json' with { type: 'json' };

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

// --- state-rules.json shapes ---
type MapValue = string | Record<string, string>;
interface Op {
  map?: { from: string; to?: string; default?: string; keepUnmapped?: boolean; values: Record<string, MapValue> };
  mapBool?: { from: string; to: string; invert?: boolean };
  rename?: { from: string; to: string };
  set?: Record<string, string>;
  setDefault?: Record<string, string>;
  drop?: string[];
  setName?: string;
  wallVariant?: { from: string; wall: string; standing: string; flip?: boolean };
}
interface StateRules {
  common: { keyAliases?: Record<string, string>; ops?: Op[]; dropKeys?: string[] };
  rules: { match: string; ops: Op[] }[];
}

const CHUNKER = chunker as MappingTable;
const OVERRIDES = overrides as MappingTable;
const ALIASES = aliasesData as AliasesTable;
const FALLBACKS = fallbacks as FallbacksTable;
const STATE_RULES = stateRulesData as StateRules;

const FLIP_DIR: Record<string, string> = {
  north: 'south', south: 'north', east: 'west', west: 'east',
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

// ---------------------------------------------------------------------------
// data-driven op engine
// ---------------------------------------------------------------------------

const asBool = (v: string): boolean => v === '1' || v === 'true';

/** Wildcard match: '*' matches any run of characters. No other metacharacters. */
function wildcardMatch(pattern: string, name: string): boolean {
  if (!pattern.includes('*')) return pattern === name;
  const parts = pattern.split('*');
  let idx = 0;
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i]!;
    if (seg === '') continue;
    if (i === 0) {
      if (!name.startsWith(seg)) return false;
      idx = seg.length;
    } else if (i === parts.length - 1) {
      return name.slice(idx).endsWith(seg);
    } else {
      const found = name.indexOf(seg, idx);
      if (found === -1) return false;
      idx = found + seg.length;
    }
  }
  return true;
}

/** Applies one op to the mutable state (props + name). Returns the (possibly new) name. */
function applyOp(op: Op, props: Record<string, string>, name: string): string {
  if (op.rename) {
    const { from, to } = op.rename;
    if (props[from] !== undefined) {
      props[to] = props[from]!;
      delete props[from];
    }
    return name;
  }
  if (op.map) {
    const { from, to, values, keepUnmapped, default: def } = op.map;
    const raw = props[from];
    if (raw === undefined) return name;
    const hit = values[raw];
    if (hit !== undefined) {
      delete props[from];
      if (typeof hit === 'string') {
        if (to) props[to] = hit;
      } else {
        for (const [k, v] of Object.entries(hit)) props[k] = v;
      }
    } else if (keepUnmapped) {
      if (to && to !== from) {
        props[to] = raw;
        delete props[from];
      }
      // to omitted or to === from: leave raw in place
    } else if (def !== undefined && to) {
      delete props[from];
      props[to] = def;
    }
    return name;
  }
  if (op.mapBool) {
    const { from, to, invert } = op.mapBool;
    if (props[from] !== undefined) {
      let b = asBool(props[from]!);
      if (invert) b = !b;
      delete props[from];
      props[to] = b ? 'true' : 'false';
    }
    return name;
  }
  if (op.set) {
    for (const [k, v] of Object.entries(op.set)) props[k] = v;
    return name;
  }
  if (op.setDefault) {
    for (const [k, v] of Object.entries(op.setDefault)) if (props[k] === undefined) props[k] = v;
    return name;
  }
  if (op.drop) {
    for (const k of op.drop) delete props[k];
    return name;
  }
  if (op.setName) return op.setName;
  if (op.wallVariant) {
    const { from, wall, standing, flip } = op.wallVariant;
    const dir = props[from];
    delete props[from];
    if (dir && dir !== 'top' && dir !== 'unknown') {
      props.facing = flip ? (FLIP_DIR[dir] ?? dir) : dir;
      return wall;
    }
    return standing;
  }
  return name;
}

function applyOps(ops: Op[], props: Record<string, string>, name: string): string {
  for (const op of ops) name = applyOp(op, props, name);
  return name;
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

  // Step 1: normalize namespaced property keys (common.keyAliases)
  const keyAliases = STATE_RULES.common.keyAliases ?? {};
  for (const [ns, local] of Object.entries(keyAliases)) {
    if (props[ns] !== undefined) {
      props[local] = props[ns]!;
      delete props[ns];
    }
  }

  // Step 2: resolve the Java name (4-layer). The rule match uses the alias-applied
  // Bedrock name, which is also what resolveJavaName consumes.
  const matchName = ALIASES.bedrockAliases?.[bedrockName] ?? bedrockName;
  let javaName = resolveJavaName(matchName, props);

  // Step 3: common generic conversions
  javaName = applyOps(STATE_RULES.common.ops ?? [], props, javaName);

  // Step 4: first matching per-block rule (declaration order)
  for (const rule of STATE_RULES.rules) {
    if (wildcardMatch(rule.match, matchName)) {
      javaName = applyOps(rule.ops, props, javaName);
      break;
    }
  }

  // Step 5: final cleanup (common.dropKeys)
  const dropKeys = STATE_RULES.common.dropKeys ?? [];
  const finalProps: Record<string, string> = {};
  for (const [k, v] of Object.entries(props)) {
    if (dropKeys.some((pat) => wildcardMatch(pat, k))) continue;
    finalProps[k] = v;
  }

  return { name: javaName, properties: finalProps };
}
