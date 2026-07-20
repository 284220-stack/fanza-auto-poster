# アーキテクチャ

## 構成

単一のNode.jsアプリ内で投稿エンジンと分析エンジンをモジュール分離する。データの正本はPostgreSQLとし、Chrome拡張は利用者のブラウザー内でのみFANZAお気に入り画面を扱う。

```text
FANZA / DMM（許可された商品情報） ─┐
Chrome拡張（お気に入り画面） ───────┼─> Node.js / TypeScript ─> PostgreSQL
管理画面（HTML/CSS/JS） ─────────────┤      ├─ 投稿エンジン ─> X API (OAuth 1.0a)
Railway（常駐プロセス） ──────────────┘      └─ 分析エンジン
```

| 要素 | 責務 |
| --- | --- |
| 管理画面 | 指定女優、設定、履歴、実績、同期・失敗結果の管理 |
| Chrome拡張 | お気に入りを一括取得して同期APIへ送信。FANZA認証情報は送信・保存しない |
| 取得アダプター | 商品ID、販売状態、価格、セール・新作、動画、アフィリエイトURLの正規化 |
| 投稿エンジン | 候補選定、必須条件、枠、文面、親投稿、返信、結果記録 |
| 分析エンジン | 投稿・除外・失敗・日次実績を集計 |
| PostgreSQL | 各業務データの正本 |
| 常駐スケジューラー | 定期実行と重複起動防止 |

## PostgreSQL接続基盤（Step 1）

- DBモジュールは `process.env` を参照するだけで、`.env` を読み込まない。既存のYahoo!メール・X設定の環境変数読込み方針を変更しない。
- `DATABASE_URL` が設定されている場合だけ、`pg.Pool` を遅延生成する。アプリ起動時にはDB接続を試行しないため、未設定でも既存機能は起動できる。
- DB必須処理は `getDatabasePool()` または `checkDatabaseConnection()` を利用する。未設定時は接続文字列を含まない `DATABASE_URL is required for database operations.` エラーを返す。
- 接続確認は `SELECT 1` を実行する。接続失敗時は接続文字列やDBドライバーの詳細を露出せず、一定の接続確認エラーを返す。
- SSLは `DATABASE_SSL=true` または `PGSSLMODE=require` 等で有効化する。証明書検証は既定で有効であり、`DATABASE_SSL_REJECT_UNAUTHORIZED=false` または `PGSSLMODE=no-verify` の明示設定時だけ無効にする。
- DBの終了ハンドラは冪等で、Poolを終了するだけである。プロセス終了、HTTPサーバー停止、worker停止は将来のアプリ全体の終了オーケストレーションが担当する。業務テーブルはStep 1では作成しない。

## 初期スキーマ（Step 2）

```text
products ─< product_actresses >─ actresses
    │
    ├─< favorites
    └─< post_history

settings（独立したシステム設定）
```

- `products` はFANZA商品IDを一意に保持する商品正本である。
- `actresses` と `product_actresses` は複数女優と複数商品の関係を表す。
- `favorites` は同期対象の商品を一意に保持し、商品削除時は連動削除する。
- `post_history` はX投稿IDを一意に保持し、商品ごとの投稿日時から30日再投稿制限を判定できる。
- `settings` はキーを主キーとするシステム設定である。
- `products`、`actresses`、`favorites`、`post_history`、`settings` は更新時に`updated_at`を自動更新する。

## 商品データ基盤（Step 4A）

- `ProductRepository` はproductsテーブルの一覧・取得・存在確認・登録・更新・セール更新・サンプル動画更新・削除だけを担当し、すべてのSQLをパラメータ化する。
- `ProductService` はタイトル、FANZA商品ID、URL、価格、セール価格、商品状態を正規化・検証する。重複と存在しない更新は安全な業務エラーとして扱う。
- 商品取得、FANZAアクセス、Chrome拡張、HTTP API、管理画面、X投稿はこの基盤の対象外である。

## 商品取得Provider基盤（Step 4B）

- Provider共通モデルはsource、外部商品ID、URL、価格、女優名、取得日時、rawDataを表し、Provider Registryがsource単位で実装を登録・取得する。
- 正規化は不正な候補を警告付きで除外し、1件の不正で全件を失敗させない。rawDataから認証情報・Cookie等を除外する。
- FANZAへの実アクセス、HTML解析、Chrome拡張、商品保存、定期実行は後続Stepで実装する。

## セール商品保存・更新（Step 4D）

- Sale Providerの共通結果をProduct Service経由で保存する。既存商品は商品IDで取得し、Provider未取得の任意項目を保持した完全入力として更新する。
- 公開境界は `persistSaleProducts(provider, writer)` であり、次のRunnerはProviderと`ProductWriter`をDIして利用する。女優関連付け・定期実行はこの層に含めない。

## セール同期Runner（Step 4E）

- `SaleSyncRunner` はProvider、ProductWriter、任意LoggerをDIし、`persistSaleProducts`の結果を実行時間と同期status付きのSyncResultへ集計する。Cron登録は後続である。

## 指定女優管理API（Step 3B）

- dashboardは女優管理のHTTPルーティングだけを担当し、SQLは `ActressRepository`、入力正規化と業務ルールは `ActressService` に分離する。
- APIは `GET /api/actresses`、`GET /api/actresses/:id`、`POST /api/actresses`、`PATCH /api/actresses/:id`、`PATCH /api/actresses/:id/enabled`、`DELETE /api/actresses/:id` を提供する。一覧では `search` と `enabled` を指定できる。
- `DATABASE_URL` 未設定時はPoolが遅延生成されないためdashboardは起動できる。女優APIの実行時だけ安全な500応答を返し、接続文字列、SQL、バインド値、スタックトレースは返さない。
- Serviceの入力・未検出・重複・関連商品の削除競合は、HTTP層でそれぞれ400・404・409へ変換する。DB障害と予期しないエラーは安全な500応答に統一する。

## 指定女優管理画面（Step 3C）

- 既存dashboardのHTML/CSS/JavaScript内に、指定女優の一覧、検索・有効状態絞込み、追加、編集、有効化切替、削除を追加する。既存のYahoo!メール設定画面は維持する。
- UIは女優管理APIだけを利用し、入力したaliasesをカンマまたは改行区切りから配列に変換して送信する。
- 一覧描画はDOM APIと`textContent`を使い、APIの応答値をHTMLとして挿入しない。通信中は操作を無効化し、APIエラーは安全なメッセージとして画面に表示する。

## 投稿フロー

1. スケジューラーが投稿エンジンを起動する。
2. 商品情報と同期済みお気に入りから、3区分の候補を作成する。
3. 必須条件、30日制限、文面重複、区分別・日次上限を検証する。
4. 動画付き親投稿をXへ投稿する。
5. 成功した親投稿IDへ、作品案内とアフィリエイトURLを返信する。
6. 結果をPostgreSQLへ記録し、分析エンジンが管理画面へ提供する。

親投稿が失敗した場合は返信しない。返信が失敗した場合は親投稿IDと失敗内容を記録する。

## セキュリティと配置

- X API資格情報、アフィリエイトID、管理画面パスワードは環境変数で供給する。
- 同期APIはアプリ用認証、入力検証、HTTPSを前提とする。
- 商品IDを再投稿制限の主キーとし、URL文字列だけに依存しない。
- 商品情報の取得方式はサービス規約・利用条件に適合させる。
- Railway上でWeb/APIと常駐スケジューラーを稼働し、Railway PostgreSQLへ接続する。将来はWebとワーカーを分離できるモジュール境界を保つ。
