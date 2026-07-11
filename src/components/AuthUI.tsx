import { signInWithPopup, signOut, type User } from "firebase/auth";
import { auth, googleProvider, isFirebaseConfigured } from "../firebase";
import { LogOut, LogIn } from "lucide-react";
import { initializeUser } from "../services";

interface AuthUIProps {
  user: User | null;
  loading: boolean;
}

export function AuthUI({ user, loading }: AuthUIProps) {
  const handleGoogleLogin = async () => {
    if (!isFirebaseConfigured || !auth || !googleProvider) {
      alert("Firebase設定がされていません。.env.localファイルで設定してください。");
      return;
    }

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // ユーザープロファイルを初期化
      await initializeUser(user.uid, user.email || "", user.displayName || "");
    } catch (error) {
      console.error("Login error:", error);
      alert("ログインに失敗しました");
    }
  };

  const handleLogout = async () => {
    if (!auth) return;

    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
      alert("ログアウトに失敗しました");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-white">読み込み中...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-8">NOVEL WRITER</h1>
          <p className="text-gray-300 mb-8">同期機能付きの小説執筆ツール</p>
          
          <button
            onClick={handleGoogleLogin}
            className="flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 font-semibold py-3 px-8 rounded-lg transition-colors"
          >
            <LogIn size={20} />
            Googleアカウントでログイン
          </button>
          
          <p className="text-gray-400 text-sm mt-8 max-w-md mx-auto">
            Googleアカウントでログインすると、複数のデバイスから同じアカウントで作品の続きを執筆できます。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute top-4 right-4 flex items-center gap-4 bg-gray-800 px-4 py-2 rounded-lg">
      <div className="text-sm text-gray-300">
        <p className="font-medium text-white">{user.displayName}</p>
        <p className="text-xs text-gray-400">{user.email}</p>
      </div>
      <button
        onClick={handleLogout}
        className="p-2 hover:bg-gray-700 rounded-md transition-colors text-gray-300 hover:text-white"
        title="ログアウト"
      >
        <LogOut size={18} />
      </button>
    </div>
  );
}
