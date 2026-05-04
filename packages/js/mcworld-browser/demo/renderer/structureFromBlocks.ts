import { NbtFile } from 'deepslate/nbt';
import { Structure } from 'deepslate/render';
import type { WorldHandle, ReadBlocksOptions } from '../../src/index.js';

export interface PreviewStructure {
  structure: Structure;
  blockNames: string[];
}

/**
 * mcstructure と同一の経路で Structure を生成する:
 *   convertRange (=postProcessBlocks + buildStructureNbt) → NBT → Structure.fromNbt
 *
 * 直接 addBlock する旧実装と異なり、
 *   - redstone wire の N/S/E/W 接続が postProcess で解決される
 *   - piston の extended が補正される
 *   - mcstructure 経路と完全に同じ NBT を経由するので挙動が一致する
 */
export function buildPreviewStructure(
  handle: WorldHandle,
  opts?: ReadBlocksOptions,
): PreviewStructure | null {
  let nbt: Uint8Array;
  try {
    nbt = handle.convertRange(opts).nbt;
  } catch (err) {
    if ((err as Error).message.includes('No blocks')) return null;
    throw err;
  }
  const file = NbtFile.read(nbt);
  const structure = Structure.fromNbt(file.root);
  const names = new Set<string>();
  for (const b of structure.getBlocks()) names.add(b.state.getName().toString());
  return { structure, blockNames: [...names] };
}
