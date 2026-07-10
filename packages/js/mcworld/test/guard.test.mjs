/**
 * convertMcworld の防御パスの直接テスト:
 *  - 不正な長さ 9 (tag 47) の subchunk キーが混在しても RangeError で落ちない
 *  - 'No chunks in specified range' の throw 経路でも一時ディレクトリが残らない
 * fixture は packages/go/test/testdata/Elevator.mcworld を流用し、
 * leveldb-zlib で不正キーを注入した改変版を組み立てる。
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import AdmZip from "adm-zip";
import { LevelDB } from "leveldb-zlib";

import { convertMcworld } from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, "..", "..", "..", "go", "test", "testdata", "Elevator.mcworld");

/** fixture を展開し、db に不正キーを put して再 zip した .mcworld を作る */
async function buildForgedMcworld(workDir) {
  const zip = new AdmZip(FIXTURE);
  const extracted = join(workDir, "extracted");
  zip.extractAllTo(extracted, true);
  // db ディレクトリを探す (fixture は db/ 直下)
  const dbDir = readdirSync(extracted, { recursive: true, withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name === "db")
    .map((e) => join(e.parentPath ?? e.path, e.name))[0];
  assert.ok(dbDir, "fixture 内に db/ が見つからない");

  const db = new LevelDB(dbDir);
  await db.open();
  // 長さ 9 で末尾バイトが 47 (subchunk tag): 旧実装では readInt8(9) が RangeError
  const forged = Buffer.alloc(9);
  forged.writeInt32LE(0, 0); // cx = 0
  forged.writeInt32LE(0, 4); // cz = 0
  forged[8] = 47;
  await db.put(forged, Buffer.from([0]));
  // 長さ 13 (他次元形) + tag 47 も同様に
  const forged13 = Buffer.alloc(13);
  forged13.writeInt32LE(0, 0);
  forged13.writeInt32LE(0, 4);
  forged13.writeInt32LE(0, 8);
  forged13[12] = 47;
  await db.put(forged13, Buffer.from([0]));
  await db.close();

  const outZip = new AdmZip();
  outZip.addLocalFolder(extracted);
  const outPath = join(workDir, "forged.mcworld");
  outZip.writeZip(outPath);
  return outPath;
}

const listMcworldTmpDirs = () =>
  readdirSync(tmpdir()).filter((n) => n.startsWith("mcworld-"));

test("不正な長さ 9/13 の tag-47 キーが混在しても RangeError で落ちず変換が完走する", async () => {
  const workDir = mkdtempSync(join(tmpdir(), "mcworld-guard-test-"));
  try {
    const forgedPath = await buildForgedMcworld(workDir);
    const [baseline, forged] = [
      await convertMcworld(FIXTURE),
      await convertMcworld(forgedPath),
    ];
    // 不正キーはスキップされるだけで、ブロック数は元 fixture と一致する
    assert.equal(forged.blockCount, baseline.blockCount);
    assert.deepEqual(forged.size, baseline.size);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test("'No chunks in specified range' の throw 経路でも一時ディレクトリが残らない", async () => {
  const before = new Set(listMcworldTmpDirs());
  await assert.rejects(
    convertMcworld(FIXTURE, { minX: 1_000_000, maxX: 1_000_001 }),
    /No chunks/,
  );
  const leaked = listMcworldTmpDirs().filter((n) => !before.has(n));
  assert.deepEqual(leaked, [], `一時ディレクトリがリークしている: ${leaked.join(", ")}`);
});
