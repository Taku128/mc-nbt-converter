const BLOCK_SIZE = 32 * 1024;
const HEADER_SIZE = 7;

const RECORD_FULL = 1;
const RECORD_FIRST = 2;
const RECORD_MIDDLE = 3;
const RECORD_LAST = 4;

export function* readRecords(file: Uint8Array): Generator<Uint8Array> {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let pos = 0;
  let pending: Uint8Array | null = null;
  while (pos + HEADER_SIZE <= file.length) {
    const blockEnd = Math.min(file.length, Math.floor(pos / BLOCK_SIZE) * BLOCK_SIZE + BLOCK_SIZE);
    if (blockEnd - pos < HEADER_SIZE) {
      pos = blockEnd;
      continue;
    }
    const length = view.getUint16(pos + 4, true);
    const type = view.getUint8(pos + 6);
    pos += HEADER_SIZE;
    if (type === 0 && length === 0) {
      pos = blockEnd;
      continue;
    }
    if (pos + length > file.length) break;
    const payload = file.subarray(pos, pos + length);
    pos += length;
    if (type === RECORD_FULL) {
      yield payload;
      pending = null;
    } else if (type === RECORD_FIRST) {
      pending = payload.slice();
    } else if (type === RECORD_MIDDLE && pending) {
      const head: Uint8Array = pending;
      const merged = new Uint8Array(head.length + payload.length);
      merged.set(head, 0);
      merged.set(payload, head.length);
      pending = merged;
    } else if (type === RECORD_LAST && pending) {
      const head: Uint8Array = pending;
      const merged = new Uint8Array(head.length + payload.length);
      merged.set(head, 0);
      merged.set(payload, head.length);
      yield merged;
      pending = null;
    }
  }
}
