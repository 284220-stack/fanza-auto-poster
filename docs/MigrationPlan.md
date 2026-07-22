# 移行計画

今回の作業では分類のみを記録し、既存実装の削除・変更はしない。

## そのまま再利用

| 資産 | 方針 |
| --- | --- |
| Node.js / TypeScript | 実行、ビルド、型検査の基盤 |
| X API OAuth 1.0a | 認証情報読込みとクライアント生成の土台 |
| 管理画面HTTPサーバー・静的配信 | 新管理API・UIの土台 |
| `DRY_RUN` | 投稿前確認の安全装置 |
| 投稿間隔、日次上限の考え方 | 新しい3区分・合計上限へ活用 |
| Railway設定、テスト基盤、Basic認証 | 運用・検証・画面保護の土台 |

## 修正して再利用

| 資産 | 必要な修正 |
| --- | --- |
| `src/config.ts` | Yahoo!設定をDB、アフィリエイトID、投稿枠、同期API設定へ置換 |
| `src/dashboard.ts` と `public/` | Yahoo!画面を女優、履歴、実績、同期、失敗理由の管理画面へ変更 |
| `src/worker.ts` | メール巡回を商品取得、選定、親投稿・返信の処理へ変更 |
| X投稿処理 | テキスト単体から動画付き親投稿、返信、永続化へ拡張 |
| 日次集計 | sale/newReleaseからsale/actress/favoriteSaleと最大5本へ変更 |
| `railway.json` | PostgreSQL接続と新起動構成に合わせて更新 |

## 削除

| 資産 | 理由 |
| --- | --- |
| `imapflow`、Yahoo! IMAP接続 | Yahoo!メール監視は不採用 |
| `mailparser` と型宣言 | メール本文解析は不採用 |
| `src/extract.ts` のメール抽出 | メール本文からの商品抽出は不採用 |
| メールID重複防止 | 商品IDの30日制限へ移行 |
| Yahoo!設定・疎通確認画面 | FANZA認証情報をサーバーで扱わない |
| `src/state.ts` のJSON正本 | PostgreSQLを正本とする |

削除はPostgreSQL移行と代替機能のテスト完了後に行う。

## 新規実装

- PostgreSQLスキーマ、マイグレーション、リポジトリ、トランザクション
- 商品取得・正規化、指定女優管理、Chrome拡張、お気に入り同期API
- 3区分選定、全必須条件、30日制限、文面重複判定
- 動画付き親投稿、返信投稿、冪等性、失敗記録
- 投稿・除外・失敗・同期を集計する分析エンジン

## product_sources migration

- `1763000000000_product_sources.ts`は非破壊で取得経路観測テーブルを追加する。products、favorites、product_actresses、post_historyは削除・変更しない。
- uniqueキーは`product_id + source_type + source_reference`で、actress・favorite・saleを上書きせず保持する。favorites 20件とproduct_actresses 8件は既存時刻を使ってbackfillする予定で、旧価格フラグは正規掲載根拠でないためsaleへbackfillしない。
- up/down、unique制約、参照整合、index、更新triggerを定義済み。production dry-runではこのmigration 1件だけがpendingで、適用前件数はproducts 58、favorites 20、product_actresses 8、post_history 0である。
- production適用前にDBバックアップまたは復元可能なsnapshotを確認し、適用後にproducts/favorites/product_actresses件数不変、product_sources期待件数、重複0、孤児0を読み取り確認する。実適用は明示承認後に一回だけ行う。
