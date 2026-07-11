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

// state-rules が「入力側」で参照するプロパティキー (Bedrock 由来の state) の集合。
// これを持つブロックだけが未変換の残留 Bedrock state とみなせる。正しく変換済みの
// Java state (facing / half / powered 等) はこれらを持たないため、renormalizeState は
// 素通しになる (冪等)。common.keyAliases の名前空間付きキーと正規化後のキーも含む。
// in-place (from===to) かつ非冪等な map を持つキーの集合。door の facing 90°回転 /
// piston の facing 180°反転が該当し、その from は Java ネイティブ値 (facing) を permute する。
// このキーを residual トリガに含めると、facing を持つ正しい Java state (ドア/ピストンだけ
// でなく全ブロック) が residual 誤判定され、door/piston rule で再変換・破壊される。
// 逆に crafter (crafting→crafting: false→false で冪等) や sculk_sensor (phase→phase: 出力が
// 入力キーに無く冪等) の in-place map、および repeater (repeater_delay→delay: 非 in-place で
// 別キー出力) は安全なので残す。
const DANGEROUS_INPLACE_KEYS: ReadonlySet<string> = (() => {
  const bad = new Set<string>();
  const scan = (ops: Op[] | undefined) => {
    for (const op of ops ?? []) {
      const m = op.map;
      if (!m) continue;
      const to = m.to ?? m.from;
      if (to !== m.from) continue; // in-place のみ対象
      for (const v of Object.values(m.values)) {
        if (typeof v !== 'string') continue;
        const back = m.values[v];
        if (back !== undefined && back !== v) {
          bad.add(m.from); // 出力値が別マッピングの入力キー = 再適用で変化 = 非冪等
          break;
        }
      }
    }
  };
  scan(STATE_RULES.common.ops);
  for (const rule of STATE_RULES.rules) scan(rule.ops);
  return bad;
})();

const RESIDUAL_STATE_KEYS: ReadonlySet<string> = (() => {
  const keys = new Set<string>();
  const add = (k: string) => {
    if (!DANGEROUS_INPLACE_KEYS.has(k)) keys.add(k);
  };
  const collect = (ops: Op[] | undefined) => {
    for (const op of ops ?? []) {
      if (op.map) add(op.map.from);
      if (op.mapBool) add(op.mapBool.from);
      if (op.rename) add(op.rename.from);
      if (op.wallVariant) add(op.wallVariant.from);
      // drop 対象の Bedrock 残留キー (cauldron_liquid / top_slot_bit 等) も判定に含める。
      for (const k of op.drop ?? []) add(k);
    }
  };
  collect(STATE_RULES.common.ops);
  for (const rule of STATE_RULES.rules) collect(rule.ops);
  for (const [ns, local] of Object.entries(STATE_RULES.common.keyAliases ?? {})) {
    add(ns);
    add(local);
  }
  // common.dropKeys のうちワイルドカードでない具体キー (age_bit 等) も残留とみなす。
  for (const pat of STATE_RULES.common.dropKeys ?? []) {
    if (!pat.includes('*')) add(pat);
  }
  return keys;
})();

/**
 * 既に Java 名だが、旧バージョン (core 0.3.0 未満) の変換で state プロパティが未変換の
 * まま残った (lever_direction / weirdo_direction / rail_direction / cardinal_direction 等の
 * Bedrock state を持つ) ブロックを、現在の state-rules で正しい Java state に再マップする。
 *
 * mapBlock との違いは名前解決 (Bedrock→Java) を行わない点。入力名は既に Java なので、
 * rule のマッチにも props 変換にもその名前をそのまま使う。
 *
 * 冪等性: 残留 Bedrock state キー (RESIDUAL_STATE_KEYS) を 1 つも持たないブロックは
 * 変換済みとみなして素通しする。これにより既に正しい Java state (torch の壁/床分割済み等
 * も含む) を誤変換しない。
 */
export function renormalizeState(
  javaName: string,
  javaProps: Record<string, unknown> = {},
): JavaBlockState {
  const props: Record<string, string> = {};
  let residual = false;
  for (const [k, v] of Object.entries(javaProps)) {
    props[k] = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
    if (RESIDUAL_STATE_KEYS.has(k)) residual = true;
  }
  if (!residual) {
    return { name: javaName, properties: props };
  }

  // 名前空間付きキーの正規化 (mapBlock Step 1 と同じ)。
  const keyAliases = STATE_RULES.common.keyAliases ?? {};
  for (const [ns, local] of Object.entries(keyAliases)) {
    if (props[ns] !== undefined) {
      props[local] = props[ns]!;
      delete props[ns];
    }
  }

  // 名前解決は行わない。既に Java 名なので rule マッチ・変換ともこの名前を使う。
  let name = applyOps(STATE_RULES.common.ops ?? [], props, javaName);
  for (const rule of STATE_RULES.rules) {
    if (wildcardMatch(rule.match, javaName)) {
      name = applyOps(rule.ops, props, name);
      break;
    }
  }

  const dropKeys = STATE_RULES.common.dropKeys ?? [];
  const finalProps: Record<string, string> = {};
  for (const [k, v] of Object.entries(props)) {
    if (dropKeys.some((pat) => wildcardMatch(pat, k))) continue;
    finalProps[k] = v;
  }
  return { name, properties: finalProps };
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
