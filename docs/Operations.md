# 運用手順

## 現在の安全状態

productionは`DRY_RUN=true`、投稿Scheduler未有効、実X投稿なしで運用する。設定変更、実投稿、Scheduler作成はこの文書だけを根拠に実施せず、必ず個別承認を得る。

## 日次確認

1. Railway serviceが`SUCCESS`で再起動ループしていないことを確認する。
2. DashboardへBasic認証で入り、商品数、登録女優、投稿予定、投稿履歴、DRY_RUN表示を確認する。
3. `npm run posts:run`をpreviewとして一回実行する。
4. `selectedCount`、`failedCount`、`blockedCount`、カテゴリ不足warningを確認する。
5. `post_history`がdry-runで増えていないことを確認する。

候補不足を理由に女優条件、投稿枠、30日ルールを緩和しない。セール・favorite_saleが0件でも、正規なセール掲載集合がない現状では正常である。

## 女優商品同期

最初はcheck-onlyを実行する。

```powershell
npm run sync:actresses
```

登録女優数、検索数、取得数、厳密一致、不一致、重複除去後商品数、エラー数を確認する。女優名・alias不一致は管理画面で運用者が判断し、自動登録・自動alias追加・あいまい紐付けを行わない。

保存が必要な場合だけ、check-only成功後に一回実行する。

```powershell
npm run sync:actresses -- --persist
```

同じ対象へ誤って複数回persistしない。実行後は商品数、`product_actresses`件数、女優別関連数、previewを確認する。

## お気に入り同期API

`POST /api/favorites/sync`へ`urls`配列を送り、`persist`省略または`false`でcheck-onlyする。一度に最大20件で、公式FANZA/DMM商品URLだけを使用する。応答では次を確認する。

- `invalidCount=0`
- `metadataUnavailableCount=0`
- `metadataFailedCount=0`
- `vrExcludedCount=0`
- `failedProductCount=0`
- `saveCandidateCount`とお気に入り作成予定件数

実ページからのURL収集はChrome拡張承認後に行う。FANZAのID、パスワード、Cookie、閲覧セッションをAPIへ送らない。`persist=true`は運用者のお気に入り集合が確定し、check-only結果を確認した場合だけ一回実行する。

## 投稿preview

previewは親投稿本文、自己返信URL、media選択、VR除外、30日ルール、pending replyを実行経路と同じ順で確認する。productionの現データではsample videoがHTMLへredirectされるため、公式サムネイル画像へのfallbackが正常である。

成功条件は`failedCount=0`、`invalidInputCount=0`、候補ごとの`mediaType`が`video`または`image`であること。dry-runではX API、media upload、`post_history`更新が0でなければ異常として停止する。

## 実投稿前チェックリスト

以下は承認後も一項目ずつ確認する。

1. productionの最新commitとRailway deploymentが一致する。
2. Completion Gateがすべて成功している。
3. 対象候補が非VR、`status=available`、affiliate URLあり、media検証済みである。
4. 親投稿に【PR】がありURLがない。返信にaffiliate URLが1回だけある。
5. 30日制限、pending reply、重複、カテゴリ枠、日次上限を通過している。
6. X認証情報の設定有無だけを確認し、値を表示しない。
7. まず1件だけ実投稿し、親投稿、media、返信、履歴を確認する。
8. partial success時は新しい親投稿を作らず、pending replyを再試行する。

## Scheduler有効化前チェックリスト

- 実投稿1件の親投稿・media・返信・履歴が成功している。
- 実行時刻と頻度を運用者が決定している。
- Railwayは単一実行インスタンスで、前回終了後に次回を開始する。
- `npm run posts:run -- --execute`を一回実行するSchedulerだけを作る。
- 多重実行、429、X障害、DB障害時の停止・再開手順を確認している。

分散ロックは未実装なので、複数Schedulerや複数同時インスタンスを有効化しない。
