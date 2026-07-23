# FANZA お気に入り・セール手動同期 Chrome拡張

このManifest V3拡張は、利用者がFANZAのお気に入りページまたは`https://video.dmm.co.jp/av/list/`でボタンを押した時だけ、公式videoa商品URLを最大20件抽出して用途別同期APIへ送ります。background処理、定期実行、Cookie・storage権限はありません。

## ローカル読込み

1. Chromeの`chrome://extensions/`を開く。
2. デベロッパーモードを有効にする。
3. 「パッケージ化されていない拡張機能を読み込む」で、この`chrome-extension`ディレクトリを選ぶ。
4. 同じブラウザーでDashboardを開き、Basic認証を完了する。
5. 拡張popupへDashboardのoriginだけを入力する。
6. セール同期では「FANZAセール一覧を開く」を押し、年齢確認があれば利用者が手動で完了する。お気に入り同期ではFANZAのお気に入りページを利用者が開く。
7. ページ読込み後、用途別の「抽出してcheck-only」を一回押し、件数とpersist可否理由を確認する。
8. 全条件が成功した場合だけ、有効になった用途別persistボタンを明示的に一回押す。

Dashboard originは保存されません。Basic認証値を拡張へ入力・保存せず、事前認証済みの同一originへだけ要求します。401の場合は処理を停止します。

## 安全境界

- FANZA/DMM公式hostの、pathnameに`favorite`または`bookmark`の明確なsegmentを持つページだけで抽出する。
- セール一覧は拡張内の`https://video.dmm.co.jp/av/list/`へ固定する。「開く」は新しいtabを作るだけで、抽出、API送信、persistを行わない。セール抽出は同hostの`/av/list`、`/av/list/`とquery付き形式だけで許可し、別host・類似pathでは実行しない。
- 年齢確認、ログイン、エラー、読込途中または商品link未表示では抽出せず、日本語の次操作を表示する。年齢確認を自動通過しない。
- ページHTML、FANZAのCookie、認証情報、localStorage、商品名を送信しない。
- 送信bodyは最大20件の正規化済み公式商品URLと制御値だけである。セール同期では完全集合フラグ、check-only集合のSHA-256、一回限りtokenも送る。表示中ページURL、title、DOMは送らない。
- 同期対象は現行`video.dmm.co.jp/av/content`と旧`digital/videoa`商品詳細だけである。他の商品種別は推測変換せず、popupへ「未対応商品種別」の件数だけを表示する。
- metadata取得不能はAPI未掲載、ID不一致、metadata不完全へ分類して件数だけを表示する。いずれかが1件でもあれば部分persistしない。
- タイトル先頭の明確なVR表記をローカル除外し、サーバー側metadataでも共通VR判定する。
- check-only成功状態はpopupを閉じると失われる。セールpersist直前に同じtabを再抽出し、ページURLと抽出集合・理由別件数が一致する場合だけ、一回限りtokenを使ってpersistできる。変更、再送、失敗後は再check-onlyが必要である。
- セール同期は上限超過・ID不正・metadata不能・ID不一致・metadata不完全・VR・API失敗・migration未適用のいずれかがあればpersistを無効化する。部分persistしない。
- セール掲載集合がない場合のfavorite_sale候補0件は正常であり、価格差でセール判定しない。
