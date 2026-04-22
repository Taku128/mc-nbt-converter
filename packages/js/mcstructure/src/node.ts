/**
 * Node-only file-path entry for @taku128/mcstructure.
 *
 * Import via: `import { convertMcstructure } from '@taku128/mcstructure/node';`
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { convertMcstructureBuffer, type ConvertResult } from './index.js';

export { convertMcstructureBuffer, type ConvertResult };

/** Convert a .mcstructure file on disk to Java Structure NBT. */
export async function convertMcstructure(inputPath: string): Promise<ConvertResult> {
  const filePath = resolve(inputPath);
  const buf = await readFile(filePath);
  return convertMcstructureBuffer(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
}
