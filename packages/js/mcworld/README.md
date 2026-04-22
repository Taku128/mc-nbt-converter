# @mc-nbt/mcworld

Convert Bedrock `.mcworld` (LevelDB zip) files to Java Edition Structure NBT.  
**Node.js only** — requires LevelDB native bindings.

## Install

```bash
npm install @mc-nbt/mcworld
```

## Usage

```ts
import { convertMcworld } from '@mc-nbt/mcworld';
import { writeFileSync } from 'node:fs';

const result = await convertMcworld('./world.mcworld', {
  minX: -10, maxX: 10,
  minY: -64, maxY: 320,
  minZ: -10, maxZ: 10,
  dimension: 0,  // 0=overworld, 1=nether, 2=end
});

writeFileSync('output.nbt', result.nbt);
console.log(`Size: ${result.size.join('×')}, Blocks: ${result.blockCount}`);
```

## API

### `convertMcworld(inputPath: string, options?: ConvertMcworldOptions): Promise<ConvertResult>`

Reads a `.mcworld` zip, opens the embedded LevelDB, extracts sub-chunks within the given coordinate bounds, and emits gzipped Java Structure NBT.

### `ConvertMcworldOptions`

```ts
interface ConvertMcworldOptions {
  minX?: number;   // default: -Infinity
  maxX?: number;   // default:  Infinity
  minY?: number;   // default: -64
  maxY?: number;   // default:  320
  minZ?: number;   // default: -Infinity
  maxZ?: number;   // default:  Infinity
  dimension?: number;  // 0=overworld, 1=nether, 2=end (default: 0)
}
```

### `ConvertResult`

```ts
interface ConvertResult {
  nbt: Uint8Array;
  size: [number, number, number];
  blockCount: number;
  paletteCount: number;
}
```

## Requirements

- Node.js ≥ 18
- Depends on `leveldb-zlib` (native addon; prebuilds available for major platforms)

## License

MIT
