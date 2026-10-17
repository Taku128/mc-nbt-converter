# tests/golden

JS と Go の両実装が同じ `.mcstructure` を変換した際、**semantic に等価な** Java Structure NBT
(size / DataVersion / 座標→block state の全マップ) を出力することを保証するクロステスト。

バイト一致は意図的に要求しない — gzip ヘッダや NBT compound のキー順は実装間で異なり得る
(比較は deepslate で両出力をパースして行う)。なお Go 実装単体の出力は決定的
(同一入力 → 同一バイト列。Properties のキーソート書き出しで保証)。

## 実行

```bash
# 事前に JS のビルドと Go toolchain が必要
pnpm install && pnpm -r --filter './packages/js/*' run build
node tests/golden/run.mjs
```

fixtures は `tests/golden/fixtures/*.mcstructure` (無ければ packages/go/test/testdata の
elevator.mcstructure にフォールバック)。CI では golden ジョブが毎 push/PR で実行する。

| fixture | 中身 |
|---|---|
| `oriented-blocks.mcstructure` | 向き付きブロックの合成 (版 1。`tools/gen-oriented-fixture.mjs`) |
| `bds-26.52-v2-small.mcstructure` | BDS 1.26.52.3 の Script API が書いた版 2 (8×4×8)。`block_indices` は IntArray が 2 層。チェスト・看板・ホッパー・コンパレーター・水没した階段入り |
| `bds-26.52-v2-one-layer.mcstructure` | 同じく版 2 (16×16×16)。水没が無いので 2 層目は省略されている |

版 2 (統合版 26.50〜) は `block_indices` が List<IntArray> で、2 層目は空なら省略される (#12)。
BDS の 2 つは redtact-com/redtact-live#29 の実測で、`createFromWorld` した Structure を
server-net の HTTP の本文にしたもの (gzip) を展開して保存した。
