/**
 * 決定的な合成 .mcstructure (Bedrock LE NBT) を生成する。
 * Phase 2 (state-rules データ駆動化) で追加した向き付きブロック
 * (lever / 階段 / レールカーブ / ドア / tripwire / sculk / daylight / lamp / crafter)
 * を JS/Go 両実装で変換し、tests/golden が semantic 一致を検証するための入力。
 *
 *   node tests/golden/tools/gen-oriented-fixture.mjs
 *
 * deepslate は @taku128/core の依存として解決する (run.mjs と同じ方式)。
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..', '..');
const coreRequire = createRequire(resolve(repoRoot, 'packages/js/core/package.json'));
const ds = await import(pathToFileURL(coreRequire.resolve('deepslate')).href);
const { NbtCompound, NbtList, NbtInt, NbtByte, NbtString, NbtFile } = ds;

const B = (v) => new NbtByte(v);
const I = (v) => new NbtInt(v);
const S = (v) => new NbtString(v);
const intList = (arr) => new NbtList(arr.map(I));
const compound = (obj) => {
  const c = new NbtCompound();
  for (const [k, v] of Object.entries(obj)) c.set(k, v);
  return c;
};

// Bedrock palette entries. State tag types match real Bedrock:
// *_bit / crafting = byte, direction-like = int, direction names = string.
const PALETTE = [
  ['minecraft:lever', { lever_direction: S('up_north_south'), open_bit: B(1) }],
  ['minecraft:lever', { lever_direction: S('east'), open_bit: B(0) }],
  ['minecraft:lever', { lever_direction: S('down_east_west'), open_bit: B(1) }],
  ['minecraft:oak_stairs', { weirdo_direction: I(2), upside_down_bit: B(0) }],
  ['minecraft:oak_stairs', { weirdo_direction: I(0), upside_down_bit: B(1) }],
  ['minecraft:stone_stairs', { weirdo_direction: I(3), upside_down_bit: B(0) }],
  ['minecraft:rail', { rail_direction: I(7) }],
  ['minecraft:rail', { rail_direction: I(9) }],
  ['minecraft:rail', { rail_direction: I(0) }],
  ['minecraft:wooden_door', { 'minecraft:cardinal_direction': S('east'), open_bit: B(1), upper_block_bit: B(0), door_hinge_bit: B(1) }],
  ['minecraft:spruce_door', { 'minecraft:cardinal_direction': S('north'), open_bit: B(0), upper_block_bit: B(1), door_hinge_bit: B(0) }],
  ['minecraft:tripwire_hook', { direction: I(2), attached_bit: B(1), powered_bit: B(0) }],
  ['minecraft:sculk_sensor', { sculk_sensor_phase: I(1) }],
  ['minecraft:daylight_detector_inverted', { redstone_signal: I(9) }],
  ['minecraft:redstone_lamp', {}],
  ['minecraft:lit_redstone_lamp', {}],
  ['minecraft:crafter', { orientation: S('down_east'), triggered_bit: B(1), crafting: B(0) }],
  ['minecraft:golden_rail', { rail_direction: I(3), rail_data_bit: B(1) }],
  ['minecraft:redstone_torch', { torch_facing_direction: S('west') }],
];

const n = PALETTE.length;
const size = [n, 1, 1]; // idx = x*1*1 + y*1 + z = x
const layer0 = PALETTE.map((_, i) => i);
const layer1 = PALETTE.map(() => -1); // waterlog layer: all air

const blockPalette = new NbtList(
  PALETTE.map(([name, states]) => compound({ name: S(name), states: compound(states), version: I(18168865) })),
);

const root = compound({
  format_version: I(1),
  size: intList(size),
  structure: compound({
    block_indices: new NbtList([intList(layer0), intList(layer1)]),
    entities: new NbtList([]),
    palette: compound({
      default: compound({ block_palette: blockPalette, block_position_data: new NbtCompound() }),
    }),
  }),
  structure_world_origin: intList([0, 0, 0]),
});

const file = NbtFile.create({ littleEndian: true });
file.root = root;
const bytes = file.write();
const out = resolve(__dirname, '..', 'fixtures', 'oriented-blocks.mcstructure');
writeFileSync(out, bytes);
console.log(`wrote ${out} (${bytes.length} bytes, ${n} palette entries)`);
