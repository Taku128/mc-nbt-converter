# mc-nbt-converter

Minecraft **Bedrock Edition** 構造データ（`.mcstructure` / `.mcworld`）を **Java Edition** Structure NBT に変換するライブラリ群のモノレポ。

JS/TS と Go の両実装を単一マッピングソースのもとで提供し、ブラウザ・Node.js・Go バックエンドいずれでも使えます。

## 構成

```
mc-nbt-converter/
├── shared/mappings/          # JS/Go 共通マッピング（単一ソース）
│   ├── chunker-mappings.json # Chunker 由来（自動同期）
│   ├── overrides.json        # 手動追記・上書き
│   ├── aliases.json          # 旧名 → 新名
│   └── fallbacks.json        # 不明時の代替ルール
├── packages/
│   ├── js/
│   │   ├── core/             # @mc-nbt/core          — マッピング + NBT構築（ブラウザ可）
│   │   ├── mcstructure/      # @mc-nbt/mcstructure   — .mcstructure 専用（ブラウザ可）
│   │   ├── mcworld/          # @mc-nbt/mcworld       — .mcworld 抽出（Node 専用）
│   │   └── all/              # bedrock-nbt-converter — 全部入りメタパッケージ
│   └── go/                   # github.com/Taku128/mc-nbt-converter/packages/go
├── tests/golden/             # JS/Go 出力一致のクロステスト
└── tools/sync-mappings/      # Chunker 週次同期
```

## パッケージの使い分け

| パッケージ | 環境 | 用途 |
|-----------|------|------|
| `@mc-nbt/core` | Browser / Node | マッピング照会・NBT組立のみ |
| `@mc-nbt/mcstructure` | Browser / Node | `.mcstructure` パース・変換（配布回路の閲覧、材料リスト、部分表示） |
| `@mc-nbt/mcworld` | Node | `.mcworld` の LevelDB 抽出 |
| `bedrock-nbt-converter` | Node | CLI 含む全部入り（既存公開名互換） |
| Go パッケージ | Go | バックエンド・高速処理 |

## マッピング設計

「全ブロックを notfound なく変換できる」ことを最優先に 4 レイヤー構成:

1. `overrides.json` — 手動で Chunker を上書き
2. `chunker-mappings.json` — Chunker 自動同期
3. `aliases.json` — 旧名 → 新名
4. `fallbacks.json` — 不明時の既定値

カバレッジテストで `notfound=0` を CI で担保します。

## クロステスト

`tests/golden/` に同一 `.mcstructure` を配置し、JS と Go 両実装でバイト一致を検証します。

## License

MIT — Chunker 由来データは HiveGamesOSS/Chunker の MIT License に準拠。
