# Project Status

## 現在地

Sprint 0で開発ワークフローを見直し、`AGENTS.md` に完走を優先する自己見積もり、実装順序、中断、コミットのルールを追加した。Step 3A〜3CとStep 4A〜4Eは実装済みである。

## Step 4Eの実装内容

- `SaleSyncRunner` はProvider、ProductWriter、任意LoggerをDIし、`persistSaleProducts`を実行して安全なSyncResultへ集計する。Cron登録は未実装である。

## Step 4Dの実装内容

- 実装ファイルは `src/sale-product-persistence.ts`。公開契約は `persistSaleProducts(provider, writer)`、`ProductWriter`、`PersistenceResult` である。
- `ProductWriter` は `getByFanzaProductId`、`create`、完全な`ProductInput`を受け取る`update`をDIする。SQLやRepositoryをオーケストレーション層から直接利用しない。
- 既存商品は商品IDで取得し、Provider未取得または空文字の任意項目を維持した完全入力へ合成して更新する。新規はcreate、重複・必須情報不足はスキップし、個別失敗は安全なerrorsへ集計する。
- 結果モデルは取得・作成・更新・スキップ・失敗件数、warnings、安全なerrors、開始・完了時刻を返す。女優関連付けと定期実行は未実装である。

## Sprint 0の実施内容

- Step開始前に、実装から検証・自己レビュー・コミットまで完走可能かを見積もり、難しい場合は着手前に報告するルールを追加した。
- 大きなStepの実装順序、同一Step内でのレビュー指摘修正、途中コミット禁止、最後の手段としてのStep分割を明文化した。
- コミット可能な検証条件と、featureブランチからmain更新までの標準Git運用を明文化した。
- 同種の問題が2回発生した場合に、次の機能開発より先にルールを改善する仕組みを追加した。

## Step 3Aの実装内容

- `actresses` に別名、対象種別、投稿間隔、週間上限を追加し、初期女優として北岡果林・依本しおりを重複なく登録するマイグレーションを追加した。
- 女優の一覧・取得・登録・更新・有効化切替・削除・検索・同名確認を扱うRepositoryと、入力正規化・業務ルールを扱うServiceを追加した。
- APIはStep 3Bで実装済みであり、管理画面はStep 3Cで実装する。

## Step 3Bの実装内容

- 指定女優の一覧・取得・登録・部分更新・有効化切替・削除を行うdashboard APIを追加した。一覧は名前／aliases検索と有効状態の絞込みに対応する。
- 入力不正、未検出、同名重複、関連商品がある削除競合を、それぞれ400、404、409へ安全に変換する。DB未設定・DB障害・予期しないエラーは内部情報を含めない500応答に統一した。
- HTTP層はRepository／Serviceを経由し、SQLを持たない。実DBなしのHTTPテストを追加した。
- 管理画面は未実装であり、Step 3Cで扱う。

## Step 3Cの実装内容

- 既存dashboardに、指定女優の一覧、検索、有効状態絞込み、新規追加、編集、有効化／無効化、削除を行う日本語UIを追加した。
- 女優名、aliases、優先度、新作・セール対象、最低投稿間隔、週間投稿上限を操作できる。aliasesはカンマまたは改行区切りで入力できる。
- 削除確認と無効化の推奨、通信中の操作無効化、成功・エラー・空一覧の表示を追加した。DOM APIと`textContent`を使用し、API値をHTMLとして挿入しない。
- 指定女優管理機能はDB・Repository／Service・API・UIまで完成した。

## Step 4Aの実装内容

- productsテーブル用のProduct Repositoryを追加し、一覧・ID／FANZA商品ID／URL取得、存在確認、登録、更新、セール・サンプル動画更新、削除を実装した。
- Product Serviceでタイトル、FANZA商品ID、URL、価格、セール価格、商品状態を正規化・検証し、重複・未検出を安全な業務エラーとして扱う。
- 商品取得、FANZAアクセス、Chrome拡張、お気に入り同期API、X投稿は未実装である。

## Step 4Bの実装内容

- sale・new_release・favorite等を扱えるProvider共通モデル、取得条件、取得結果、Provider Registryを追加した。
- 正規化は空値・重複女優名・URL・価格・日付を検証し、不正な候補を警告付きで除外する。rawDataは秘密情報らしいキーを除外する。
- 実際のFANZAアクセス、HTML解析、Chrome拡張、商品保存は未実装である。

## Step 4Cの実装内容

- DMM Webサービス ItemListを注入可能なHTTPクライアントで利用するFANZAセールProviderを追加した。
- キャンペーン期間内かつ通常価格が現在価格を上回る候補だけを返し、動画・女優名・ページングを共通形式へ変換する。商品保存は未実装である。

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

- FANZAセール同期Runner、アフィリエイトURL・動画の実データ検証
- Chrome拡張、お気に入り同期API
- 3区分選定、30日制限、文面重複検出、動画付き親投稿と返信投稿
- 分析エンジン、新しい管理画面、Railway PostgreSQL連携

## 既存機能

- Node.js / TypeScriptのビルド、型検査、テスト基盤
- X API OAuth 1.0aクライアント、Basic認証付き管理画面の土台
- `DRY_RUN`、定期実行、投稿間隔、日次上限、Railway設定
- Yahoo!メールIMAP監視、メール抽出、JSON状態保存（確定仕様では不採用。今回未変更）

## 次のStep

Step 4E候補: `FanzaSaleProvider` と `persistSaleProducts` をDIして実行・集計するSaleSyncRunnerを実装する。Cron登録は後続とする。
