# @mc-nbt/core

Minecraft Bedrock → Java NBT 変換のコアプリミティブ。ブラウザ・Node.js 両対応、~30KB gzip。

## 用途

- Bedrock ブロック名 → Java ブロック名のマッピング
- Java Structure NBT のビルド（TODO: `all/` から移植）
- Bedrock SubChunk パース（TODO: `all/` から移植）

## API

```ts
import { mapBlock, reportUnmapped } from '@mc-nbt/core';

const java = mapBlock('minecraft:concrete', { color: 'gray' });
// { name: 'minecraft:gray_concrete', properties: {} }

// After many conversions:
console.log(reportUnmapped());  // Bedrock names that fell through to the fallback layer
```

## マッピング

4 レイヤー解決順（`notfound=0` を目指した構成）:

1. `aliases.json` — 入力名の正規化
2. `overrides.json` — 手動で Chunker を上書き
3. `chunker-mappings.json` — Chunker 由来（週次自動同期）
4. `fallbacks.json` — 全て外れた場合のルール

詳細は `shared/mappings/README.md` 参照。

## ブラウザで使う

tsup で 4 つの JSON がバンドルにインライン化されるため、`fs` 等の Node API 依存はありません。
