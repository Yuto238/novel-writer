import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

// ⚠️ Firebase設定
// https://firebase.google.com/docs/web/setup
// Firebaseプロジェクトを作成し、以下の値を環境変数から読み込むか直接設定してください

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let googleProvider: GoogleAuthProvider | null = null;

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;

const isFirebaseConfigured = Boolean(
  apiKey &&
    projectId &&
    !apiKey.startsWith("your_") &&
    !projectId.startsWith("your_"),
);

if (isFirebaseConfigured) {
  const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  try {
    // Firebaseの初期化
    app = initializeApp(firebaseConfig);

    // 認証
    auth = getAuth(app);

    // Google認証プロバイダー
    googleProvider = new GoogleAuthProvider();

    // Firestore
    db = getFirestore(app);
  } catch (error) {
    console.warn("Failed to initialize Firebase:", error);
  }
}

export { auth, db, googleProvider, isFirebaseConfigured };
