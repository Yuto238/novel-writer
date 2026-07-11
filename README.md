# Novel Writer

VSCodeでこのフォルダを開き、ターミナルで以下を実行してください。

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm install
pnpm dev
```

ビルド確認：

```bash
pnpm build
```

作品データはブラウザのlocalStorageに自動保存されます。
ストレージキーは `novel-writer-v2` です。

## Googleログインとクラウド同期

同じGoogleアカウントでログインすると、別デバイスでも執筆の続きを再開できます。

1. Firebaseで以下を有効化
	- Authentication: Googleプロバイダ
	- Firestore Database
2. プロジェクトルートに `.env.local` を作成し、以下を設定

```env
VITE_FIREBASE_API_KEY=YOUR_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_APP_ID
```

3. 開発サーバーを再起動

```bash
pnpm dev
```

Firebase未設定でもアプリはローカル保存モードで動作します。

詳細手順は `FIREBASE_SETUP.md` を参照してください。

## GitHubで公開（GitHub Pages）

このリポジトリにはGitHub Pagesへ自動デプロイするワークフローを追加済みです。

1. GitHubへpushする（`main`ブランチ）
2. GitHubのリポジトリ設定でPagesを有効化
3. Actionsで `Deploy to GitHub Pages` が成功すると公開URLが発行されます

### 必要なSecrets

GitHubリポジトリの `Settings > Secrets and variables > Actions` に以下を登録してください。

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Firebase未設定のままでも公開は可能ですが、その場合はローカル保存モードで動作します。

### Firebase側で必要な設定

- Authenticationの承認済みドメインに `YOUR_NAME.github.io` を追加
- 必要に応じてFirestoreルールを本番向けに調整
