# Project Status

## Step 11A: お気に入り同期API基盤（完了、2026-07-23）

- FANZA/DMM公式商品URLから明確な`cid`、`content_id`またはvideo.dmm.co.jpの`id`だけを抽出し、既存`products.fanza_product_id`と照合する`FavoriteSyncService`と、Basic認証下の`POST /api/favorites/sync`を追加した。任意ドメイン、HTTP URL、曖昧なパス、形式不正IDは受け付けない。
- APIはcheck-onlyが既定で、URLや商品名を返さず、受信・妥当・不正・重複除去・一致・未一致・作成予定・更新予定・削除予定の件数だけを返す。`persist=true`でも空集合、不正URL、未登録商品があればDBを変更しない。商品自動作成、FANZA認証情報・Cookieの保存、migrationは行っていない。
- `favorites`は既存スキーマを利用し、明示persist時の完全一致集合だけを単一SQLでスナップショット置換する。check-only、空集合拒否、部分不正拒否、未知商品拒否、重複URL、公式URL形式、APIエラー秘匿、Dashboardルーティングをテストした。
- ローカルCompletion Gate: `npm run check`、`npm test`、`npm run build`、`git diff --check`はすべて成功。
- Railway production deployment `d1bb65c8-4b3a-49f9-82ff-ad10cfb43b9a`はSUCCESS。既存の非VR商品1件をURL非表示でcheck-onlyし、HTTP 200、received=1、valid=1、invalid=0、matched=1、unmatched=0、created予定=1、removed予定=0を確認した。favoritesは実行前後0件でDB変更なし。無効ドメイン1件もHTTP 200、invalid=1、checkOnly=trueで安全に件数化した。DashboardはHTTP 200、productionログに起動例外なし。
- 安全状態: `DRY_RUN=true`、投稿Scheduler未有効、実X投稿なし。お気に入りpersist、商品同期persist、production DB変更は未実施。
- 残課題: 未登録content_idを公式APIで補完する`FavoriteProductProvider`、Chrome拡張、sale掲載集合との照合、favorite_sale preview。次の推奨Stepは、URL入力を起点に公式ItemListでmetadataを補完し、VRを多重除外する`FavoriteProductProvider`のcheck-only実装である。

## production VR誤保存データの限定削除（2026-07-23）

- 削除前にIDs 37, 40, 41, 42, 43が正確に5件、全件でアプリ本体の共通VR判定true、明確なタイトル先頭VR表記、`product_actresses`関連7件、pending投稿0件、投稿履歴0件、X投稿IDなしであることを確認した。非VR商品は対象に含まれなかった。
- Railway production DBでトランザクションを開始し、対象IDに限定して`product_actresses`を7件削除後、`products`を5件削除した。削除件数と残存（products=0、relations=0）を確認してcommitした。truncate・全件削除・同期persist・投稿履歴等の変更は行っていない。
- 削除後: products=39、VR商品=0、available非VR商品=39、`product_actresses`総数=8、pending投稿=0、投稿履歴=0。dry-run previewは非VR2件でselectedCount=2、dryRunCount=2、failedCount=0、blockedCount=0、invalidInputCount=0（failedCount=0）。
- 誤判定原因は、以前の一時読み取りスクリプトの全角ブラケット正規表現がPowerShell経由で文字化けしたこと。DRY_RUN=true、Scheduler未有効、実X投稿なしを維持。

## VR商品保存状況の読み取り調査（原因特定）

- Railway productionの稼働中`fanza-auto-poster`コンテナ内から、Dashboardと同じ`getDatabasePool()`で`railway.public.products`を確認した。Dashboardの`GET /api/products`も同じRepositoryの`products`一覧を参照するため、環境・DBの取り違えは確認されなかった。
- VR商品は5件（IDs 37, 40, 41, 42, 43）存在し、全件`status=available`、作成・更新時刻は2026-07-22 14:54 UTC、`product_actresses`関連は合計7件。pending投稿・投稿履歴はともに0件。
- 5件はすべてタイトル先頭`【VR】`であり、確認対象「【VR】規格外にでっかい！波打つむっちり肉感神尻BEST300分」もID 43として存在する。
- 以前の0件報告は、PowerShell経由で送った一時読み取りスクリプト内の全角ブラケットを含む正規表現が文字化けし、判定条件が壊れた調査不備によるもの。アプリ本体の`isVrTitle`による再確認では5件すべてtrueで、候補選定では5件すべて除外され、現在のselectedは非VRの2件のみ。
- 保存時刻はVR除外実装のproduction反映前の女優同期persistと一致する。現行の女優同期・metadata補完・セール同期は共通判定を通過してから`persistSaleProducts`へ至る。コード上、これ以外にProductRepositoryへ保存する同期経路は見つからなかった。今回の調査ではDB変更・同期・削除を行っていない。

## Dashboard初期dry-run履歴の確認（2026-07-20）

- Railway production DBを読み取り専用で確認した。JST 2026/07/20の`post_history`は0件であり、対象3件は存在しなかった。
- `x_post_id`、pending reply、投稿履歴の変更は行っていない。安全条件「対象が正確に3件」を満たさないため、削除は実行しなかった。
- Dashboardの「最近の投稿履歴」UIおよび投稿履歴機能は変更していない。DRY_RUN=true、Scheduler未有効、実X投稿なしを維持。

## Step 10 継続: VR作品の全経路除外（実装中）

- 要件: VR作品は女優・新作・sale・favorite_saleを含む全カテゴリで、取得、保存、候補生成、preview、投稿の対象外とする。確認された対象は「【VR】規格外にでっかい！波打つむっちり肉感神尻BEST300分」。
- 対応: 共通`src/vr-product.ts`を追加し、構造化メタデータを優先して判定し、判定不能時のみ正規化済みの明確なタイトル先頭マーカーを補助判定に使う。単なる文字列中の`VR`は除外しない。
- 防御箇所: `ActressProductProvider`、`ProductMetadataProvider`、セールProvider、persist直前、候補選定、preview、実行経路。既存DBはまずcheck-onlyで明確なタイトルマーカーに一致する件数・関連数を確認し、物理削除せず安全な投稿対象外化を検討する。
- 安全性: DRY_RUN=true、Scheduler未有効、実X投稿なしを維持。既存の商品同期persistは再実行しない。
- ローカル確認: `npm run check`、`npm test`、`npm run build`、`git diff --check`、VR判定テストは成功。Railway DBの明確なVR表記件数の読み取り確認、非VR候補のpreview、デプロイ確認は未完了のため、commit/push/PR/mergeは未実施。
- Railway production確認: products=44、正規化済みの明確なタイトル先頭VRマーカー該当=0、該当商品の`product_actresses`関連=0、pending投稿=0、投稿履歴=0。確認対象タイトルは未保存。よってDB変更・物理削除・関連削除は不要。
- Railway preview（デプロイID `82a729b9-06aa-43d6-bbc0-488cae96edb7`）: VR候補=0、非VR女優候補のみ2件、selectedCount=2、dryRunCount=2、blockedCount=0、failedCount=0、invalidInputCount=0（failedCount=0により確認）。実X投稿は0件。

## Step 10: 登録女優起点の商品取得・候補生成（完了）

- `ActressProductProvider`と`ProductMetadataProvider`、`sync:actresses` CLIを追加した。前者は有効かつ新作対象女優の正式名・aliasesごとにFANZA ItemListを`sort=date`、`hits=5`、`offset=1`で検索し、content_id重複を除外する。metadata補完後のレスポンス女優名が検索語と厳密一致した商品だけを返す。
- CLIは既定check-only、`--persist`でのみ既存のupsert/`product_actresses`保存を行う。`--actress <id>`で一名に限定できる。価格不明は保存拒否条件ではない。セール/Favorite/年齢認証Cookie/Scheduler/実投稿/migration/UIは対象外。
- 候補クエリは登録女優の`target_new_releases`を取得するよう拡張した。新Provider専用テスト、本番check-only・persist・preview、文書最終化、GitHub標準フローは未完了であり、commit/push/PR/mergeはしていない。
- 再開地点: Providerの正式名/alias/部分一致拒否/重複/metadata失敗/check-only非更新/persist関連保存のテストを追加し、候補選定を`target_new_releases`必須として検証後、Completion GateとRailway production確認を行う。
- Railway production check-onlyは終了コード0、登録女優3名・検索3名・取得15件・厳密一致15件・不一致0件・重複除外後13商品・エラー0だった。persistは一回だけ実行し、13商品作成・更新0・失敗0、`product_actresses`は15件、女優別関連商品数は各5件となった。
- previewはactress候補2件を生成したが、既存`PostExecutionOrchestrator`が親投稿本文の`invalid_input`を返し、`selectedCount=2`、`blockedCount=0`、`failedCount=2`となった。候補選定・30日ルール・pending・DRY_RUNは変更していない。このpreview障害はStep 10の取得経路とは別の既存投稿生成/実行経路の不具合として次Stepで修正が必要であるため、Step 10のGitHub完走は保留する。
- invalid_inputの根本原因は、候補SQLのPostgreSQL bigint商品IDが文字列のまま`PostExecutionOrchestrator`へ渡され、`Number.isInteger`に失敗したことだった。親本文は空でなく、URLを含まず、51文字で正常だった。`p.id::int`でMapperを数値化し、安全な失敗理由（`invalid_product_id`、`empty_parent_post`、`parent_post_contains_url`）を返すようにした。
- 修正後のRailway previewは`selectedCount=2`、`blockedCount=0`、`failedCount=0`、`invalidInputCount=0`、dry-run成功2件だった。商品同期・persistは再実行していない。DRY_RUN=true、Scheduler未有効、実X投稿なし、migrationなし。セール取得は年齢認証・robots制約のため保留する。

## Step 9: 商品取得アーキテクチャ再設計（調査・設計完了、実装保留）

- 旧`FanzaSaleProvider`はDMM Webサービスの汎用`ItemList`を固定の動画フロアから取得し、価格差で`isSale`を決めている。登録女優を取得起点にしていないため、登録女優の商品がたまたま汎用一覧に入らなければ`product_actresses`も女優候補も作れない。
- Railway productionで、有効かつ新作対象の登録女優3名をそれぞれ正式名（aliasesは0件）で`ItemList`へ低頻度にcheck-only検索した。`site=FANZA`、`service=digital`、`floor=videoa`、`keyword`、`sort=date`、`hits=5`、`offset=1`で各5件取得し、各5件ともレスポンスの女優名を正式名・alias集合で厳密再検証できた。`ActressSearch`は今回各0件で女優IDを返さず、女優ID利用を実装前提にしない。
- 女優商品は`ActressProductProvider`（有効・新作対象女優の正式名とaliasesを検索語として使用、ページング、`sort=date`）が商品ID候補を取得し、`ProductMetadataProvider`が`cid`指定の公式API補完を行い、レスポンスの女優名を再検証した場合だけ保存・`product_actresses`関連付けする構成へ分離する。候補商品の重複はcontent_id単位で除外する。
- 指定セール一覧`https://video.dmm.co.jp/av/list/`は、Cookieなしの低頻度check-onlyで年齢認証URLへ302された。年齢認証の回避、Cookie設定、商品カード・content_id抽出は実施していないため、実URL、表示条件、HTML/JS構造、ページング、セール掲載フィールドは未確定である。robots.txtには`*/list/?*|*|*`のDisallowがあり、利用規約と正規認証済みセッションでの閲覧可否を運用者が確認するまで自動HTML取得を実装しない。
- セールは価格差で推測せず、将来の`SalePageProvider`が正規に閲覧できるセール一覧の掲載を根拠として商品IDだけを返す。`ProductMetadataProvider`が公式APIで商品情報を補完する。掲載が見えない回は削除せず、`sale_last_seen_at`を更新しないことで候補から外す設計が必要である。
- 将来の`FavoriteProductProvider`はChrome拡張のURL同期→content_id抽出→`SalePageProvider`集合との照合だけを責務とし、今回は実装変更しない。
- 取得経路は商品と多対多（同一商品がactress/sale/favoriteの複数起点）になり得るため、単一の`products.source_type`より取得観測用の別テーブル（source type/reference、first seen、last seen）を次実装Stepで検討する。既存スキーマにはセール掲載の現在性・履歴を表す列がないため、`SalePageProvider`を実装するなら最小migrationが必要となる見込み。今回migrationは追加しない。
- 次の実装Step: 正規認証・利用規約・アクセス頻度の運用判断を先に確定し、女優起点Providerと公式メタデータProviderを小さく実装・テストする。セールページProviderは、正規に取得できるHTML構造と掲載根拠を確認できるまで保留する。`DRY_RUN=true`、Scheduler未有効、実X投稿なし、persistなしを維持した。

## Step 8F: 登録女優による投稿候補生成確認（進行中）

- 実DBの登録女優は3名、全員有効、aliasesは0件だった。今回のProvider 20商品から抽出した女優名は重複除去後16件で、登録済み正式名・aliasとの厳密一致は0件、未一致は16件だった。
- Railway production内で`DRY_RUN=true`のcheck-onlyを実行し、終了コード0、`configuration/database/provider=ok`、`errorsCount=0`を確認した。続けてpersistを一回だけ実行し、終了コード0、`syncStatus=success`、`fetchedCount=20`、`createdCount=11`、`updatedCount=9`、`failedCount=0`だった。価格不明は21件の観測情報であり、同期エラーではない。
- persist後の`product_actresses`は0件、関連商品0件、女優別関連商品数は3名とも0件だった。`matchedActressCount=0`、`linkedProductCount=0`、`createdRelationCount=0`である。未登録女優の自動作成、aliasの自動追加、あいまい一致は実施していない。
- 投稿候補previewは`actressCandidateCount=0`、`selectedCount=0`、`blockedCount=0`、`failedCount=0`だった。セール・favoriteも0件で、warningsは`category_shortage:sale`、`category_shortage:actress`、`category_shortage:favorite_sale`のみだった。商品31件はすべてavailableかつaffiliate URLあり、既存投稿・pending replyは0件のため、女優カテゴリ不足の直接原因は女優名・alias不一致である。
- 投稿予定画面はproductionでHTTP 200を確認し、候補0件を安全なdry-run previewとして表示する実装になっている。Scheduler未有効、実X投稿なし。
- 再開条件: 運用者が今回抽出された未一致女優名と一致する正式名を女優管理画面で手動登録するか、既存女優へ対応するaliasを手動追加する。その後、同じfeatureブランチでcheck-only・persist同期・`product_actresses`・女優別関連件数・previewを再確認する。

## Step 8E: 未一致女優の確認と手動登録支援（完了）

- 実商品20件から抽出した女優名は、重複除去後71件、商品との延べ対応73件だった。既存の正式名・aliasとの厳密一致は0件で、未一致71件、同一女優が複数商品に出現した名前は1件（最大3商品）だった。
- 未一致女優は自動登録・あいまい一致・自動関連を行っていない。手動登録対象は未一致71件であり、既存女優に同一人物の表記があると運用者が判断した場合だけalias追加対象とする。
- 女優管理画面は新規登録時のaliases入力に加え、既存女優へ`alias追加`する最小操作を追加した。PATCH APIのaliases更新を利用し、登録・alias追加は運用者が明示操作した場合だけ行う。
- 今回は登録・alias追加を実施していないため、再同期・product_actresses作成・actress候補・selectedCountは変化なし（すべて0件）である。`DRY_RUN=true`、Scheduler未有効、実X投稿なしを維持した。

## Step 8D: FANZA商品と女優の関連保存修正（進行中）

- Providerの女優情報は`iteminfo.actress`、`actress`、`actresses`の配列から安全に名前だけを抽出し、`actressNames: string[]`へ正規化した。商品タイトル、URL、価格、認証値、レスポンス全体は出力しない。
- 商品保存後、既存の`actresses.name`または`aliases`に一致した女優だけを、単一SQLで`product_actresses`へ置換保存する。未登録女優は自動作成せず、価格・セール・投稿・30日ルール・DB migrationは変更していない。
- 2026-07-22の実環境persistは20商品更新・失敗0で成功した。ただし登録済み有効女優2名に一致する抽出名は0件で、`product_actresses`は0件、関連商品0件のままである。これは未一致を自動作成しない仕様どおりであり、女優候補previewは0件のままである。
- 再開地点: 運用者が対象のFANZA女優名またはaliasを既存女優へ登録した後、同じ安全なpersistを一回実行して関連保存・女優候補を再確認する。

## Step 8C: 実商品データによる運用確認（進行中）

- 安全条件: `DRY_RUN=true`、Scheduler未有効、実X投稿なしを維持した。価格・セール・投稿・30日ルール・DB migration・UI大規模変更は行っていない。
- Dashboard APIの実データ確認: 商品20件、全件`status=available`、発売日あり20件、サンプル動画あり20件、`price`/`salePrice`がNULLのもの20件、セール商品0件、投稿履歴0件である。最長タイトルは138文字で、商品一覧はテーブル横スクロールの既存実装を使用する。
- 投稿履歴の空状態と不正フィルター（`dateFrom=invalid`、`pendingReply=invalid`）のHTTP 400エラー経路を確認した。Dashboardは商品20件、セール0件、投稿予定0件、投稿履歴0件、DRY_RUN有効を返した。
- 投稿候補previewは`selectedCount: 0`で、`category_shortage:sale`、`category_shortage:actress`、`category_shortage:favorite_sale`を返した。セール候補0件は現仕様どおりの正常結果であり、条件緩和はしていない。

### 発見した運用上の問題

| 重要度 | 内容 | 再現手順 | 影響 |
| --- | --- | --- | --- |
| High | 20商品の女優名・女優関連がDBへ保存されていない。`product_actresses`に関連0件で、登録済み有効女優2名との照合・alias照合ができず、女優候補は0件になる。 | 保存済みDBで`products_with_actress=0`、`products_without_actress=20`を確認し、`POST /api/posts/preview`を実行する。 | 女優カテゴリの投稿候補を選定できず、女優管理の実運用確認を完了できない。 |
| Medium | `GET /api/products`は常に20件を返し、`page=2&limit=5`等のページング・フィルターを受け付けない。商品API/UIは女優名とNULL価格の列も提供しない。 | `GET /api/products?page=2&limit=5&sale=false`を呼ぶと20件が返る。商品管理画面を開く。 | 商品数増加時に一覧の運用性が低く、女優・価格不明を画面で確認できない。 |
| Medium | previewのカテゴリ不足はカテゴリ名だけで、除外条件別の件数を運用者へ示さない。 | `POST /api/posts/preview`で0件時の`warnings`を確認する。 | 0件の原因（セール0、女優関連0、お気に入り0等）を画面から即時判別できない。 |

- 再開地点: 女優名の保存・登録女優/aliasとの関連付け、商品API/UIのページング・運用列、previewの理由別件数を別機能Stepとして設計し、実データで再確認する。今回の確認Stepではルール変更や途中実装を行わない。

## Step 8B: 価格任意のFANZA同期（完了）

- Step 8A/8Bの価格調査方針を中止し、価格を任意項目へ変更した。固定価格だけを`number`として保存し、範囲表現・波ダッシュ・欠損・不明形式は`NULL`として商品を保存する。価格不明は`price_unavailable`の観測情報であり、保存除外・同期エラー・失敗終了コードの理由にしない。
- 通常価格と販売価格の両方が固定価格で、通常価格が高いときだけセール商品とする。価格不明の商品は`is_sale=false`でセール枠から除外する。既存確定価格は後続の価格不明同期でNULL上書きしない。`price`・`sale_price`は既存スキーマでNULL許容のためmigrationは不要だった。
- 一時的な価格構造ログ、波ダッシュ調査用の詳細診断、`invalid_price`による全件除外を削除した。同期CLIは`providerResponseCount`、`saveCandidateCount`、`priceAvailableCount`、`priceUnavailableCount`、`saleEligibleCount`、`saleIneligibleCount`、`errorCount`を安全な件数として出力する。
- 2026-07-21の実環境check-only: `providerResponseCount: 1`、`saveCandidateCount: 1`、`priceAvailableCount: 0`、`priceUnavailableCount: 1`、`saleEligibleCount: 0`、`errorCount: 0`、終了コード0。
- 同日の実環境persist: `syncStatus: success`、`fetchedCount: 20`、`createdCount: 20`、`failedCount: 0`、`priceUnavailableCount: 1`（check-only観測）、終了コード0。Dashboard APIは商品20件、価格NULL 20件、セール商品0件を返した。投稿候補previewは価格不明商品をセール枠に入れず候補0件で、カテゴリ不足警告のみだった。
- `DRY_RUN=true`を維持し、Schedulerは未有効、実X投稿・投稿ルール・30日制限・UI変更は実施していない。

## Phase 2: 投稿訴求基盤

### Step 7B-5: 目標画像への忠実な再修正（完了）

- `image(81).png`、目標画像、Universal Executive Infographic Design Systemを直接確認して差分分析を行った。更新ボタン、4列サマリー、中段2カラム、最近の投稿のタイトル領域、背景装飾、横幅制約を優先修正中である。
- `feature/dashboard-faithful-reference`で、`public/reference.css`によるPC 1440px以上の中段2カラム復帰、更新ボタン132×48px、4列サマリー、長文2行制約、Grid/Flexの縮小制約を追加した。固定SVGアイコン、実データに基づくシステム稼働状況と安全なクイック操作の下段2カラムも追加した。
- 目標画像との比較では、サイドバー幅・active・ヘッダー・更新ボタン・4列サマリー・中段/下段2カラム・余白・横幅制約はほぼ一致した。実データのないグラフ、投稿画像、SNSロゴは架空表示を避けるため未実装である。実ブラウザHTTP確認は環境制約により不可だったため、構文・既存UIテスト・CSSレスポンシブレビューで代替確認した。

### Step 7B-4: 参照デザイン忠実再現・レイアウト品質修正（完了）

- 目標画像と比較し、サマリーの4列比率、メイン領域の幅利用、1280px前後の中段1列化、最近の投稿の2行タイトル・status分離、Grid/Flexの`min-width: 0`、テーブルのみの横スクロール、背景装飾を修正する。
- サイドバーは280px、メインは残り幅を`min-width: 0`で利用する。1920〜1280pxでは4列サマリー、1320px以下では投稿スケジュールと最近の投稿を1列化し、1120px以下ではサマリーを2列、800px以下ではドロワー、460px以下では1列にする。長い投稿タイトルは最近の投稿で最大2行、日時・statusは別領域に保持する。
- 実ブラウザHTTP確認はこの環境では不可だった。Railway productionで1920/1536/1440/1366/1280/768/390pxを確認する際は、ページ全体の横スクロールがないこと、最近の投稿の2行省略、サマリーの数値・単位、モーダル、ドロワーを確認する。API・投稿ロジック・実投稿・Schedulerは未変更である。

### Step 7B-3: 管理画面デザイン全面適用（完了）

- 参考画像をデザイン基準として、7ページ構成と既存APIを維持しつつ、濃紺グラデーションの固定サイドバー、淡い青灰の背景、情報階層を持つカード、ツールバー、テーブル、フォーム、モーダルへ全面適用する。
- Dashboardは実APIから取得できる投稿予定・商品・セール・同期状態・履歴・女優・DRY_RUNの値だけを使い、架空の投稿、SNS、画像、グラフ、実投稿導線は追加しない。
- 商品、女優、投稿予定、投稿履歴、同期・実行、設定にも同一のカード・テーブル・フォーム・状態バッジ・モーダルテーマを適用した。PC固定サイドバー、タブレットのカード列調整、モバイルの開閉サイドバー・1列カード・表の横スクロールを維持した。
- Chromeでの静的描画は試行したが、`file://`では絶対パスのCSSを読めず、実行環境ポリシーによりローカルHTTPサーバーをバックグラウンド起動できなかったため、実ブラウザ確認は不可だった。JavaScript構文検査、既存UIテスト、全テスト、CSSレスポンシブ規則のレビューを代替確認とした。次Step候補はRailway production上での実ブラウザ確認に基づく小規模なデザイン微調整である。

### Step 7B-2: 管理画面の配色・UIトーン調整（完了）

- 7ページ構成、hashルーティング、API契約、投稿ロジックを維持したまま、管理画面の配色を落ち着いた青灰・ネイビーグレー基調に統一する。CSS変数で背景、文字、境界線、アクセント、状態色を一元化する。
- カード、テーブル、フォーム、ボタン、モーダル、ページネーション、空・エラー表示、成功・警告・エラーのバッジ、hover/focusを低彩度で可読性のある状態色へ揃えた。モバイルのサイドバー、オーバーレイ、テーブル横スクロールも既存構造のまま維持した。
- Chromeの存在は確認できたが、この実行環境ではバックグラウンドのローカルDashboard起動が実行ポリシーで拒否されたため、実ブラウザのスクリーンショット確認はできなかった。`node --check public/app.js`、CSS差分レビュー、既存の型検査・テストを代替確認とした。
- 実X投稿、`DRY_RUN=false`、Scheduler有効化、投稿選定・30日ルール変更、機能追加は行わない。次Step候補はRailway production上の実ブラウザ確認に基づく小規模なUI微調整である。

### Step 7B-1: Railway Node.js更新・production migration適用（完了）

- Railway productionのNixpacks runtimeにNode.js指定がなかったため、既定のNode.js 18が選択されていた。`node-pg-migrate`の依存関係がNode.js 20以上を要求するため、`package.json`の`engines.node`だけでNode.js 20 LTSを指定する。
- Railway productionはNode.js `v20.18.1`で再デプロイされた。`1762000000000_post_history_content.ts`は変更せず、productionコンテナで正式な`npm run db:migrate`を一回だけ実行した。
- 適用後の読み取り専用確認で、`post_text`（text・NULL許容）、`character_count`（integer・NULL許容）、非負を保証する`post_history_character_count_check`、migration履歴を確認した。既存`post_history`行数は適用前後とも0件で維持された。手動SQL、down migration、実投稿、Scheduler有効化は行っていない。

### Step 7A: 管理画面GUI全面刷新・投稿内容履歴（完了）

- 旧縦長画面を廃止し、固定サイドバーとhashルーティングでDashboard、商品管理、女優管理、投稿予定、投稿履歴、同期・実行、設定の7ページを選択表示するUIへ刷新した。
- 親投稿単位の投稿履歴一覧と返信詳細を追加した。migrationは`post_text`と`character_count`をNULL互換で追加し、実投稿時の親/返信本文・文字数を保存する。dryRunは既存方針どおり保存しない。
- Basic認証下の一覧・詳細APIはdateFrom/dateTo/status/actress/product/pendingReply/page/limit（上限100）を検証し、パラメータ化クエリで複合フィルターを処理する。
- 実ブラウザを直接操作する手段は利用できなかったため、静的UIルート検証、JavaScript構文検査、API/UI単体テストを代替確認とした。実X投稿、DRY_RUN=false、Scheduler有効化、動画、候補選定・30日ルール変更は未実施である。次Step候補は実ブラウザでの運用確認後のUI改善である。

### Step 6L: Railway Scheduler実設定・preview運用確認（完了）

- Railway production上で`npm run posts:run`を一回だけpreview実行した。`selectedCount`、`attemptedCount`、`dryRunCount`、`blockedCount`、`retryReplyCount`、`failedCount`はいずれも0で、候補0件は正常終了として扱った。
- CLIは終了コード0で正常終了し、プロセスは常駐しなかった。`DRY_RUN=true`のためX APIは未実行で、DB投稿履歴も更新されていない。出力は安全な件数・action/status要約であり、投稿本文、URL、認証情報、内部情報を含まない。
- Railway Schedulerは未有効化である。設定する場合は`npm run posts:run`を単一インスタンスで一回ずつ起動し、前回終了後に次回を開始する。時刻・頻度は未確定のままとする。
- Step 6L完了後はGUI刷新へ移行する。左固定サイドメニューと選択ページ表示へ改め、縦長の全機能一括表示を廃止し、ダッシュボード、女優管理、商品、投稿予定、履歴、設定を分離する。既存機能は維持する。

### Step 6K: 投稿スケジューラー実行基盤（完了）

- `ScheduledPostRunService`、preview/executeモード、`npm run posts:run` CLI、プロセス内多重起動防止、終了時のDB Pool終了を実装した。
- previewを既定とし、executeでも環境変数の`DRY_RUN=false`が明示されない限りX API・投稿履歴を更新しない。30日再投稿禁止とpending_reply優先は既存Orchestratorへ委譲する。
- Completion Gateと自己レビューを通過した。Railway Scheduler実設定、動画、GUI刷新、分散ロックは未実装であり、次Step候補はRailway Schedulerの実設定と単一インスタンス運用確認である。

### Step 6J: 投稿候補dryRun実行プレビュー（完了）

- 候補選定からタイトル解析、キラーメッセージ、投稿テンプレート、Orchestrator dryRunまでを接続し、最大5件の安全な予定一覧を返す`PostCandidatePreviewService`を追加した。
- 結果には本文・URL・商品タイトル全文を含めず、productId、カテゴリ、action/status、順序、文字数、warning/errorだけを含める。X API・投稿履歴を更新しない。
- 実投稿、動画、スケジューラー、UIは未実装。次Step候補はプレビューAPI／CLIを実行環境へ安全に接続することである。

### Step 6I: 投稿候補選定基盤（完了）

- セール2、指定女優2、お気に入りセール1、合計最大5の決定的な候補選定を追加した。30日親投稿、pending_reply、非販売、URL・タイトル欠損、無効女優のみ、重複を除外する。
- 女優priority、割引・キャンペーン、サンプル動画、発売日、商品IDの順で安定して優先する。不足時は水増しせずcategory_shortageを返す。
- 実投稿、動画、スケジューラー、候補選定UIは未実装。次Step候補は選定結果をdryRun投稿実行フローへ接続することである。

### Step 6H: 手動投稿APIの実環境dryRun確認（完了）

- ローカルdashboardを`DRY_RUN=true`で起動し、Basic認証下の`POST /api/posts/execute`へ架空の短い親投稿文・安全なテストURL・dryRunを指定して確認した。
- APIはHTTP 200、`action=dry_run`、`status=dry_run`を返し、レスポンスに投稿本文、URL、内部エラーは含まれなかった。実行前後の`post_history`件数は0で不変だった。
- dryRunではX API transportを呼ばず、DB更新を行わないことを実環境経路で確認した。実投稿、動画、候補選定、スケジューラーは未実施。次Step候補は、実データを用いない範囲でのpending_reply／blocked分岐の運用確認と、スケジューラー導線の設計である。

### Step 6G: 投稿実行フロー統合（完了）

- `PostExecutionOrchestrator`とBasic認証下の`POST /api/posts/execute`を追加した。pending_replyを最優先で返信再試行し、30日再投稿禁止中はX APIを呼ばずブロックする。
- dryRunでも適格性判定を行い、X API・DB更新を行わない。同一プロセス内のproductIdロックを持つが、動画・候補選定・スケジューラー・分散ロックは未実装である。
- 次Step候補は、手動投稿APIの実環境dryRun確認と、将来のスケジューラーからの安全な呼出しである。

### Step 6F: 返信再試行・30日再投稿禁止（完了）

- pending_replyの親履歴へ返信だけを再試行する`ReplyRetryService`と、親投稿を対象に既定30日を判定する`PostEligibilityService`を追加した。
- pending_replyは実投稿済みとして新規親投稿を禁止し、返信失敗時はpendingを維持する。dryRunはX API・履歴更新を行わない。同一プロセス内ロックはあるが、分散ロックは未実装である。
- migrationは実環境へ適用済み。動画、スケジューラー、候補選定、UIは未実装。次Step候補は適格性確認を手動・スケジューラー投稿フローへ接続することである。

### Step 6E: 実X APIアダプター・投稿履歴保存統合（完了）

- OAuth環境変数を使う`XApiPostClient`、`post_history` Repository、商品ID単位の同一プロセスロックを持つ統合サービスを追加した。
- migrationで親子履歴と`pending_reply`状態を追加し、親投稿成功・返信失敗時は親投稿IDと履歴を保持して返信再試行可能とする。dryRunは既定で通信・履歴保存を行わず、実投稿済み判定と混在しない。
- 分散ロック、動画アップロード、投稿候補選定、スケジューラーは未実装である。次Step候補は返信再試行と30日再投稿禁止の実行フロー統合である。

### Step 6D: 返信テンプレート・スレッド投稿実行基盤（完了）

- 親投稿→自分自身への返信という構造の`ThreadPostExecutionService`と注入可能な`XPostClient`を追加した。親投稿にはURLを入れず、返信テンプレートへHTTP/HTTPSのアフィリエイトURLを1回だけ入れる。
- dryRunでは通信せず予定返信だけを返す。親投稿成功後の返信失敗は親投稿IDを保持する`partial_success`とし、自動削除はしない。
- 動画アップロード、実X APIアダプター、投稿履歴保存は未実装である。次Step候補はX APIアダプターと投稿履歴保存の統合である。

### Step 6C: 投稿テンプレート生成基盤（完了）

- `generatePostTemplates` を追加し、タイトル解析とキラーメッセージ候補から、PR表記を含むURLなしの親投稿本文を複数スタイルで生成する。
- 女優名、キャンペーン、割引、ポイント、売れ筋の確認済み事実だけを使い、要約できない作品内容は安全な一般案内へフォールバックする。ハッシュタグは最大2個、文字数既定は240である。
- X API、URL・アフィリエイトURL、返信投稿、AI API、商品説明本文は未実装である。次Step候補はURLを自分自身の返信へ安全に投稿する返信テンプレート・投稿実行基盤である。

### Step 6B: キラーメッセージ生成基盤（完了）

- `generateKillerMessages` を追加し、解析済みの割引、キャンペーン、ポイント、売れ筋、女優名だけから短いキラーメッセージ候補をルールベースで生成する。
- 誇張を禁止し、作品内容を推測せず、成人向けの具体的描写を生成しない。半額を最優先とし、複合訴求は最大2要素、primaryと最大3件の重複しないalternativesを返す。
- AI API、絵文字、投稿テンプレート全体、商品説明本文、X投稿は未実装である。
- 次Step候補は、キラーメッセージ候補を安全に組み込む投稿テンプレート生成基盤である。

### Step 6A: 商品タイトル解析エンジン（完了）

- `analyzeProductTitle` を追加し、先頭の連続したキャンペーンラベル、割引率・半額、ポイント還元、開催回、固定sale signal、事実ベースの訴求候補、警告を純粋関数で返すようにした。
- 価格は補助情報とし、タイトル表記を投稿訴求の主要なセール情報源とする。異なる割引率は選択せず警告し、半額と50%OFFの併記は競合にしない。
- AIコピー生成、完成した投稿文、X投稿、DB保存、Provider、dashboardの変更は未実装である。
- 次Step候補は、解析結果だけを入力として扱うキラーメッセージ生成基盤である。

## Step 5E: DMM価格文字種診断（完了）

- `invalid_price` / `price_missing` の安全な価格診断へ、文字クラスパターン、ASCII/全角数字、空白、カンマ、ピリオド、通貨記号、日本語文字、範囲記号、その他記号の件数を追加した。数字や価格実値は出力しない。
- `priceCharacterPatterns`、`priceCharacterCounts`、`unknownPriceCodePoints` を `sync:sales:check` の要約へ追加した。未認識文字は `U+` コードポイントだけを集計し、数字のコードポイントは出力しない。
- 価格変換ルール、セール判定、保存処理は変更していない。次の実環境check-onlyで、`current_price` / `list_price` の4文字の文字種を安全に確認する。

## Step 5D: DMM価格形式診断と安全な価格変換（完了）

- `src/dmm-price.ts` にDMM API専用の価格変換を追加した。数値、数字文字列、カンマ区切り、円接尾辞、円記号、前後空白、全角数字を安全に数値化し、有限かつ0以上だけを許可する。
- 変換不能な価格は引き続き `invalid_price` として除外し、`priceFormats` と `priceDiagnostics` で `current_price`/`list_price`、形式、JavaScript型、配列・オブジェクト判定、文字数だけを集計する。価格実値・商品情報・認証情報は出力しない。
- 空文字、範囲表記、月額等のテキスト、配列・オブジェクト、負数、Infinity、NaNは推測せず失敗扱いとする。`list_price <= price` の既存セール除外条件は変更していない。
- 次のStep候補は、実環境check-onlyで`priceFormats`を確認し、必要なら別StepでDMM APIの取得条件または対象フロアを再調査することである。

## Step 5C: Sale Provider警告分類診断（完了）

- 実環境persistは完了したが、`fetchedCount: 0` と `warningsCount: 21` が確認されたため、`FanzaSaleProvider` の除外警告を安全なreason codeへ分類した。
- `sync:sales:check` は既存の状態・件数出力に加え、`warningReasons: reason=count` を出力する。商品名、商品ID、URL、価格、キャンペーン名、認証情報、接続文字列は出力しない。
- 分類は `campaign_missing`、`campaign_out_of_period`、`price_missing`、`invalid_price`、`price_not_discounted`、`required_field_missing`、`invalid_url`、`normalization_failed` である。保存処理とセール判定ルールは変更していない。
- 次のStep候補は、実環境でcheck-onlyを再実行し、最多のreason codeを確認したうえで、必要なら別Stepで取得条件またはセール判定の設計を見直すことである。

## Step 5B: 実環境スモークテスト基盤（完了）

- `src/sale-sync-smoke-test.ts` と `src/sync-sales-check.ts` に、設定・PostgreSQL・DMM ItemList・保存処理を安全に診断するCLI基盤を追加した。
- `npm run sync:sales:check` はcheck-onlyが既定であり、DB接続と最小Provider取得だけを確認して商品保存は行わない。`npm run sync:sales:check -- --persist` を明示した場合だけ `SaleSyncExecutionService` で保存・更新を一回実行する。
- 診断出力は状態・件数だけで、認証情報、接続文字列、SQL、商品名、商品URL、内部例外は出力しない。終了時はDB Poolを終了する。
- Railway Schedulerの実設定・時刻・頻度と分散ロックは未実装である。次のStep候補は、実環境でcheck-onlyを実行してから、明示的なpersist確認とRailway Scheduler運用設計を行うことである。

## Step 5A: セール同期の実行基盤（完了）

- `src/sale-sync-execution.ts` に、`FanzaSaleProvider`、`ProductService`/`ProductRepository` による `ProductWriter`、`SaleSyncRunner` を組み立てる実行サービスを追加した。公開契約は `SaleSyncExecutionService.run(): Promise<SaleSyncExecutionResult>` であり、開始済み結果または `already_running` を返す。
- `src/sale-sync-api.ts` とdashboardの最小ルーティングにより、Basic認証配下の `POST /api/sync/sales` を追加した。安全な同期件数要約だけを返し、実行中は409、設定不足・同期失敗・内部失敗は500で返す。GETでは実行しない。
- `src/sync-sales.ts` と `npm run sync:sales` を追加した。CLIは一回だけ同期してDB Poolを終了し、成功時は0、一部成功・失敗時は1で終了する。
- 多重起動防止は単一プロセス内ロックであり、複数サーバー間の分散ロックは未実装である。Railway Schedulerの実設定、実行頻度、女優との関連付け、投稿処理は未実装である。
- 次のStep候補は、Railway Schedulerの実設定またはセール同期の運用監視・分散ロック方針の確定である。

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
