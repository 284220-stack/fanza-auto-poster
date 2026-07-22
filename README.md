# FANZA X Auto Poster

FANZA商品をPostgreSQLへ同期し、登録女優・セール・お気に入りセールの候補を選定して、X向けの親投稿と自己返信を生成するNode.js / TypeScriptアプリです。現在のproductionは安全確認モードで、`DRY_RUN=true`、投稿Scheduler未有効、実X投稿なしです。

## 現在利用できる機能

- 登録女優を起点にした公式ItemList APIの商品取得、厳密な女優名・alias照合、商品・関連保存
- 商品・女優・投稿予定・投稿履歴・設定を確認するBasic認証付きDashboard
- FANZA/DMM公式商品URLを最大20件受け取るお気に入り同期API（既定check-only）
- 指定セール一覧で利用者がボタンを押した時だけ動く手動セール同期（既定check-only、完全な20件以内の集合だけpersist可能）
- 未登録お気に入り商品の公式metadata補完、価格不明の許容、VR作品の全経路除外
- セール2件、女優2件、お気に入りセール1件、合計最大5件の決定的な候補選定
- 30日再投稿禁止、pending reply優先、重複候補防止
- URLなし・【PR】付き親投稿と、アフィリエイトURLを1回だけ含む自己返信
- サンプル動画を優先し、利用不能時に公式商品画像へfallbackするmedia検証
- `DRY_RUN=true`でX API・media upload・投稿履歴更新を行わないpreview

## 未完了・承認待ち

- サーバー側のセール一覧自動取得は行いません。Chrome拡張の実ページ操作、セールcheck-only/persist、取得経路migrationのproduction適用は承認待ちです。
- `favorite_sale`は正規なセール掲載集合が未確定のためproduction候補0件が正常です。
- 実X投稿、実media upload、`DRY_RUN=false`、Scheduler有効化は明示承認が必要です。

## ローカル確認

```powershell
npm install
npm run check
npm test
npm run build
npm run dashboard
```

Dashboardは既定で`http://127.0.0.1:3000`にlistenします。DBや認証情報は環境変数で設定し、コード・ログ・コミットへ含めないでください。

安全な投稿previewは次で一回だけ実行できます。

```powershell
npm run posts:run
```

`--execute`を付けても`DRY_RUN=true`ならX APIは呼びません。ただし運用では承認なしにexecuteモードを使わず、既定previewを使用してください。

## 文書

- [セットアップ](docs/Setup.md)
- [運用手順](docs/Operations.md)
- [障害対応](docs/IncidentResponse.md)
- [要件](docs/Requirements.md)
- [アーキテクチャ](docs/Architecture.md)
- [進捗・production実測](ProjectStatus.md)

## 安全原則

- `DRY_RUN=true`を既定とし、実投稿とScheduler有効化は別々に承認する。
- VR作品、販売不能商品、URL・media不正、30日以内の既投稿、pending reply対象を安全に除外する。
- 価格不明は商品保存の失敗理由にしない。セール掲載は価格差だけで推測しない。
- セール候補は手動同期で現在掲載中と確認された`product_sources`だけを根拠にし、旧価格差同期を使用しない。
- 未登録女優の自動登録、alias自動追加、あいまい一致を行わない。
- APIキー、Affiliate ID、Cookie、パスワード、商品URL全文をログへ過剰出力しない。
- production変更前はcheck-onlyと対象件数を確認し、同じpersistを複数回実行しない。
