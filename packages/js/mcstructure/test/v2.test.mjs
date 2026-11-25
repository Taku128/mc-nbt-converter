/**
 * .mcstructure の版 2 (統合版 26.50〜) の読み取り (Taku128/mc-nbt-converter#12)。
 *
 * 版 2 は block_indices が List<IntArray> になり、2 層目 (水没など) は空なら省略される。
 * 版 1 は List<List<Int>>。同じ構造を版 1 と版 2 で書いたものが、同じ Java のブロックになることを確かめる。
 * BDS が書いた版 2 は tests/golden/fixtures/bds-26.52-v2-*.mcstructure (redtact-live#29 の実測)。
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Structure } from 'deepslate';
import { NbtFile, NbtInt, NbtIntArray, NbtList, NbtType } from 'deepslate/nbt';

import { convertMcstructureBuffer } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..', '..');
const read = (...p) => new Uint8Array(readFileSync(resolve(repoRoot, ...p)));

const ELEVATOR = ['packages', 'go', 'test', 'testdata', 'elevator.mcstructure'];
const BDS_SMALL = ['tests', 'golden', 'fixtures', 'bds-26.52-v2-small.mcstructure'];
const BDS_ONE_LAYER = ['tests', 'golden', 'fixtures', 'bds-26.52-v2-one-layer.mcstructure'];

const asIntArray = (values) => new NbtIntArray(values);
const asIntList = (values) => new NbtList(values.map((v) => new NbtInt(v)), NbtType.Int);

function layerValues(tag) {
  return tag instanceof NbtIntArray ? tag.toSimplifiedJson() : tag.getItems().map((t) => t.getAsNumber());
}

/** block_indices の層を書き換えた .mcstructure (LE・非圧縮) */
function rewrite(bytes, version, toLayer, keepSecond) {
  const file = NbtFile.read(bytes, { littleEndian: true, compression: 'none' });
  const structure = file.root.getCompound('structure');
  const old = structure.getList('block_indices');
  const layers = [];
  for (let i = 0; i < old.length; i++) {
    if (i > 0 && !keepSecond) break;
    layers.push(toLayer(layerValues(old.get(i))));
  }
  structure.set('block_indices', new NbtList(layers, layers[0].getId()));
  file.root.set('format_version', new NbtInt(version));
  return file.write();
}

function header(bytes) {
  const root = NbtFile.read(bytes, { littleEndian: true, compression: 'none' }).root;
  const list = root.getCompound('structure').getList('block_indices');
  return { version: root.getNumber('format_version'), layers: list.length, type: list.getType() };
}

/** 変換結果 (gzip の Java Structure NBT) → 位置 → ブロック状態の文字列 */
function blocksOf(result) {
  const structure = Structure.fromNbt(NbtFile.read(result.nbt).root);
  const out = new Map();
  for (const b of structure.getBlocks()) {
    const props = b.state.getProperties();
    const keys = Object.keys(props).sort();
    out.set(b.pos.join(','), `${b.state.getName()}[${keys.map((k) => `${k}=${props[k]}`).join(',')}]`);
  }
  return out;
}

test('elevator を版 2 (2 層・2 層目なし) に直しても、版 1 と同じブロックになる', async () => {
  const v1 = read(...ELEVATOR);
  assert.equal(header(v1).version, 1);
  const want = await convertMcstructureBuffer(v1);
  const wantBlocks = blocksOf(want);

  for (const keepSecond of [true, false]) {
    const v2 = rewrite(v1, 2, asIntArray, keepSecond);
    assert.deepEqual(header(v2), { version: 2, layers: keepSecond ? 2 : 1, type: NbtType.IntArray });
    const got = await convertMcstructureBuffer(v2);
    assert.equal(got.blockCount, want.blockCount);
    assert.equal(got.paletteCount, want.paletteCount);
    assert.deepEqual(blocksOf(got), wantBlocks);
  }
});

for (const [path, layers, nonAir] of [
  [BDS_SMALL, 2, 77], // 8×4×8。チェスト・看板・ホッパー・水没した階段入り
  [BDS_ONE_LAYER, 1, 2304], // 16×16×16。2 層目は省略されている
]) {
  test(`BDS 26.52 の版 2 を読める: ${path.at(-1)}`, async () => {
    const v2 = read(...path);
    assert.deepEqual(header(v2), { version: 2, layers, type: NbtType.IntArray });

    const got = await convertMcstructureBuffer(v2);
    assert.equal(got.blockCount, nonAir);

    // 同じ構造を版 1 で書いたものと同じになる
    const v1 = rewrite(v2, 1, asIntList, true);
    assert.equal(header(v1).type, NbtType.List);
    const want = await convertMcstructureBuffer(v1);
    assert.deepEqual(blocksOf(got), blocksOf(want));
  });
}
