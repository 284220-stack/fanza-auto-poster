# Project Status

## 現在地

Sprint 0で開発ワークフローを見直し、`AGENTS.md` に完走を優先する自己見積もり、実装順序、中断、コミットのルールを追加した。Step 3A（指定女優データ基盤）は実装済みであり、次はStep 3B（指定女優管理API）である。既存のYahoo!メール監視、JSON状態保存、投稿処理は変更していない。

## Sprint 0の実施内容

- Step開始前に、実装から検証・自己レビュー・コミットまで完走可能かを見積もり、難しい場合は着手前に報告するルールを追加した。
- 大きなStepの実装順序、同一Step内でのレビュー指摘修正、途中コミット禁止、最後の手段としてのStep分割を明文化した。
- コミット可能な検証条件と、featureブランチからmain更新までの標準Git運用を明文化した。
- 同種の問題が2回発生した場合に、次の機能開発より先にルールを改善する仕組みを追加した。

## Step 3Aの実装内容

- `actresses` に別名、対象種別、投稿間隔、週間上限を追加し、初期女優として北岡果林・依本しおりを重複なく登録するマイグレーションを追加した。
- 女優の一覧・取得・登録・更新・有効化切替・削除・検索・同名確認を扱うRepositoryと、入力正規化・業務ルールを扱うServiceを追加した。
- APIと管理画面は未実装である。

## Step 2の実装内容

- node-pg-migrateの初期マイグレーションで、`products`、`actresses`、`product_actresses`、`favorites`、`post_history`、`settings` を追加した。
- 商品ID、女優名、商品とお気に入り、X投稿IDの一意性と、商品・女優の関連、投稿履歴の外部キーを定義した。
- 候補検索、女優検索、お気に入り同期、30日再投稿判定に備えた索引と、更新日時を自動更新するトリガーを追加した。
- Repository、CRUD、DBアクセス、商品取得、Chrome拡張、X投稿は未実装である。

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

- 商品RepositoryとCRUD、商品取得・正規化、アフィリエイトURL・動画検証
- 指定女優管理API・管理画面、Chrome拡張、お気に入り同期API
- 3区分選定、30日制限、文面重複検出、動画付き親投稿と返信投稿
- 分析エンジン、新しい管理画面、Railway PostgreSQL連携

## 既存機能

- Node.js / TypeScriptのビルド、型検査、テスト基盤
- X API OAuth 1.0aクライアント、Basic認証付き管理画面の土台
- `DRY_RUN`、定期実行、投稿間隔、日次上限、Railway設定
- Yahoo!メールIMAP監視、メール抽出、JSON状態保存（確定仕様では不採用。今回未変更）

## 次のStep

Step 3B候補: Step 3AのRepository／Serviceを既存dashboardの安全なHTTP APIから操作できるようにする。管理画面はStep 3Cで扱う。
