# tests/golden

JS と Go の両実装が同じ `.mcstructure` を変換した際、**バイト単位で同じ Java Structure NBT** を出力することを保証するクロステスト。

## 実行

```bash
# JS側変換 → Go側変換 → diff
node tests/golden/run.mjs
```

## テストデータ

`fixtures/*.mcstructure` に Bedrock の小規模構造を配置。大きな構造は `.gitattributes` で LFS 管理。

現時点では `packages/go/test/testdata/elevator.mcstructure` を参照用として流用可能。

## 失敗時の対応

1. どちらの実装が想定通りか確認（`shared/mappings/` の更新が反映されているか `pnpm sync-mappings` を実行）
2. 片方のロジックに退行がないか確認
3. 期待値を更新する必要がある場合は両実装で再生成し PR で説明
