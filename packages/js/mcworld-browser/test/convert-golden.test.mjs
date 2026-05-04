/**
 * Verifies that browser convertRange(...) produces byte-identical NBT output
 * to the existing @taku128/mcworld (Node, leveldb-zlib) on the same fixture.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { convertMcworld } from '@taku128/mcworld';
import { openMcworld } from '../dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, '../../../../packages/go/test/testdata/Elevator.mcworld');

test('convertRange byte-matches Node convertMcworld', async () => {
  const range = { minX: -16, maxX: 16, minY: -10, maxY: 30, minZ: -16, maxZ: 16, dimension: 0 };

  const nodeResult = await convertMcworld(FIXTURE, range);

  const zipBytes = new Uint8Array(readFileSync(FIXTURE));
  const handle = openMcworld(zipBytes);
  const browserResult = handle.convertRange(range);

  assert.deepEqual(browserResult.size, nodeResult.size, 'size mismatch');
  assert.equal(browserResult.blockCount, nodeResult.blockCount, 'blockCount mismatch');
  assert.equal(browserResult.paletteCount, nodeResult.paletteCount, 'paletteCount mismatch');
  assert.deepEqual(
    Buffer.from(browserResult.nbt),
    Buffer.from(nodeResult.nbt),
    'gzipped NBT bytes differ',
  );
});
