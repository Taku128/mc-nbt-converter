/**
 * Cross-validates the pure-JS LevelDB reader against leveldb-zlib (native).
 *
 * Procedure:
 *   1. Extract Elevator.mcworld zip with adm-zip → tmp dir.
 *   2. Open with leveldb-zlib; collect every key/value pair as ground truth.
 *   3. Load every db/* file into a Map and open with our pure-JS reader.
 *   4. Compare iteration set + per-key get() against ground truth.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import AdmZip from 'adm-zip';
import { LevelDB } from 'leveldb-zlib';

import { openLevelDB } from '../dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, '../../../../packages/go/test/testdata/Elevator.mcworld');

function extract(mcworld) {
  const zip = new AdmZip(mcworld);
  const dir = mkdtempSync(join(tmpdir(), 'mcworld-test-'));
  zip.extractAllTo(dir, true);
  let dbDir = join(dir, 'db');
  if (!statSync(dbDir, { throwIfNoEntry: false })) {
    for (const sub of readdirSync(dir)) {
      const candidate = join(dir, sub, 'db');
      if (statSync(candidate, { throwIfNoEntry: false })) { dbDir = candidate; break; }
    }
  }
  return dbDir;
}

function bytesToHex(b) {
  let s = '';
  for (const v of b) s += (v < 16 ? '0' : '') + v.toString(16);
  return s;
}

test('pure-JS reader matches leveldb-zlib on Elevator.mcworld', async () => {
  const dbDir = extract(FIXTURE);

  const native = new LevelDB(dbDir);
  await native.open();
  const truth = new Map();
  for await (const [k, v] of native.getIterator()) {
    truth.set(bytesToHex(k), Buffer.from(v));
  }
  await native.close();

  const files = new Map();
  for (const name of readdirSync(dbDir)) {
    files.set(name, new Uint8Array(readFileSync(join(dbDir, name))));
  }
  const reader = openLevelDB(files);

  const ours = new Map();
  for (const { key, value } of reader.iterate()) {
    ours.set(bytesToHex(key), Buffer.from(value));
  }

  assert.equal(ours.size, truth.size, `key count mismatch: ours=${ours.size} truth=${truth.size}`);

  for (const [hex, expected] of truth) {
    const got = ours.get(hex);
    assert.ok(got, `missing key ${hex}`);
    assert.deepEqual(got, expected, `value mismatch for key ${hex}`);
  }

  let getChecked = 0;
  for (const hex of [...truth.keys()].slice(0, 50)) {
    const userKey = Uint8Array.from(Buffer.from(hex, 'hex'));
    const got = reader.get(userKey);
    assert.ok(got, `get() returned null for key ${hex}`);
    assert.deepEqual(Buffer.from(got), truth.get(hex), `get() value mismatch for key ${hex}`);
    getChecked++;
  }
  assert.ok(getChecked > 0, 'no get() checks executed');
});
