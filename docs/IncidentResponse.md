# 障害対応

## 共通初動

1. Schedulerを新規に有効化しない。既に承認済みで稼働中なら停止判断を運用者へ確認する。
2. `DRY_RUN=true`を維持する。障害切り分けのためにfalseへ変更しない。
3. Railway deployment、再起動回数、HTTP状態、直近ログのreason codeだけを確認する。
4. APIキー、Affiliate ID、Cookie、DB接続文字列、商品URL全文、投稿本文を共有ログへ出さない。
5. production DB変更前に対象件数と影響を読み取り確認する。

## Dashboard 502・プロセス再起動

- listen状態、deployment status、`ERR_HTTP_HEADERS_SENT`、未処理例外を確認する。
- Basic認証、API、静的ファイル、404、catchの各応答後に処理が継続していないか確認する。
- 応答済みのcatchでは再送信せず記録だけ行う。ただし根本の二重応答経路を先に直す。
- 修正後はURLを複数回開き、API・別ページ・404を確認し、再起動ループがないことを確認する。

## 商品同期失敗

- check-onlyの設定、DB、provider、metadata、保存候補、失敗件数を段階別に確認する。
- 価格不明は正常であり、同期エラーや商品除外にしない。
- VR、必須ID・タイトル欠損、公式URL不正、女優厳密不一致をreason codeで区別する。
- APIエラー時に条件を緩和せず、retryは手動で一回だけ行う。無限retryを行わない。

## 手動セール同期失敗

- `schemaReady=false`はmigration未適用であり、persistせずproduction migration承認・backup状態を確認する。
- 上限超過、不正、API未掲載、ID不一致、metadata不完全、VR、失敗の各件数を分離する。1件でもあれば部分persistしない。
- check-onlyとpersistの集合hash不一致はページ内容が変化した状態である。persistせず、同じページでcheck-onlyからやり直す。
- transaction失敗時はrollback確認後に商品数、active sale観測、`is_sale`互換表示を読み取り確認する。無限retryしない。
- 旧`/api/sync/sales`の409は正常な停止であり、価格差同期へ戻さない。

## preview失敗

- 候補選定0件と、選定後のテンプレート・media・orchestrator失敗を分ける。
- `invalid_input`は商品ID、親本文空、親本文URL混入を安全なerror codeで確認する。
- `media_unavailable`はsample videoとthumbnailのHTTP状態、Content-Type、サイズをURL非表示で確認する。
- 1件失敗しても他候補が継続することを確認し、件数合わせで不適格候補を追加しない。

## X投稿のpartial success

- 親投稿成功・返信失敗は`pending_reply`として扱う。親投稿を再作成しない。
- 保存済み親投稿IDへ返信だけを再試行する。
- 401/403は権限・認証、429はrate limit、5xxはX側障害として区別し、秘密値をログへ出さない。
- 投稿履歴やX投稿IDを手作業で削除・変更しない。

## X認証・本番1件ガード

- read-only診断の`x_credentials_incomplete`は値を表示せず4項目の設定有無だけ確認する。`x_authentication_failed`はtokenをログへ出さず、失効・対象アプリ・権限をX管理画面で確認する。
- `live_one_safety_confirmation_missing`または`confirmation_token_mismatch`では実行しない。新しいpreflight結果を運用者が確認するまでtokenを流用しない。
- `live_one_already_attempted`は成功・失敗を問わず連続投稿防止が作動した状態である。投稿履歴、X側、pending replyを確認し、guardを無断削除しない。

## Scheduler停止・多重起動

- `already_running`はPostgreSQL advisory lock取得不能であり、別実行が完了するまで再起動しない。無限retryしない。
- `scheduler_live_configuration_incomplete`では`DRY_RUN=false`のまま続行せず、Schedulerを無効にしてJST時刻と承認状態を確認する。
- 緊急停止はRailway Schedulerを無効化し、`DRY_RUN=true`へ戻してからpreview、pending reply、投稿履歴を読み取り確認する。DB lockを手動解除するためにDBプロセスを強制終了しない。

## DBメンテナンス

- 対象ID、想定件数、関連、pending、投稿履歴、X投稿IDを読み取り確認する。
- 0件または想定件数以外なら変更せず停止する。
- 必要な場合だけtransaction内で対象を限定し、削除・更新件数が一致しなければrollbackする。
- truncate、全件delete、曖昧なタイトル部分一致での変更を行わない。
