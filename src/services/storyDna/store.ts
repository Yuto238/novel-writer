import type { ApplicationSuggestion, ReferenceScript } from "../../types";

const DB = "novel-writer-storydna";
let dbPromise: Promise<IDBDatabase> | undefined;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore("refs", { keyPath: "id" }); req.result.createObjectStore("files"); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const listReferences = () => run<ReferenceScript[]>("refs", "readonly", (s) => s.getAll());
export const saveReference = (r: ReferenceScript) => run("refs", "readwrite", (s) => s.put(r));
export const saveFile = (id: string, blob: Blob) => run("files", "readwrite", (s) => s.put(blob, id));
export const getFile = (id: string) => run<Blob | undefined>("files", "readonly", (s) => s.get(id));
export async function deleteReference(id: string) {
  await run("refs", "readwrite", (s) => s.delete(id));
  await run("files", "readwrite", (s) => s.delete(id));
}

const key = (novelId: string) => `storydna.suggestions.${novelId}`;
export function loadSuggestions(novelId: string): ApplicationSuggestion[] {
  try { return JSON.parse(localStorage.getItem(key(novelId)) ?? "[]") as ApplicationSuggestion[]; } catch { return []; }
}
export function saveSuggestions(novelId: string, list: ApplicationSuggestion[]) {
  try { localStorage.setItem(key(novelId), JSON.stringify(list.slice(-200))); } catch { /* 容量超過時は保存しない */ }
}
