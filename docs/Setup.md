# 開発環境セットアップ（Windows）

## 必要なソフトウェア

- Git
- Node.js 20 LTS とnpm
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

### 価格任意の同期確認（Step 8B）

価格は任意項目です。固定価格以外はNULLとして商品を保存し、価格不明は`price_unavailable`の件数観測だけを行います。価格値、商品情報、URL、認証値はログへ出しません。

```powershell
node --env-file=.env dist/sync-sales-check.js
```

`provider: ok`、`saveCandidateCount`、`priceAvailableCount`、`priceUnavailableCount`、`saleEligibleCount`、`errorCount`を確認します。価格不明件数があっても終了コード0であることを確認後、一回の`--persist`でDB保存件数、商品管理API、投稿候補previewを確認します。`DRY_RUN=true`を維持し、Scheduler、実X投稿、投稿ルール、30日制限は変更しません。

### 商品と女優の関連確認（Step 8D）

persist後、既存女優名・aliasに一致した場合だけ`product_actresses`が保存されます。未一致の女優は自動登録されず、関連0件でも同期は成功します。
- `invalid_url`: 商品URL不正
- `normalization_failed`: 共通正規化で除外

`fetchedCount: 0` かつ `warningsCount` が大きい場合は、`warningReasons` の最多コードを確認して除外理由を判断します。診断のために保存ロジックやセール判定条件を変更しないでください。

### DMM価格形式診断（Step 5D）

`invalid_price` が出た場合、`priceFormats` と `priceDiagnostics` を確認します。どちらも `current_price` または `list_price`、固定形式コード、JavaScript型、配列・オブジェクト判定、文字数だけを集計し、価格実値は表示しません。

変換対象は数値、数字文字列、3桁カンマ区切り、`円`接尾辞、`¥`/`￥`接頭辞、前後空白、全角数字です。空文字、範囲表記、月額などのテキストを含む値、配列・オブジェクト、負数、非有限数は推測せず除外します。

例として、`priceFormats: current_price:comma_separated=1` は現在価格でカンマ区切り形式の変換失敗が1件あったことだけを示します。`priceDiagnostics` は同じ失敗の型・形状・文字数を示します。価格の最小値・最大値・推測値を採用しないでください。

### DMM価格文字種診断（Step 5E）

`unknown_format` の場合は、`priceCharacterPatterns` と `priceCharacterCounts` を確認します。パターンは数字を常に `D` に伏せ、通貨記号を `Y`、範囲記号を `R`、カンマを `C`、空白を `S`、日本語文字を `J`、その他記号を `P`、未認識文字を `X` で表します。

未認識文字は `unknownPriceCodePoints` に `U+` コードポイントと件数だけを表示します。数字のコードポイント、価格実値、商品情報、認証情報は表示しません。診断結果だけで価格を推測・変換せず、変換ルールの変更は別Stepで検討してください。

既存の管理画面起動コマンドは `npm run dashboard`。認証情報、トークン、アフィリエイトID、パスワードはリポジトリへ追加せず、環境変数等で安全に管理する。

## X投稿（Step 6E）

実投稿には`X_APP_KEY`、`X_APP_SECRET`、`X_ACCESS_TOKEN`、`X_ACCESS_SECRET`と、明示的な`DRY_RUN=false`が必要です。既定の`DRY_RUN=true`ではX API通信も投稿履歴保存も行いません。値は表示・コミットしないでください。

## 投稿スケジューラーCLI（Step 6K）

`npm run posts:run`は既定でpreviewを一回実行し、X APIと投稿履歴を更新しません。`npm run posts:run -- --execute`はexecuteモードを選びますが、これだけで`DRY_RUN`をfalseにはしません。実投稿には環境変数で明示した`DRY_RUN=false`と必要なX認証情報が必要です。

件数は`npm run posts:run -- --limit 5`または`--limit=5`で指定でき、上限は5です。出力は件数、productId、カテゴリ、action、statusだけの安全な要約です。preview成功とexecute全成功は終了コード0、executeでpartial_successまたはblockedを含む場合、設定不足・全失敗・already_runningは終了コード1です。CLIは終了時にDB Poolを閉じます。Railway Schedulerの画面設定と分散ロックは未実装です。

## Railway preview運用確認（Step 6L）

Railway productionで`npm run posts:run`を一回実行し、候補0件・各件数0・終了コード0を確認済みです。`DRY_RUN=true`によりX APIと`post_history`は更新されず、CLIは終了後に常駐しません。Schedulerは未有効化です。将来設定する場合も単一インスタンスで一回実行し、前回終了後に次回を開始してください。実行時刻・頻度は別途決定します。

## 管理画面・投稿履歴（Step 7A）

`npm run db:migrate`で投稿本文・文字数保存用migrationを適用し、`npm run dashboard`で管理画面を起動します。Basic認証が設定されている場合は認証後に、`#dashboard`、`#products`、`#actresses`、`#post-plan`、`#post-history`、`#operations`、`#settings`を確認できます。

## Railway Node.js とmigration（Step 7B-1）

Railway のNixpacksビルドでは `package.json` の `engines.node` を唯一のNode.jsバージョン指定として使用する。本プロジェクトはNode.js 20 LTSを要求する。productionのmigrationは、Node.js 20で稼働するデプロイを確認してから、Railwayのproduction環境変数を使って `npm run db:migrate` を一回だけ実行する。手動SQLや`db:migrate:down`は使わない。

Step 7B-1ではproductionのNode.js `v20.18.1`を確認し、投稿本文・文字数用migrationを適用済みである。

投稿履歴は`GET /api/post-history`で安全な一覧、`GET /api/post-history/:id`で詳細を取得します。一覧では`dateFrom`、`dateTo`、`status`、`actress`、`product`、`pendingReply`、`page`、`limit`を指定できます。既定のDRY_RUNでは実投稿も履歴保存も行いません。確認時に`DRY_RUN=false`へ変更したり、実投稿を実行したりしないでください。
