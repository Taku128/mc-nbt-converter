#!/usr/bin/env node
/**
 * shared/mappings/*.json を各実装の data/ ディレクトリにミラーコピーする。
 *
 * Go の //go:embed は親ディレクトリを参照できないため、
 * packages/js/all/data/ と packages/go/data/ に同期コピーする。
 *
 * 使い方:
 *   node tools/sync-mappings/sync.mjs          # 同期
 *   node tools/sync-mappings/sync.mjs --check  # 差分があれば非0終了（CI用）
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const sharedDir = resolve(repoRoot, 'shared', 'mappings');
const targets = [
  resolve(repoRoot, 'packages', 'js', 'all', 'data'),
  resolve(repoRoot, 'packages', 'js', 'core', 'data'),
  resolve(repoRoot, 'packages', 'go', 'data'),
];

const checkMode = process.argv.includes('--check');

const jsonFiles = readdirSync(sharedDir).filter((f) => f.endsWith('.json'));
if (jsonFiles.length === 0) {
  console.error(`No JSON files found in ${sharedDir}`);
  process.exit(1);
}

let hasDiff = false;

for (const target of targets) {
  if (!existsSync(target)) {
    if (checkMode) {
      console.error(`[diff] target missing: ${target}`);
      hasDiff = true;
      continue;
    }
    mkdirSync(target, { recursive: true });
  }

  for (const file of jsonFiles) {
    const src = resolve(sharedDir, file);
    const dst = resolve(target, file);
    const srcContent = readFileSync(src);

    if (checkMode) {
      if (!existsSync(dst) || !readFileSync(dst).equals(srcContent)) {
        console.error(`[diff] ${dst}`);
        hasDiff = true;
      }
    } else {
      writeFileSync(dst, srcContent);
      console.log(`synced: ${dst.replace(repoRoot + '/', '')}`);
    }
  }
}

if (checkMode && hasDiff) {
  console.error('\nmapping files out of sync with shared/mappings/. run: pnpm sync-mappings');
  process.exit(1);
}

if (!checkMode) {
  console.log(`done: ${jsonFiles.length} file(s) → ${targets.length} target(s)`);
}
