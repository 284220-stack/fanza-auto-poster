# 開発環境セットアップ（Windows）

## 必要なソフトウェア

- Git
- Node.js（プロジェクトが要求するLTS版）とnpm
- Visual Studio Code
- VS Code用Codex拡張

インストール後、PowerShellで確認する。

```powershell
git --version
node --version
npm --version
code --version
```

## リポジトリの取得

```powershell
git clone <repository-url>
Set-Location <repository-directory>
git status
git branch --show-current
npm install
```

## VS CodeとCodex

1. VS Codeでcloneしたフォルダーを開く。
2. 拡張機能ビューからCodex拡張をインストールし、認証する。
3. 統合ターミナルをPowerShellで開く。
4. 作業開始時に `ProjectStatus.md` と `AGENTS.md` を確認する。

## 基本検証

変更後はプロジェクト直下で実行する。

```powershell
npm run check
npm test
npm run build
git diff --check
```

## PostgreSQL（Step 1）

`.env.example` を参考に、ローカルではGit管理しない `.env` に `DATABASE_URL` を設定する。マイグレーションコマンドはこのファイルを読み込む一方、アプリのDB接続モジュールは `process.env` だけを参照する。ローカルでアプリからDBを使う場合はPowerShellで `DATABASE_URL` を環境変数として設定する。既存アプリは未設定でも起動するが、DB接続が必要な処理は明確な設定エラーになる。

```powershell
npm run db:migrate
npm run db:migrate:down
npm run db:migrate:create -- <migration-name>
```

`db:migrate:create` はTypeScriptのマイグレーション雛形を `migrations/` に作成する。Step 1では業務テーブルを作成しない。Railwayでは `DATABASE_URL` をサービス変数として設定し、本番のSSL接続を確認する。

Railway等でTLSが必要な場合は `DATABASE_SSL=true` を設定する。証明書検証は既定で有効であり、例外的に必要な場合だけ `DATABASE_SSL_REJECT_UNAUTHORIZED=false` を設定する。

## セール同期の手動実行（Step 5A）

`DATABASE_URL`、`DMM_API_ID`、`DMM_AFFILIATE_ID` を環境変数に設定したうえで、PowerShellから一回だけ実行します。

```powershell
npm run sync:sales
```

成功時の終了コードは0です。一部成功、失敗、または同一プロセスで実行中の場合は終了コード1です。Railway Schedulerを設定する後続Stepでは、スケジュールのコマンドに同じ `npm run sync:sales` を指定します。時刻・頻度の設定はこのStepでは行いません。

## 実環境スモークテスト（Step 5B）

ローカルまたはRailwayの実行環境で、`DATABASE_URL`、`DMM_API_ID`、`DMM_AFFILIATE_ID` を環境変数として設定したうえで、まず保存を行わない既定モードを実行します。

```powershell
npm run sync:sales:check
```

このコマンドは設定有無、PostgreSQL接続、DMM ItemListの最小取得だけを確認し、商品保存は行いません。すべて成功した場合だけ、明示的に `--persist` を指定して一回の保存・更新を確認します。

```powershell
npm run sync:sales:check -- --persist
```

成功時は終了コード0、設定不足・取得失敗・保存失敗は終了コード1です。Railwayでは同じ環境変数をServiceに設定して手動実行ログで確認できますが、Schedulerの作成・実行時刻・頻度の設定はまだ行いません。

## 実環境E2E確認チェックリスト（Step 5C）

実行前に、ローカルまたはRailwayの実行プロセスへ次の環境変数が設定されていることを、値を表示せずに確認します。

- `DATABASE_URL`
- `DMM_API_ID`
- `DMM_AFFILIATE_ID`

ローカルで `.env` を使う場合は、Node.jsの `--env-file` で明示的に読み込みます。通常の `npm run` は `.env` を自動読み込みしません。

```powershell
npm run build
node --env-file=.env dist/sync-sales-check.js
```

上記はcheck-onlyです。`configuration: ok`、`database: ok`、`provider: ok`、`persistence: not_run`、終了コード0を確認し、productsへの保存が行われていないことを確認します。

check-onlyが成功し、保存してよい実環境であることを確認した場合だけ、次を一回実行します。

```powershell
node --env-file=.env dist/sync-sales-check.js --persist
```

persistでは `persistence: ok`、`syncStatus: success`、終了コード0を確認します。対象商品が取得された場合、初回は`createdCount`、同じ商品を再確認した場合は`updatedCount`が増加します。対象候補が0件の場合は、保存件数が0でもProvider確認自体は成功になり得ます。`warningsCount`は確認し、`errorsCount`は0であることを確認します。

Railwayでは、Serviceに同じ3つの環境変数を設定したうえで、手動実行用コマンドとして次を使用します。Schedulerはまだ設定しません。

```text
npm run sync:sales:check
npm run sync:sales:check -- --persist
```

失敗時は値を共有せず、状態だけで切り分けます。`configuration: failed` は環境変数不足、`database: failed` は接続先・SSL・到達性、`provider: failed` はDMM認証または外部API到達性、`persistence: failed` または `syncStatus: partial_success/failed` は保存処理の失敗または一部失敗を示します。失敗時の終了コードは1であり、詳細な認証情報・SQL・URLは出力されません。

### Sale Provider警告分類

`sync:sales:check` の出力には、警告の合計に加えて `warningReasons` が `reason=count` 形式で表示されます。商品名、商品ID、URL、価格、キャンペーン名、認証値は表示されません。

- `campaign_missing`: キャンペーン情報なし
- `campaign_out_of_period`: キャンペーン期間外または期間情報不正
- `price_missing`: 通常価格または現在価格なし
- `invalid_price`: 価格値不正
- `price_not_discounted`: 通常価格以下になっていない
- `required_field_missing`: 商品の必須項目なし
- `invalid_url`: 商品URL不正
- `normalization_failed`: 共通正規化で除外

`fetchedCount: 0` かつ `warningsCount` が大きい場合は、`warningReasons` の最多コードを確認して除外理由を判断します。診断のために保存ロジックやセール判定条件を変更しないでください。

既存の管理画面起動コマンドは `npm run dashboard`。認証情報、トークン、アフィリエイトID、パスワードはリポジトリへ追加せず、環境変数等で安全に管理する。
