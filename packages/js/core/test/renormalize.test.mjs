// renormalizeState: 旧変換 (core 0.3.0 未満) の残留 Bedrock state を持つ Java 構造を
// 現行 state-rules で正しく再マップする (バックフィル用)。冪等性が最重要。
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { renormalizeState, mapBlock } from "../dist/index.js";

// --- 残留 Bedrock state の修正 (旧 .mcworld .nbt で壊れていたもの) ---
test("residual lever: lever_direction/open_bit → face/facing/powered", () => {
  const r = renormalizeState("minecraft:lever", { lever_direction: "up_north_south", open_bit: "1" });
  assert.deepEqual(r, { name: "minecraft:lever", properties: { face: "floor", facing: "north", powered: "true" } });
});

test("residual stairs: weirdo_direction/upside_down_bit → facing/half", () => {
  const r = renormalizeState("minecraft:oak_stairs", { weirdo_direction: "2", upside_down_bit: "0" });
  assert.equal(r.name, "minecraft:oak_stairs");
  assert.equal(r.properties.facing, "south");
  assert.equal(r.properties.half, "bottom");
});

test("residual rail: rail_direction → shape", () => {
  const r = renormalizeState("minecraft:rail", { rail_direction: "7" });
  assert.equal(r.properties.shape, "south_west");
});

test("residual door: cardinal_direction → facing (90°回転)", () => {
  const r = renormalizeState("minecraft:oak_door", {
    cardinal_direction: "east", open_bit: "1", upper_block_bit: "0", door_hinge_bit: "1",
  });
  assert.equal(r.name, "minecraft:oak_door");
  assert.equal(r.properties.facing, "north"); // east→north の回転
  assert.equal(r.properties.half, "lower");
  assert.equal(r.properties.hinge, "right");
  assert.equal(r.properties.open, "true");
});

// --- 冪等性 (既に正しい Java state を誤変換しない) ---
test("idempotent: 正しい lever は素通し", () => {
  const correct = { face: "wall", facing: "north", powered: "false" };
  const r = renormalizeState("minecraft:lever", correct);
  assert.deepEqual(r, { name: "minecraft:lever", properties: correct });
});

test("idempotent: 正しい階段は素通し", () => {
  const correct = { facing: "south", half: "bottom", shape: "straight", waterlogged: "false" };
  const r = renormalizeState("minecraft:oak_stairs", correct);
  assert.deepEqual(r.properties, correct);
});

test("idempotent: 正しい wall_torch は素通し (wallVariant の誤発火なし)", () => {
  // torch は wallVariant で床/壁に分割される。既に wall_torch なら torch_facing_direction を
  // 持たないため素通しされ、standing に戻されない。
  const r = renormalizeState("minecraft:wall_torch", { facing: "east" });
  assert.deepEqual(r, { name: "minecraft:wall_torch", properties: { facing: "east" } });
  const r2 = renormalizeState("minecraft:torch", {});
  assert.deepEqual(r2, { name: "minecraft:torch", properties: {} });
});

test("idempotent: 正しい rail は素通し", () => {
  const correct = { shape: "north_south", waterlogged: "false" };
  assert.deepEqual(renormalizeState("minecraft:rail", correct).properties, correct);
});

test("idempotent: state を持たないブロック (stone) は素通し", () => {
  assert.deepEqual(renormalizeState("minecraft:stone", {}), { name: "minecraft:stone", properties: {} });
});

test("二重適用しても結果が変わらない (冪等)", () => {
  const once = renormalizeState("minecraft:lever", { lever_direction: "east", open_bit: "1" });
  const twice = renormalizeState(once.name, once.properties);
  assert.deepEqual(twice, once);
});

// --- residual 結果は mapBlock の Bedrock 変換結果と一致する ---
test("renormalize(Java名, 残留) == mapBlock(Bedrock名, 元 state) の state 部", () => {
  const viaMap = mapBlock("minecraft:lever", { lever_direction: "down_east_west", open_bit: "0" });
  const viaRen = renormalizeState("minecraft:lever", { lever_direction: "down_east_west", open_bit: "0" });
  assert.deepEqual(viaRen.properties, viaMap.properties);
});
