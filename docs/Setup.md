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

既存の管理画面起動コマンドは `npm run dashboard`。認証情報、トークン、アフィリエイトID、パスワードはリポジトリへ追加せず、環境変数等で安全に管理する。
