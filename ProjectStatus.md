# Project Status

## 現在地

Step 1（PostgreSQL接続基盤）を実装した。既存のYahoo!メール監視、JSON状態保存、投稿処理は変更していない。

## Step 1の実装内容

- `pg.Pool` を遅延生成するDB接続モジュール、`SELECT 1` の接続確認、冪等なPool終了補助を追加した。DBモジュールは`.env`を読み込まず、プロセス終了もしない。
- `DATABASE_URL` 未設定時は既存アプリを起動可能にし、DB必須処理では安全で明確な設定エラーを返す。
- `migrations/`、node-pg-migrate用npm scripts、`.env.example`、実DBを使わないDB接続単体テストを追加した。
- 追加依存関係は `pg`、`node-pg-migrate`、開発用の `@types/pg`。
- 追加環境変数は `DATABASE_URL`、`DATABASE_SSL`、`DATABASE_SSL_REJECT_UNAUTHORIZED`。SSLは明示設定で有効化し、証明書検証の無効化も明示設定が必要。

## 確定事項

- Node.js / TypeScript、HTML / CSS / JavaScript、PostgreSQL、Railway、GitHub、X API OAuth 1.0aを用いる。
- 投稿エンジンと分析エンジンは同一アプリ内でモジュール分離する。
- 日次枠はセール2、指定女優2、お気に入りセール1、合計最大5。候補不足時に補充しない。
- 初期指定女優は北岡果林、依本しおり。複数を管理画面で管理する。
- Chrome拡張がFANZAお気に入りを同期し、サーバーはFANZA認証情報を保存しない。
- 同一商品IDは投稿後30日間、再投稿しない。親投稿は【PR】と動画を含め、返信にアフィリエイトURLを投稿する。

## 未実装事項

- PostgreSQLの業務データ層とマイグレーション、商品取得・正規化、アフィリエイトURL・動画検証
- 指定女優管理、Chrome拡張、お気に入り同期API
- 3区分選定、30日制限、文面重複検出、動画付き親投稿と返信投稿
- 分析エンジン、新しい管理画面、Railway PostgreSQL連携

## 既存機能

- Node.js / TypeScriptのビルド、型検査、テスト基盤
- X API OAuth 1.0aクライアント、Basic認証付き管理画面の土台
- `DRY_RUN`、定期実行、投稿間隔、日次上限、Railway設定
- Yahoo!メールIMAP監視、メール抽出、JSON状態保存（確定仕様では不採用。今回未変更）

## 次のStep

Step 2候補: 商品・投稿履歴データモデルを実装する。商品ID、価格、動画、アフィリエイトURL、投稿親子関係、日次枠をPostgreSQLへ保存するための最初の業務マイグレーションとテストを追加する。
