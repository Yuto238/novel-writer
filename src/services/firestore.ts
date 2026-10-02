import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  collection,
  query,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Novel } from "../types";

function getDb() {
  if (!db) {
    throw new Error("Firebase is not configured");
  }
  return db;
}

// ユーザーの作品一覧を取得
export async function getUserNovels(userId: string): Promise<Novel[]> {
  try {
    const novelRef = collection(getDb(), "users", userId, "novels");
    const q = query(novelRef);
    const querySnapshot = await getDocs(q);
    
    const novels: Novel[] = [];
    querySnapshot.forEach((doc) => {
      novels.push({
        ...(doc.data() as Omit<Novel, 'id'>),
        id: doc.id,
      });
    });
    
    return novels;
  } catch (error) {
    console.error("Error getting novels:", error);
    throw error;
  }
}

// 単一の作品を取得
export async function getNovel(userId: string, novelId: string): Promise<Novel | null> {
  try {
    const docRef = doc(getDb(), "users", userId, "novels", novelId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    return {
      ...(docSnap.data() as Omit<Novel, 'id'>),
      id: docSnap.id,
    };
  } catch (error) {
    console.error("Error getting novel:", error);
    throw error;
  }
}

// 作品を保存（新規作成または更新）
export async function saveNovel(userId: string, novel: Novel): Promise<void> {
  try {
    const docRef = doc(getDb(), "users", userId, "novels", novel.id);
    
    const novelData = {
      title: novel.title,
      text: novel.text,
      totalPages: novel.totalPages,
      structureType: novel.structureType,
      mode: novel.mode ?? "novel",
      screenplay: novel.screenplay ?? null,
      createdAt: novel.createdAt,
      updatedAt: serverTimestamp(),
    };
    
    await setDoc(docRef, novelData, { merge: true });
  } catch (error) {
    console.error("Error saving novel:", error);
    throw error;
  }
}

// 複数の作品を一括保存（同期時）
export async function syncNovels(userId: string, novels: Novel[]): Promise<void> {
  try {
    for (const novel of novels) {
      await saveNovel(userId, novel);
    }
  } catch (error) {
    console.error("Error syncing novels:", error);
    throw error;
  }
}

// 作品を削除
export async function deleteNovel(userId: string, novelId: string): Promise<void> {
  try {
    const docRef = doc(getDb(), "users", userId, "novels", novelId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting novel:", error);
    throw error;
  }
}

// アクティブな作品IDをユーザープロファイルに保存
export async function saveActiveNovelId(userId: string, novelId: string): Promise<void> {
  try {
    const userRef = doc(getDb(), "users", userId);
    await updateDoc(userRef, {
      activeNovelId: novelId,
      lastUpdated: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error saving active novel ID:", error);
    throw error;
  }
}

// アクティブな作品IDを取得
export async function getActiveNovelId(userId: string): Promise<string | null> {
  try {
    const userRef = doc(getDb(), "users", userId);
    const docSnap = await getDoc(userRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    return docSnap.data().activeNovelId || null;
  } catch (error) {
    console.error("Error getting active novel ID:", error);
    throw error;
  }
}

// ユーザープロファイルを初期化
export async function initializeUser(userId: string, email: string, displayName: string): Promise<void> {
  try {
    const userRef = doc(getDb(), "users", userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        email,
        displayName,
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error("Error initializing user:", error);
    throw error;
  }
}
