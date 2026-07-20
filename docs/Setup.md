# 開発環境セットアップ（Windows）

## 必要なソフトウェア

- Git
- Node.js（プロジェクトが要求するLTS版）とnpm
- Visual Studio Code
- VS Code用Codex拡張

インストール後、PowerShellで確認する。

```powershell
git --version
node --version
npm --version
code --version
```

## リポジトリの取得

```powershell
git clone <repository-url>
Set-Location <repository-directory>
git status
git branch --show-current
npm install
```

## VS CodeとCodex

1. VS Codeでcloneしたフォルダーを開く。
2. 拡張機能ビューからCodex拡張をインストールし、認証する。
3. 統合ターミナルをPowerShellで開く。
4. 作業開始時に `ProjectStatus.md` と `AGENTS.md` を確認する。

## 基本検証

変更後はプロジェクト直下で実行する。

```powershell
npm run check
npm test
npm run build
git diff --check
```

## PostgreSQL（Step 1）

`.env.example` を参考に、ローカルではGit管理しない `.env` に `DATABASE_URL` を設定する。マイグレーションコマンドはこのファイルを読み込む一方、アプリのDB接続モジュールは `process.env` だけを参照する。ローカルでアプリからDBを使う場合はPowerShellで `DATABASE_URL` を環境変数として設定する。既存アプリは未設定でも起動するが、DB接続が必要な処理は明確な設定エラーになる。

```powershell
npm run db:migrate
npm run db:migrate:down
npm run db:migrate:create -- <migration-name>
```

`db:migrate:create` はTypeScriptのマイグレーション雛形を `migrations/` に作成する。Step 1では業務テーブルを作成しない。Railwayでは `DATABASE_URL` をサービス変数として設定し、本番のSSL接続を確認する。

Railway等でTLSが必要な場合は `DATABASE_SSL=true` を設定する。証明書検証は既定で有効であり、例外的に必要な場合だけ `DATABASE_SSL_REJECT_UNAUTHORIZED=false` を設定する。

## セール同期の手動実行（Step 5A）

`DATABASE_URL`、`DMM_API_ID`、`DMM_AFFILIATE_ID` を環境変数に設定したうえで、PowerShellから一回だけ実行します。

```powershell
npm run sync:sales
```

成功時の終了コードは0です。一部成功、失敗、または同一プロセスで実行中の場合は終了コード1です。Railway Schedulerを設定する後続Stepでは、スケジュールのコマンドに同じ `npm run sync:sales` を指定します。時刻・頻度の設定はこのStepでは行いません。

既存の管理画面起動コマンドは `npm run dashboard`。認証情報、トークン、アフィリエイトID、パスワードはリポジトリへ追加せず、環境変数等で安全に管理する。
