#!/usr/bin/env node
/**
 * Cross-implementation golden test.
 *
 * For each .mcstructure in fixtures/ (or packages/go/test/testdata/),
 * run the JS converter and the Go converter, then compare the outputs
 * SEMANTICALLY: size / DataVersion / the full position→blockstate map.
 *
 * Byte equality is intentionally NOT required — gzip and NBT encodings differ
 * between the implementations (compound key order, gzip header). Both outputs
 * are parsed with deepslate (the same library the redtact viewer uses), so
 * "semantically equal" here means "the viewer renders the same structure".
 * The sha256 of each output is still printed for information: the Go output
 * is byte-deterministic since the Props/flatten ordering fixes.
 *
 * Usage: node tests/golden/run.mjs
 * Exit codes: 0 = all match, 1 = mismatch, 2 = infra error
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

// deepslate is a dependency of @taku128/core — resolve it from that package.
const coreRequire = createRequire(resolve(repoRoot, 'packages/js/core/package.json'));
const deepslate = await import(pathToFileURL(coreRequire.resolve('deepslate')).href);

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

/** gzip Java Structure NBT → { size, dataVersion, blocks: Map<"x,y,z", state 文字列> } */
function readStructure(bytes) {
  const file = deepslate.NbtFile.read(bytes);
  const structure = deepslate.Structure.fromNbt(file.root);
  const blocks = new Map();
  for (const b of structure.getBlocks()) {
    const props = b.state.getProperties();
    const keys = Object.keys(props).sort();
    const name = b.state.getName().toString();
    blocks.set(
      b.pos.join(','),
      keys.length ? `${name}[${keys.map((k) => `${k}=${props[k]}`).join(',')}]` : name,
    );
  }
  return {
    size: [...structure.getSize()],
    dataVersion: file.root.getNumber('DataVersion'),
    blocks,
  };
}

function compareSemantics(name, jsBytes, goBytes) {
  const js = readStructure(jsBytes);
  const go = readStructure(goBytes);
  const problems = [];

  if (js.size.join(',') !== go.size.join(',')) {
    problems.push(`size: JS [${js.size}] vs Go [${go.size}]`);
  }
  if (js.dataVersion !== go.dataVersion) {
    problems.push(`DataVersion: JS ${js.dataVersion} vs Go ${go.dataVersion}`);
  }
  if (js.blocks.size !== go.blocks.size) {
    problems.push(`block count: JS ${js.blocks.size} vs Go ${go.blocks.size}`);
  }
  let stateMismatches = 0;
  for (const [pos, state] of go.blocks) {
    if (js.blocks.get(pos) !== state) {
      stateMismatches++;
      if (stateMismatches <= 5) {
        problems.push(`state at ${pos}: JS ${js.blocks.get(pos) ?? '(none)'} vs Go ${state}`);
      }
    }
  }
  if (stateMismatches > 5) problems.push(`… and ${stateMismatches - 5} more state mismatches`);

  if (problems.length === 0) {
    console.log(`  ✓ semantic match (${js.blocks.size} blocks, DataVersion ${js.dataVersion})`);
    return true;
  }
  console.error(`  ✗ SEMANTIC MISMATCH (${name})`);
  for (const p of problems) console.error(`    ${p}`);
  return false;
}

const tmp = mkdtempSync(resolve(tmpdir(), 'mc-nbt-golden-'));

let failures = 0;

try {
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

    const jsBytes = new Uint8Array(readFileSync(jsOut));
    const goBytes = new Uint8Array(readFileSync(goOut));
    console.log(`  JS sha256 ${hash(jsBytes).slice(0, 12)}… / Go sha256 ${hash(goBytes).slice(0, 12)}…`);
    if (!compareSemantics(name, jsBytes, goBytes)) failures++;
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n❌ ${failures} / ${fixtures.size} fixture(s) failed`);
  process.exit(1);
}

console.log(`\n✅ All ${fixtures.size} fixture(s) semantically matched between JS and Go`);
