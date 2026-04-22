# bedrock-nbt-converter

Bedrock Edition の `.mcworld` / `.mcstructure` ファイルを Java Edition の Structure NBT (`.nbt`) 形式に変換するライブラリ＋CLI。

[deepslate](https://github.com/misode/deepslate) や nbtViewer 等の Java NBT 互換ツールで Bedrock のワールドデータを 3D レンダリングできます。

## インストール

```bash
npm install bedrock-nbt-converter
```

## API 使用例

### .mcstructure → Java NBT

```javascript
import { convertMcstructure } from 'bedrock-nbt-converter';
import fs from 'fs';

const result = await convertMcstructure('./my-build.mcstructure');
fs.writeFileSync('output.nbt', result.nbt);

console.log(result.size);       // [10, 106, 8]
console.log(result.blockCount); // 5015
```

### .mcworld → Java NBT（座標範囲指定）

```javascript
import { convertMcworld } from 'bedrock-nbt-converter';
import fs from 'fs';

const result = await convertMcworld('./world.mcworld', {
  minX: -5, maxX: 4,
  minY: -50, maxY: 55,
  minZ: 16, maxZ: 23
});
fs.writeFileSync('region.nbt', result.nbt);
```

### Buffer API（React/Angular等のブラウザ用途）

```javascript
import { convertMcstructureBuffer } from 'bedrock-nbt-converter';

// File API から取得した ArrayBuffer を直接変換
const file = event.target.files[0];
const buffer = new Uint8Array(await file.arrayBuffer());
const result = await convertMcstructureBuffer(buffer);
// result.nbt → gzipped Java Structure NBT (Buffer)
```

### 内部低レベル API (カスタムパース等)

独自のチャンクループなどを実装したい開発者向けに、サブチャンクのみの解読やNBTバッファの構築を行う低レイヤーAPIも公開しています。

```javascript
import { parseSubChunk, buildStructureNbt } from 'bedrock-nbt-converter';

// 1. Bedrock LevelDB から読みだした生の Value (Buffer) を渡す
const decodedChunk = parseSubChunk(rawSubChunkBuffer);
// { palette: [{ name: 'minecraft:stone', properties: {} }], blocks: Uint16Array(4096) }

// 2. 任意のサイズとブロック情報から Java Structure NBT を構築
const nbtBuffer = buildStructureNbt({
  size: [10, 10, 10],
  palette: [ { Name: "minecraft:stone" } ],
  blocks: [ { pos: [0, 0, 0], state: 0 } ]
});
```

### ブロックマッピング単体利用

```javascript
import { mapBlock } from 'bedrock-nbt-converter';

const java = mapBlock('minecraft:concrete', { color: 'gray' });
// { name: 'minecraft:gray_concrete', properties: {} }
```

## CLI

```bash
# .mcstructure → .nbt
npx bedrock-nbt-converter build.mcstructure -o build.nbt

# .mcworld → .nbt（座標範囲指定）
npx bedrock-nbt-converter world.mcworld -o region.nbt \
  --min-x -10 --max-x 10 --min-y -64 --max-y 64 --min-z -10 --max-z 10

# ヘルプ
npx bedrock-nbt-converter --help
```

### CLI オプション

| オプション | 説明 |
|------------|------|
| `-o, --output <path>` | 出力ファイルパス |
| `-f, --format <type>` | `mcworld` \| `mcstructure`（拡張子から自動判定） |
| `--min-x, --max-x <n>` | X座標フィルタ（mcworld のみ） |
| `--min-y, --max-y <n>` | Y座標フィルタ（デフォルト: -64〜320） |
| `--min-z, --max-z <n>` | Z座標フィルタ（mcworld のみ） |
| `--dimension <n>` | 0=オーバーワールド, 1=ネザー, 2=エンド |

## 返り値

すべての変換関数は以下の形式のオブジェクトを返します:

```typescript
{
  nbt: Buffer;         // gzip圧縮された Java Structure NBT
  size: number[];      // [x, y, z] 構造体サイズ
  blockCount: number;  // 非airブロック数
  paletteCount: number; // パレットエントリ数
}
```

## 依存関係

- [adm-zip](https://www.npmjs.com/package/adm-zip) - .mcworld (ZIP) 展開
- [leveldb-zlib](https://www.npmjs.com/package/leveldb-zlib) - Bedrock LevelDB 読み取り
- [prismarine-nbt](https://www.npmjs.com/package/prismarine-nbt) - NBT パース / 書き込み

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

## Credits & Acknowledgements

This project's block mapping logic and JSON lookup data (`data/chunker-mappings.json`) are heavily derived from the source code of the [Chunker](https://github.com/HiveGamesOSS/Chunker) project by Hive Games, which is an actively maintained Bedrock & Java conversion tool. The extracted data is distributed under the terms of Chunker's MIT License. We extend our sincere gratitude to Hive Games for making their comprehensive mapping data open source.
