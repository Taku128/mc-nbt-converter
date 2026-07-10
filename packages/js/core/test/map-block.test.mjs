/**
 * mapBlock のブロック族別テーブルテスト。
 *
 * 期待値は block-mapping.ts の現行実装 + shared/mappings の JSON から導出した
 * 「現状の挙動」の回帰基準。lever / 階段 / ドア / 通常レール等の素通し
 * (Java 不正 state になる既知の未対応) も現状のまま固定して文書化している —
 * Phase 2 (プロパティ変換のデータ駆動化, redtact-com/redtact#14) で変換を
 * 実装した際は、素通しセクションの期待値をあるべき Java state に更新すること。
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";

import { mapBlock } from "../dist/index.js";

const CASES = [
  // --- レッドストーントーチ (壁/床 + 方向反転 + lit) ---
  {
    name: "redstone torch: 壁付きは方向反転 + lit=true",
    in: ["minecraft:redstone_torch", { torch_facing_direction: "west" }],
    out: { name: "minecraft:redstone_wall_torch", properties: { facing: "east", lit: "true" } },
  },
  {
    name: "redstone torch: unlit は lit=false",
    in: ["minecraft:unlit_redstone_torch", { torch_facing_direction: "north" }],
    out: { name: "minecraft:redstone_wall_torch", properties: { facing: "south", lit: "false" } },
  },
  {
    name: "redstone torch: top は床置き",
    in: ["minecraft:redstone_torch", { torch_facing_direction: "top" }],
    out: { name: "minecraft:redstone_torch", properties: { lit: "true" } },
  },
  {
    name: "torch: 壁付き",
    in: ["minecraft:torch", { torch_facing_direction: "north" }],
    out: { name: "minecraft:wall_torch", properties: { facing: "south" } },
  },
  {
    name: "soul torch: 床置き",
    in: ["minecraft:soul_torch", { torch_facing_direction: "top" }],
    out: { name: "minecraft:soul_torch", properties: {} },
  },

  // --- ピストン (facing_direction 数値 + 水平反転) ---
  {
    name: "piston: facing_direction=5(east) は反転して west",
    in: ["minecraft:piston", { facing_direction: 5 }],
    out: { name: "minecraft:piston", properties: { facing: "west", extended: "false" } },
  },
  {
    name: "sticky piston: 上向きは反転しない",
    in: ["minecraft:sticky_piston", { facing_direction: 1 }],
    out: { name: "minecraft:sticky_piston", properties: { facing: "up", extended: "false" } },
  },
  {
    name: "piston head: sticky 判定 + 反転 + short 既定",
    in: ["minecraft:sticky_piston_arm_collision", { facing_direction: 3 }],
    out: {
      name: "minecraft:piston_head",
      properties: { facing: "north", type: "sticky", short: "false" },
    },
  },

  // --- コンパレータ / リピータ (direction 0-3 → facing) ---
  {
    name: "comparator: subtract + direction=2(north)",
    in: ["minecraft:unpowered_comparator", { output_subtract_bit: 1, output_lit_bit: 0, direction: 2 }],
    out: {
      name: "minecraft:comparator",
      properties: { mode: "subtract", powered: "false", facing: "north" },
    },
  },
  {
    name: "comparator: powered_comparator は powered=true",
    in: ["minecraft:powered_comparator", { direction: 3 }],
    out: {
      name: "minecraft:comparator",
      properties: { mode: "compare", powered: "true", facing: "east" },
    },
  },
  {
    name: "repeater: repeater_delay は +1 (Bedrock 0-3 → Java 1-4)",
    in: ["minecraft:unpowered_repeater", { repeater_delay: 3, direction: 0 }],
    out: {
      name: "minecraft:repeater",
      properties: { powered: "false", delay: "4", locked: "false", facing: "south" },
    },
  },

  // --- オブザーバー / ボタン ---
  {
    name: "observer: minecraft:facing_direction (文字列) + powered_bit",
    in: ["minecraft:observer", { "minecraft:facing_direction": "west", powered_bit: 0 }],
    out: { name: "minecraft:observer", properties: { facing: "west", powered: "false" } },
  },
  {
    name: "button: facing_direction=0(down) は ceiling",
    in: ["minecraft:stone_button", { facing_direction: 0, button_pressed_bit: 1 }],
    out: {
      name: "minecraft:stone_button",
      properties: { face: "ceiling", facing: "north", powered: "true" },
    },
  },
  {
    name: "button: 横向きは wall",
    in: ["minecraft:stone_button", { facing_direction: 4, button_pressed_bit: 0 }],
    out: {
      name: "minecraft:stone_button",
      properties: { face: "wall", facing: "west", powered: "false" },
    },
  },

  // --- 収納系 ---
  {
    name: "barrel: open_bit → open",
    in: ["minecraft:barrel", { facing_direction: 1, open_bit: 1 }],
    out: { name: "minecraft:barrel", properties: { facing: "up", open: "true" } },
  },
  {
    name: "dropper: triggered_bit → triggered",
    in: ["minecraft:dropper", { facing_direction: 0, triggered_bit: 1 }],
    out: { name: "minecraft:dropper", properties: { facing: "down", triggered: "true" } },
  },
  {
    name: "hopper: toggle_bit は enabled に反転",
    in: ["minecraft:hopper", { facing_direction: 2, toggle_bit: 1 }],
    out: { name: "minecraft:hopper", properties: { facing: "north", enabled: "false" } },
  },

  // --- トラップドア / レール / 書見台 ---
  {
    name: "trapdoor: direction/upside_down_bit/open_bit + 既定値",
    in: ["minecraft:trapdoor", { direction: 2, upside_down_bit: 1, open_bit: 1 }],
    out: {
      name: "minecraft:oak_trapdoor",
      properties: { facing: "south", half: "top", open: "true", waterlogged: "false", powered: "false" },
    },
  },
  {
    name: "powered rail (golden_rail): rail_direction + rail_data_bit",
    in: ["minecraft:golden_rail", { rail_direction: 3, rail_data_bit: 1 }],
    out: {
      name: "minecraft:powered_rail",
      properties: { shape: "ascending_west", powered: "true", waterlogged: "false" },
    },
  },
  {
    name: "lectern: direction + powered_bit + has_book 既定",
    in: ["minecraft:lectern", { direction: 1, powered_bit: 0 }],
    out: {
      name: "minecraft:lectern",
      properties: { facing: "west", powered: "false", has_book: "false" },
    },
  },

  // --- ハーフブロック / レッドストーンダスト ---
  {
    name: "slab: top_slot_bit → type=top (names 層で petrified_oak_slab へ)",
    in: ["minecraft:oak_slab", { top_slot_bit: 1 }],
    out: { name: "minecraft:petrified_oak_slab", properties: { type: "top", waterlogged: "false" } },
  },
  {
    name: "redstone wire: redstone_signal → power + 接続 4 方向の既定",
    in: ["minecraft:redstone_wire", { redstone_signal: 7 }],
    out: {
      name: "minecraft:redstone_wire",
      properties: { power: "7", east: "none", north: "none", south: "none", west: "none" },
    },
  },

  // --- flatten (JSON 宣言順で決定的。Go 実装と一致すること) ---
  {
    name: "flatten: quartz_block は chisel_type が先に解決",
    in: ["minecraft:quartz_block", { chisel_type: "chiseled", pillar_axis: "y" }],
    out: { name: "minecraft:chiseled_quartz_block", properties: { axis: "y" } },
  },
  {
    name: "flatten: cauldron は fill_level=0 が cauldron_liquid より先に解決 (JSON 順)",
    in: ["minecraft:cauldron", { fill_level: 0, cauldron_liquid: "water" }],
    out: { name: "minecraft:cauldron", properties: { cauldron_liquid: "water" } },
  },
  {
    name: "flatten: kelp は kelp_age=25 で kelp_plant",
    in: ["minecraft:kelp", { kelp_age: 25 }],
    out: { name: "minecraft:kelp_plant", properties: {} },
  },

  // --- 素通しの既知ケース (Phase 2 のデータ駆動化で変換予定。現状固定) ---
  {
    name: "【素通し】lever: lever_direction/open_bit が Java state に変換されない",
    in: ["minecraft:lever", { lever_direction: "up_north_south", open_bit: 1 }],
    out: {
      name: "minecraft:lever",
      properties: { lever_direction: "up_north_south", open_bit: "1" },
    },
  },
  {
    name: "【素通し】oak_stairs: weirdo_direction が変換されない",
    in: ["minecraft:oak_stairs", { weirdo_direction: 2, upside_down_bit: 0 }],
    out: {
      name: "minecraft:oak_stairs",
      properties: { weirdo_direction: "2", upside_down_bit: "0" },
    },
  },
  {
    name: "【素通し】通常レール: rail_direction が shape に変換されない",
    in: ["minecraft:rail", { rail_direction: 7 }],
    out: { name: "minecraft:rail", properties: { rail_direction: "7" } },
  },
];

for (const c of CASES) {
  test(c.name, () => {
    const got = mapBlock(c.in[0], c.in[1]);
    assert.deepEqual({ name: got.name, properties: got.properties }, c.out);
  });
}

test("wooden_door は names 層で oak_door にリネームされる (プロパティは素通し)", () => {
  const got = mapBlock("minecraft:wooden_door", { direction: 1, open_bit: 0, upper_block_bit: 0 });
  assert.equal(got.name, "minecraft:oak_door");
  // 素通し (Phase 2 で door 変換を実装したら更新)
  assert.equal(got.properties.direction, "1");
});

test("決定性: flatten を含む変換 200 回が単一結果になる", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const got = mapBlock("minecraft:quartz_block", { chisel_type: "chiseled", pillar_axis: "y" });
    seen.add(JSON.stringify(got));
  }
  assert.equal(seen.size, 1);
});
