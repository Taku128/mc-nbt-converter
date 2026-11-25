/**
 * 統合版 26.60 からの zlib で縮めた .mcstructure (compression = 1) の見本を作る (#12)。
 *
 * 26.60 からゲームが書き出す構造は、ルートの `compression` が 1 で、`structure` が
 * 「structure の compound を LE の NBT (ルートの名前は空) に書いて zlib で縮めた ByteArray」になる。
 * BDS 26.52 が書いた版 2 (bds-26.52-v2-small) を、この形に直して保存する。
 *
 * 形は統合版 26.62 が書いた実物に合わせた: ルートのキーの順 (compression・format_version・size・
 * structure・structure_world_origin)、compression と format_version は Int、zlib のヘッダは 78 da
 * (最大の圧縮)。実物は他の人の回路なのでリポジトリには入れていない。
 *
 *   node tests/golden/tools/gen-zlib-fixture.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..', '..');
const coreRequire = createRequire(resolve(repoRoot, 'packages/js/core/package.json'));
const ds = await import(pathToFileURL(coreRequire.resolve('deepslate')).href);
const { NbtCompound, NbtByteArray, NbtInt, NbtFile } = ds;

const fixtures = resolve(__dirname, '..', 'fixtures');
const src = resolve(fixtures, 'bds-26.52-v2-small.mcstructure');
const out = resolve(fixtures, 'bds-26.52-v2-small-zlib.mcstructure');

const root = NbtFile.read(new Uint8Array(readFileSync(src)), { littleEndian: true, compression: 'none' }).root;
const inner = new NbtFile('', root.getCompound('structure'), 'none', true, undefined).write();
const packed = deflateSync(inner, { level: 9 });

const zroot = new NbtCompound();
zroot.set('compression', new NbtInt(1));
zroot.set('format_version', root.get('format_version'));
zroot.set('size', root.get('size'));
zroot.set('structure', new NbtByteArray(packed));
zroot.set('structure_world_origin', root.get('structure_world_origin'));

writeFileSync(out, new NbtFile('', zroot, 'none', true, undefined).write());
console.log(`wrote ${out} (structure ${inner.length} → ${packed.length} bytes)`);
