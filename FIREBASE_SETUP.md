# Novel Writer - ログイン機能とクラウド同期のセットアップガイド

このプロジェクトにGoogle ログイン機能とクラウド同期を追加しました。以下の手順でセットアップしてください。

## 1. Firebaseプロジェクトの作成

1. [Firebase Console](https://console.firebase.google.com/)にアクセス
2. 「プロジェクトを作成」をクリック
3. プロジェクト名を入力（例：「novel-writer」）
4. 設定を完了

## 2. Google認証の有効化

1. Firebaseコンソールで、プロジェクトを選択
2. 左メニューから「Authentication」を選択
3. 「Sign-in method」タブをクリック
4. 「Google」をクリック
5. 有効にしてください

## 3. Firestoreの有効化

1. 左メニューから「Firestore Database」を選択
2. 「データベースを作成」をクリック
3. 以下の設定で作成：
   - ロケーション：`asia-northeast1`（日本）推奨
   - セキュリティルール：開発モードで開始

4. セキュリティルールを以下に更新：

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
      match /novels/{novelId} {
        allow read, write: if request.auth.uid == userId;
      }
    }
  }
}
```

## 4. APIキーの取得

1. Firebaseコンソールで「プロジェクトの設定」（⚙️）をクリック
2. 「全般」タブで、下の方に「ウェブアプリの設定」があります
3. 以下のコードが表示されます：

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

## 5. 環境変数の設定

プロジェクトルートに `.env.local` ファイルを作成し、以下の内容を入力：

```env
VITE_FIREBASE_API_KEY=YOUR_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_APP_ID
```

YOUR_* を実際の値に置き換えてください。

## 6. Webアプリの登録（OAuth 設定）

1. Firebaseコンソールで「Authentication」を選択
2. 「Sign-in method」タブ → 「Google」をクリック
3. 「承認済みのリダイレクトURI」に以下を追加：
   - `http://localhost:5173`（開発環境）
   - デプロイ後は実際のドメインも追加

## 7. サーバーを再起動

開発サーバーを再起動します：

```bash
npm run dev
```

## 機能説明

### ログイン画面

- アプリ起動時、ログイン画面が表示されます
- 「Googleアカウントでログイン」をクリックしてログイン

### クラウド同期

- ログイン後、作品データはFirestoreに自動保存されます
- 3秒のデバウンスで連続した変更を効率的に同期
- ローカルストレージにも保存されるため、オフライン時も使用可能
- 別デバイスでは同じGoogleアカウントでログインすると、データが自動的に同期されます

### ローカルで試す場合

Firebase設定がない場合は、ローカルストレージのみを使用します（同期機能なし）。

## トラブルシューティング

### エラー: "auth/invalid-api-key"

→ `.env.local` ファイルが正しく設定されているか確認してください

### エラー: "Firebase設定がされていません"

→ `.env.local` ファイルが存在するか、内容が正しいか確認してください

### Firestoreにデータが保存されない

→ Firestoreセキュリティルールが正しく設定されているか確認してください

## セキュリティに関する注意

- `.env.local` は `.gitignore` に追加済みです
- APIキーはブラウザに公開されるため、必ずFirestoreのセキュリティルールで保護してください
- ユーザーは自分のデータにのみアクセス可能です
