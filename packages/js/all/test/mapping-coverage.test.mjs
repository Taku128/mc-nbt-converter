/**
 * Coverage test: every Bedrock block name found in the mapping sources
 * must produce a non-empty Java name without errors through mapBlock().
 *
 * Run: node packages/js/all/test/mapping-coverage.test.mjs
 * Exits non-zero on any failure (suitable for CI).
 */
import { mapBlock, resetUnmapped, reportUnmapped } from '../dist/index.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Mapping source files live under shared/ (synced via tools/sync-mappings).
const dataDir = resolve(__dirname, '..', '..', '..', '..', 'shared', 'mappings');

const chunker = JSON.parse(readFileSync(resolve(dataDir, 'chunker-mappings.json'), 'utf8'));
const overrides = JSON.parse(readFileSync(resolve(dataDir, 'overrides.json'), 'utf8'));
const aliases = JSON.parse(readFileSync(resolve(dataDir, 'aliases.json'), 'utf8'));

const known = new Set([
  ...Object.keys(chunker.names || {}),
  ...Object.keys(chunker.flatten || {}),
  ...Object.keys(overrides.names || {}),
  ...Object.keys(overrides.flatten || {}),
  ...Object.keys(aliases.bedrockAliases || {}),
]);

console.log(`Known Bedrock blocks in mapping sources: ${known.size}`);

resetUnmapped();

let failed = 0;
let resolvedByIdentity = 0;

for (const name of known) {
  try {
    const result = mapBlock(name, {});
    if (!result || !result.name || typeof result.name !== 'string') {
      console.error(`[FAIL] ${name}: invalid result shape`, result);
      failed++;
    }
  } catch (err) {
    console.error(`[FAIL] ${name}: threw`, err.message);
    failed++;
  }
}

const fellThrough = reportUnmapped();
resolvedByIdentity = fellThrough.filter((n) => known.has(n)).length;

console.log(`\nResolved cleanly: ${known.size - failed} / ${known.size}`);
console.log(`Fell through to fallback layer: ${fellThrough.length}`);
if (fellThrough.length > 0 && fellThrough.length <= 20) {
  console.log(`  ${fellThrough.join(', ')}`);
}

if (failed > 0) {
  console.error(`\n❌ ${failed} mapping failures`);
  process.exit(1);
}

console.log(`\n✅ All ${known.size} known Bedrock blocks processed without error`);
