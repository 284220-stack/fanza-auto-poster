# 開発ルール

## Git・GitHub運用の標準フロー（最優先）

この節は、Git運用に関する他の記載より優先する。

1. `main` ブランチかつ作業ツリーがcleanであることを確認する。
2. `feature` ブランチを作成する。
3. 実装する。
4. テストする。
5. 自己レビューする。
6. Completion Gateを実行する。
7. 全成功時のみ `git add -A` を実行する。
8. ローカルコミットする。
9. 現在のfeatureブランチを `origin` へpushする。
10. baseが `main`、headが今回のfeatureブランチであるPull Requestを作成する。
11. PRの状態・競合・必須チェックを確認する。
12. マージ条件を満たす場合だけPRをmergeする。
13. `main` へ切り替え、`origin/main` をpullする。
14. 今回のローカルfeatureブランチを削除する。
15. `git status` を確認して最終報告する。

Codexは各Stepで、featureブランチ作成、実装、テスト、文書更新、自己レビュー、Completion Gate、`git add -A`、ローカルコミット、push、Pull Request作成、条件を満たすPRのmerge、ローカルmain更新までを担当する。

### コミット条件

以下がすべて成功し、自己レビューがOKの場合だけコミットできる。

- `npm run check`
- `npm test`
- `npm run build`
- `git diff --check`
- 自己レビュー

一つでも失敗した場合はコミットしない。

### GitHubでのマージ条件

以下をすべて満たす場合だけ自動マージできる。

- Completion Gateと自己レビューが成功している。
- PR作成に成功している。
- baseが `main`、headが今回のfeatureブランチである。
- GitHub上で競合がない。
- 必須チェックがある場合はすべて成功している。

一つでも満たさない場合はmergeせず、Step In Progressとして報告する。

PowerShellでは、必要に応じて次の形式を使用する。

```powershell
git push -u origin <feature-branch>
gh pr create --base main --head <feature-branch> --title "<タイトル>" --body "<概要・変更内容・検証結果・残る懸念>"
gh pr merge <PR番号またはURL> --merge --delete-branch
git switch main
git pull origin main
git branch -d <feature-branch>
git status
```

PR本文には、概要、主な変更、対象外、テスト・検証結果、残る懸念を含める。

### 未完成時

Step In Progressの場合は、コミット・push・Pull Request作成・mergeを禁止する。ProjectStatus.mdへ再開地点を記録し、途中差分はステージしてよい。次回は同じfeatureブランチと既存差分から再開する。

### 完了時の報告

Step Completedの場合は、コミットID、コミットメッセージ、push結果、PR番号とURL、merge結果、main更新結果、削除したfeatureブランチ、最終`git status`、次Step候補を必ず報告する。

### 禁止事項

Codexは以下を行わない。

- mainへの直接push
- force push
- mainの削除
- `main` 以外を誤ってPRのbaseに指定すること
- 他の人が作成したPRのmerge
- 関係のないブランチの削除
- チェック失敗時の強制merge
- 認証情報やトークンの出力
- 未完成状態でのpush・Pull Request作成・merge
- 明示指示がある文書整備を除く、mainへの直接コミット

## 作業開始前

- 必ず `ProjectStatus.md` を確認する。
- 要件、アーキテクチャ、移行計画との整合を確認する。
- 無関係な既存変更を上書き・破棄しない。
- Stepの要件、既存コード、必要なテストと検証を確認し、実装・テスト・自己レビュー・検証・コミットまでを今回の作業で完走できるか自己見積もりする。
- 完走できないと判断した場合は、実装を開始せずに理由、未確定事項、完走可能にするための提案を報告する。途中まで実装して停止しない。

## 実装ルール

- 1 Step = 1機能を原則とする。
- 各Stepで `npm run check`、`npm test`、`npm run build`、`git diff --check` を実行する。
- 仕様変更時は実装前に `docs/Requirements.md`、`docs/Architecture.md`、必要な計画文書を更新する。
- 確定済みの既存仕様を独断で変更しない。判断が必要なら確認する。
- 認証情報、トークン、パスワード、Cookie、アフィリエイトIDをコード、テスト、ログ、コミットへ書かない。
- FANZAのID、パスワード、Cookieをサーバー側へ保存しない。
- mainへ直接大規模変更しない。機能単位のブランチとレビュー可能な差分を用いる。

## Stepの進め方と完走基準

- 大きなStepは、原則として `Repository → Service → API → UI → テスト → 自己レビュー` の順に実装する。対象外の層は明示し、その層を飛ばしてよい。
- 実装前に、変更対象、テスト方針、検証コマンド、自己レビュー観点を短い作業計画として整理する。
- レビュー指摘は原則として同じStep内で修正し、修正後に再レビューと全検証を行う。次のStepへ未解決のレビュー指摘を持ち越さない。
- 時間、作業量、設計変更、外部要因により完走できないと判明した場合は、途中コミットを作らない。変更状態、完了済み・未完了、停止理由、再開条件を報告して停止する。
- Step分割は最後の手段とする。まず実装順序、作業計画、自己レビューで完走を目指し、それでも完走不能な根拠がある場合だけ、依存関係と完了条件を示して分割を提案する。

## コミットとGit運用

- コミットは、`npm run check`、`npm test`、`npm run build`、`git diff --check`、`git status`確認、自己レビューのすべてが成功・完了した場合にだけ行う。1つでも失敗または未確認ならコミットしない。
- 標準の流れは `featureブランチ → 実装 → 自己レビュー → コミット → push → Pull Request → Merge → main更新` とする。ユーザーが明示的に除外した工程は実行しない。
- 未完成の状態を共有・保存する必要がある場合も、完了を装うコミットを作らない。作業ツリーの状態と再開手順を報告する。

## ルールの継続的改善

- 同じ種類の問題が2回発生した場合は、次の機能開発より先に `AGENTS.md` を更新し、再発防止のルールまたは確認項目を追加する。

## 複数ターン継続モード

- Stepは設計上別機能でない限り分割せず、同じStepを複数ターンで継続してよい。
- 1ターンで完走できない場合も、安全な範囲まで実装を進めてよい。ただし未完成ではコミット、push、PR、Step Completed宣言を行わない。
- ターン終了前に `ProjectStatus.md` へ現在のStep、完了済み・未完了、具体的な再開地点、検証状態を記録する。次のターンはgit diffと同文書を確認して続きから再開し、同じ処理を最初から作り直さない。
- 全要件とCompletion Gateを満たした最後のターンだけコミットする。未完成コミットは禁止のままとし、時間制限だけを理由にStep分割しない。

### 再開時の必須確認

- 途中Stepを再開するときは、実装前に必ず次の順で確認する。
  1. 現在のブランチ（`git branch --show-current`）
  2. `git diff --cached`
  3. `ProjectStatus.md`
  4. `git diff`
  5. `git status`
- `ProjectStatus.md` だけを信頼しない。実際の差分である `git diff` を正とし、進捗文書との不一致があれば差分を優先してから実装を再開する。
- 想定したfeatureブランチ以外、特に`main`では途中Stepの作業を開始しない。
- 途中実装でも `git add` してよい。未追跡ファイルを途中状態のまま放置しない。ただしCompletion Gate通過前はコミット、push、PRを禁止する。

## 投稿安全性

- 実投稿前に販売中、URL、アフィリエイトID、【PR】、価格・セール、動画、30日制限、文面重複、日次上限を検証する。
- 条件未達の候補を件数合わせで投稿しない。
- `DRY_RUN` は実投稿と同じ判定経路を通す。

## VR作品の除外（恒久ルール）

- VR作品は取得・保存・候補生成・投稿の全経路で除外し、女優・新作・セール・favorite_saleの全カテゴリに共通で適用する。
- 公式APIのジャンル・商品種別・カテゴリ等の構造化情報を優先し、判定できない場合だけタイトル先頭の`【VR】`または`[VR]`等の明確な表記を補助判定に使う。
- 判定前に大文字小文字、全角半角、前後空白を正規化する。単に`VR`という文字を含む無関係な作品は除外しない。
- 判定根拠が不足する場合に規則を勝手に緩和せず、安全な確認を優先する。
