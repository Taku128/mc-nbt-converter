# @taku128/mcstructure

Convert Bedrock `.mcstructure` files to Java Edition Structure NBT.  
Works in the **browser** (File API) and **Node.js**.

## Install

```bash
npm install @taku128/mcstructure
```

## Browser usage

```ts
import { convertMcstructureBuffer } from '@taku128/mcstructure';

// From <input type="file">
const buf = new Uint8Array(await file.arrayBuffer());
const result = await convertMcstructureBuffer(buf);

// result.nbt  — Uint8Array (gzipped Java Structure NBT)
// result.size — [x, y, z]
// result.blockCount   — non-air blocks
// result.paletteCount — unique block states
```

## Node.js usage (file path)

```ts
import { convertMcstructure } from '@taku128/mcstructure/node';

const result = await convertMcstructure('./build.mcstructure');
import { writeFileSync } from 'node:fs';
writeFileSync('build.nbt', result.nbt);
```

## API

### `convertMcstructureBuffer(buffer: Uint8Array | ArrayBuffer): Promise<ConvertResult>`

Browser-safe. Parses a `.mcstructure` buffer and returns Java NBT.

### `convertMcstructure(inputPath: string): Promise<ConvertResult>` — `/node` subpath

Node-only. Reads the file at `inputPath` and delegates to `convertMcstructureBuffer`.

### `ConvertResult`

```ts
interface ConvertResult {
  nbt: Uint8Array;          // gzipped Java Structure NBT
  size: [number, number, number];
  blockCount: number;       // non-air Java blocks
  paletteCount: number;     // unique Java block states
}
```

## License

MIT
