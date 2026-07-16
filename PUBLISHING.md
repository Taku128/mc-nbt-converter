# Publishing（npm 公開手順）

このモノレポのリリースが npm に届くまでの流れと、npmjs.com 側で 1 回だけ必要な
手動セットアップをまとめる。

## リリースフロー（自動）

1. changeset（`.changeset/*.md`）を含む PR が `main` にマージされる。
2. `.github/workflows/publish.yml` の `changesets/action` が
   **"Version Packages"** PR を作成/更新する。
3. その PR をマージすると同じ workflow が再度走り、`pnpm changeset publish` が
   npm 未公開バージョンの全パッケージを publish し、git タグ push と
   GitHub Release 作成まで行う。

publish の認証は **npm trusted publishing（OIDC）** — CI に長期シークレットを
置かない方式。パッケージごとに npmjs.com での 1 回きりの登録（下記）が必要で、
登録が済むまで CI publish は `ENEEDAUTH` で失敗する。

## このリポジトリのパッケージ

| npm パッケージ | ディレクトリ |
| --- | --- |
| `@taku128/core` | `packages/js/core` |
| `@taku128/mcstructure` | `packages/js/mcstructure` |
| `@taku128/mcworld` | `packages/js/mcworld` |
| `@taku128/mcworld-browser` | `packages/js/mcworld-browser` |
| `@taku128/bedrock-nbt-converter` | `packages/js/all` |

## 初回セットアップ: trusted publisher 登録（npmjs.com で手動）

上の表の **全パッケージ** について繰り返す:

1. <https://www.npmjs.com/> にパッケージオーナー（`taku128`）でログイン。
2. パッケージページ → **Settings** タブ
   （例: `https://www.npmjs.com/package/@taku128/core/access`）。
3. **Trusted Publisher** セクションで **GitHub Actions** を選び、次の値を
   正確に入力:

   | 項目 | 値 |
   | --- | --- |
   | Organization or user | `Taku128` |
   | Repository | `mc-nbt-converter` |
   | Workflow filename | `publish.yml` |
   | Environment name | （空欄のまま） |

4. 保存。次回の "Version Packages" PR マージから、トークンなしで CI publish が
   通り、npm が **provenance 証明** を自動付与する。

補足:

- Workflow filename はファイル名のみ（`publish.yml`。フルパスではない）。
  workflow ファイルを改名したら登録も更新が必要。
- trusted publishing は GitHub ホストランナー限定（本リポジトリは
  `ubuntu-latest` なので問題なし）。
- OIDC publish の動作確認後の任意強化: 各パッケージの Settings →
  *Publishing access* で **トークンを禁止する** オプションを選ぶ。trusted
  publishing はトークンではないので CI は動き続け、漏洩トークンは無効化される。
  下記のトークンフォールバックが不要になってから行うこと。

## フォールバック: トークン方式（`NPM_TOKEN`）

OIDC が使えない場合に備え、workflow は従来のトークン認証にも対応している。
`NPM_TOKEN` シークレットが設定されていると **OIDC より優先** される
（changesets/action が `~/.npmrc` に書き込むため）。

1. npmjs.com → アバター → **Access Tokens** → **Generate New Token** →
   **Granular Access Token**:
   - Expiration: 有限の期限を設定（ローテーション前提）。
   - Packages and scopes: **Read and write**、`@taku128` スコープ
     （または上の表のパッケージのみ選択）。
2. リポジトリシークレットに登録:

   ```bash
   gh secret set NPM_TOKEN --repo Taku128/mc-nbt-converter
   ```

OIDC に戻すにはシークレットを削除する:

```bash
gh secret delete NPM_TOKEN --repo Taku128/mc-nbt-converter
```

## ローカルからの手動 publish（最終手段）

```bash
pnpm install --frozen-lockfile
node tools/sync-mappings/sync.mjs
pnpm run build
pnpm changeset publish   # 必要に応じて npm login / OTP を要求される
git push --follow-tags
```

## トラブルシューティング

| 症状 | 原因の見当 |
| --- | --- |
| CI で `ENEEDAUTH` | そのパッケージの trusted publisher 未登録、かつ `NPM_TOKEN` シークレット未設定。 |
| OIDC トークン交換が失敗 / 404 | trusted publisher 登録の項目不一致（リポジトリ名・workflow ファイル名・environment）。 |
| `E422` / provenance エラー | package.json の `repository.url` がこの GitHub リポジトリと不一致。 |
| publish 成功だが provenance バッジなし | `publish.yml` の `NPM_CONFIG_PROVENANCE` env と `id-token: write` 権限を確認。 |
