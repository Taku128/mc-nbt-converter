# shared/mappings

JS と Go 両実装が共有する Bedrock → Java ブロック変換マッピング。

## ロード順（notfound を最小化する4レイヤー）

1. **`aliases.json`** — 入力ブロック名を正規化（旧名 → 新名）
2. **`overrides.json`** — Chunker にない、または Chunker の挙動を修正したいマッピング
3. **`chunker-mappings.json`** — Chunker 由来の自動同期データ（基底）
4. **`fallbacks.json`** — 上記すべてで解決できなかったときのルール

## 各ファイル

### `chunker-mappings.json` （自動）

[HiveGamesOSS/Chunker](https://github.com/HiveGamesOSS/Chunker) のマッピングデータを週次で同期。手動編集禁止。

形式:
```json
{
  "metadata": { "generated": "...", "source": "chunker" },
  "names": { "minecraft:<bedrock>": "minecraft:<java>" },
  "flatten": { "minecraft:<bedrock>": { "<propKey>": { "<value>": "minecraft:<java>" } } }
}
```

### `overrides.json` （手動）

Chunker にない・Chunker の挙動を修正したい場合に記入する。`names` と `flatten` は同じ形式。

### `aliases.json` （手動）

Bedrock 側の旧ブロック名（キャメルケース時代など）を新ブロック名に正規化する。

### `fallbacks.json` （手動、挙動設定）

| キー | 型 | 説明 |
|------|-----|------|
| `defaultBlock` | string | 全て失敗したときの最終フォールバック（例: `minecraft:stone`） |
| `useIdentityFallback` | bool | `true` で `minecraft:xxx` をそのまま Java 名として使う |
| `stripPropertiesOnFallback` | bool | identity fallback 時にプロパティを削除 |
| `logUnmapped` | bool | 未マップブロック名の収集（テスト用） |

## カバレッジ

`pnpm --filter @taku128/all run test:coverage` で全 Bedrock ブロックに対する解決率を測定。CI で `notfound=0` を担保。
