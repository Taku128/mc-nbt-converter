import { unzipSync } from 'fflate';

/**
 * Extract a .mcworld zip into a Map<filename, bytes> containing only entries
 * inside the LevelDB `db/` directory. Filenames in the returned map are bare
 * (no `db/` prefix) so they can be passed straight to openLevelDB.
 */
export function extractDbFiles(zipBytes: Uint8Array): Map<string, Uint8Array> {
  const files = unzipSync(zipBytes);
  const out = new Map<string, Uint8Array>();
  for (const path of Object.keys(files)) {
    const idx = path.lastIndexOf('db/');
    if (idx === -1) continue;
    const name = path.substring(idx + 3);
    if (!name || name.endsWith('/')) continue;
    out.set(name, files[path]!);
  }
  return out;
}
