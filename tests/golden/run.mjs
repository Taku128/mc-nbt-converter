#!/usr/bin/env node
/**
 * Cross-implementation golden test.
 *
 * For each .mcstructure in fixtures/ (or packages/go/test/testdata/),
 * run the JS converter and the Go converter, then byte-compare the gzipped
 * Java Structure NBT outputs.
 *
 * Usage: node tests/golden/run.mjs
 * Exit codes: 0 = all match, 1 = mismatch, 2 = infra error
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

// Candidate fixture directories (first match wins per filename).
const fixtureDirs = [
  resolve(__dirname, 'fixtures'),
  resolve(repoRoot, 'packages', 'go', 'test', 'testdata'),
];

const fixtures = new Map();
for (const dir of fixtureDirs) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.mcstructure') && !fixtures.has(f)) {
      fixtures.set(f, resolve(dir, f));
    }
  }
}

if (fixtures.size === 0) {
  console.error('No .mcstructure fixtures found. Add some to tests/golden/fixtures/.');
  process.exit(2);
}

const hash = (buf) => createHash('sha256').update(buf).digest('hex');
const tmp = mkdtempSync(resolve(tmpdir(), 'mc-nbt-golden-'));

let failures = 0;

for (const [name, path] of fixtures) {
  console.log(`\n=== ${name} ===`);

  const jsOut = resolve(tmp, `${name}.js.nbt`);
  const goOut = resolve(tmp, `${name}.go.nbt`);

  // JS
  const jsResult = spawnSync('node', [
    resolve(repoRoot, 'packages/js/all/bin/cli.js'),
    path, '-o', jsOut,
  ], { stdio: 'inherit' });
  if (jsResult.status !== 0) {
    console.error(`[FAIL] JS converter failed for ${name}`);
    failures++;
    continue;
  }

  // Go
  const goCli = resolve(repoRoot, 'packages/go/cmd/bedrock-nbt-converter');
  const goResult = spawnSync('go', ['run', goCli, path, '-o', goOut], {
    cwd: resolve(repoRoot, 'packages/go'),
    stdio: 'inherit',
  });
  if (goResult.status !== 0) {
    console.error(`[FAIL] Go converter failed for ${name}`);
    failures++;
    continue;
  }

  // Compare
  const jsHash = hash(readFileSync(jsOut));
  const goHash = hash(readFileSync(goOut));
  if (jsHash === goHash) {
    console.log(`  ✓ match (${jsHash.slice(0, 12)}…)`);
  } else {
    console.error(`  ✗ MISMATCH`);
    console.error(`    JS: ${jsHash}`);
    console.error(`    Go: ${goHash}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n❌ ${failures} / ${fixtures.size} fixture(s) failed`);
  process.exit(1);
}

console.log(`\n✅ All ${fixtures.size} fixture(s) matched between JS and Go`);
