# FANZA お気に入り同期 Chrome拡張

このManifest V3拡張は、利用者がFANZAのお気に入りページでボタンを押した時だけ、公式商品URLを最大20件抽出して既存の同期APIへ送ります。background処理、定期実行、Cookie・storage権限はありません。

## ローカル読込み

1. Chromeの`chrome://extensions/`を開く。
2. デベロッパーモードを有効にする。
3. 「パッケージ化されていない拡張機能を読み込む」で、この`chrome-extension`ディレクトリを選ぶ。
4. 同じブラウザーでDashboardを開き、Basic認証を完了する。
5. FANZAのお気に入りページを開き、拡張popupへDashboardのoriginだけを入力する。
6. 「抽出してcheck-only」を押し、件数と安全性結果を確認する。
7. 全条件が成功した場合だけ、有効になったpersistボタンを明示的に一回押す。

Dashboard originは保存されません。Basic認証値を拡張へ入力・保存せず、事前認証済みの同一originへだけ要求します。401の場合は処理を停止します。

## 安全境界

- FANZA/DMM公式hostの、pathnameに`favorite`または`bookmark`の明確なsegmentを持つページだけで抽出する。
- ページHTML、FANZAのCookie、認証情報、localStorage、商品名を送信しない。
- 送信bodyは最大20件の正規化済み公式商品URLと`persist`だけである。
- 同期対象は現行`video.dmm.co.jp/av/content`と旧`digital/videoa`商品詳細だけである。他の商品種別は推測変換せず、popupへ「未対応商品種別」の件数だけを表示する。
- metadata取得不能はAPI未掲載、ID不一致、metadata不完全へ分類して件数だけを表示する。いずれかが1件でもあれば部分persistしない。
- タイトル先頭の明確なVR表記をローカル除外し、サーバー側metadataでも共通VR判定する。
- check-only成功状態はpopupを閉じると失われる。persistは同じpopup内の確認後だけ可能である。
- セール掲載集合がない場合のfavorite_sale候補0件は正常であり、価格差でセール判定しない。
