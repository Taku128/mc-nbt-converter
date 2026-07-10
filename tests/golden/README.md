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
