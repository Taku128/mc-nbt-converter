/**
 * zlib で縮めた .mcstructure (統合版 26.60〜) の読み取り (Taku128/mc-nbt-converter#12)。
 *
 * 26.60 からゲームが書き出す構造は、ルートの compression が 1 で、structure が
 * 「structure の compound を LE の NBT に書いて zlib で縮めた ByteArray」になる。
 * 縮めたものが縮めていないものと同じ Java のブロックになることと、壊れたものを断ることを確かめる。
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { Structure } from 'deepslate';
import { NbtByteArray, NbtFile, NbtInt } from 'deepslate/nbt';

import { convertMcstructureBuffer } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..', '..');
const read = (...p) => new Uint8Array(readFileSync(resolve(repoRoot, ...p)));

const FIXTURES = {
  'elevator.mcstructure (版 1)': ['packages', 'go', 'test', 'testdata', 'elevator.mcstructure'],
  'bds-26.52-v2-small.mcstructure (版 2)': ['tests', 'golden', 'fixtures', 'bds-26.52-v2-small.mcstructure'],
  'bds-26.52-v2-one-layer.mcstructure (版 2・2 層目なし)': ['tests', 'golden', 'fixtures', 'bds-26.52-v2-one-layer.mcstructure'],
};
const ZLIB_FIXTURE = ['tests', 'golden', 'fixtures', 'bds-26.52-v2-small-zlib.mcstructure'];

/** structure を packed(内側の NBT) の ByteArray に置き換え、compression を付けた .mcstructure */
function compressStructure(bytes, compression, packed = (inner) => deflateSync(inner)) {
  const file = NbtFile.read(bytes, { littleEndian: true, compression: 'none' });
  const inner = new NbtFile('', file.root.getCompound('structure'), 'none', true, undefined).write();
  file.root.set('structure', new NbtByteArray(packed(inner)));
  file.root.set('compression', new NbtInt(compression));
  return file.write();
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

for (const [name, path] of Object.entries(FIXTURES)) {
  test(`zlib で縮めても、縮めていないものと同じブロックになる: ${name}`, async () => {
    const plain = read(...path);
    const want = await convertMcstructureBuffer(plain);

    const z = compressStructure(plain, 1);
    const root = NbtFile.read(z, { littleEndian: true, compression: 'none' }).root;
    assert.ok(root.get('structure').isByteArray());

    const got = await convertMcstructureBuffer(z);
    assert.deepEqual(got.size, want.size);
    assert.equal(got.blockCount, want.blockCount);
    assert.deepEqual(blocksOf(got), blocksOf(want));
  });
}

test('tools/gen-zlib-fixture.mjs の見本 (26.62 の実物と同じ形) が、元の版 2 と同じブロックになる', async () => {
  const z = read(...ZLIB_FIXTURE);
  const root = NbtFile.read(z, { littleEndian: true, compression: 'none' }).root;
  assert.equal(root.getNumber('compression'), 1);
  assert.ok(root.get('structure').isByteArray());

  const got = await convertMcstructureBuffer(z);
  assert.equal(got.blockCount, 77);
  const want = await convertMcstructureBuffer(read(...FIXTURES['bds-26.52-v2-small.mcstructure (版 2)']));
  assert.deepEqual(blocksOf(got), blocksOf(want));
});

test('壊れた圧縮・知らない圧縮・膨らみすぎるものを断る', async () => {
  const plain = read(...FIXTURES['bds-26.52-v2-small.mcstructure (版 2)']);
  const cases = [
    ['知らない compression', compressStructure(plain, 2), /unknown structure compression 2/],
    ['zlib でない', compressStructure(plain, 1, (inner) => inner), /not valid zlib data/],
    [
      '途中で切れた zlib',
      compressStructure(plain, 1, (inner) => {
        const z = deflateSync(inner);
        return z.subarray(0, z.length >> 1);
      }),
      /not valid zlib data/,
    ],
    // 64 KiB ほどが 64 MiB を超えて膨らむ (zip bomb)
    ['64 MiB を超えて膨らむ', compressStructure(plain, 1, () => deflateSync(new Uint8Array(64 * 1024 * 1024 + 1))), /inflates past/],
  ];
  for (const [name, bytes, want] of cases) {
    await assert.rejects(convertMcstructureBuffer(bytes), want, name);
  }
});
