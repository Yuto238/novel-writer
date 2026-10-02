import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Printer,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import type { Novel, NovelsState, StructureType } from "./types";
import ScreenplayWorkspace, { createScreenplayProject } from "./components/ScreenplayWorkspace";

const STORAGE_KEY = "novel-writer-v2";

function createNovel(): Novel {
  const now = Date.now();
  return {
    id: nanoid(),
    title: "無題の作品",
    text: "",
    totalPages: 100,
    structureType: "kishotenketsu",
    createdAt: now,
    updatedAt: now,
  };
}

function initialState(): NovelsState {
  const novel = createNovel();
  return { novels: [novel], activeId: novel.id };
}

function loadState(): NovelsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as NovelsState;
    if (!Array.isArray(parsed.novels) || parsed.novels.length === 0) {
      return initialState();
    }
    const activeId = parsed.novels.some((n) => n.id === parsed.activeId)
      ? parsed.activeId
      : parsed.novels[0].id;
    return { novels: parsed.novels, activeId };
  } catch {
    return initialState();
  }
}

function countCharacters(text: string) {
  return text.replace(/\r?\n/g, "").length;
}

function splitIntoManuscriptPages(text: string) {
  const pages: string[] = [];
  let page = "";
  let count = 0;

  for (const character of text) {
    page += character;
    if (character !== "\n" && character !== "\r") count += character.length;
    if (count === 400) {
      pages.push(page);
      page = "";
      count = 0;
    }
  }

  if (page || pages.length === 0) pages.push(page);
  return pages;
}

function pagesFromText(text: string) {
  return countCharacters(text) / 400;
}

function clampProgress(currentPages: number, totalPages: number) {
  if (!Number.isFinite(totalPages) || totalPages <= 0) return 0;
  return Math.min(Math.max(currentPages / totalPages, 0), 1);
}

function isIOSDevice() {
  const ua = navigator.userAgent;
  const isIPad =
    /iPad/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return isIPad || /iPhone/.test(ua);
}

const structures: Record<
  StructureType,
  { label: string; start: number; end: number }[]
> = {
  kishotenketsu: [
    { label: "起", start: 0, end: 0.25 },
    { label: "承", start: 0.25, end: 0.5 },
    { label: "転", start: 0.5, end: 0.75 },
    { label: "結", start: 0.75, end: 1 },
  ],
  "three-act": [
    { label: "第一幕", start: 0, end: 0.25 },
    { label: "第二幕", start: 0.25, end: 0.75 },
    { label: "第三幕", start: 0.75, end: 1 },
  ],
};

function App() {
  const [state, setState] = useState<NovelsState>(loadState);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => window.matchMedia("(min-width: 900px)").matches,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 保存できない環境でも執筆は継続させる
    }
  }, [state]);

  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container) return;

    const onWheel = (event: WheelEvent) => {
      if (container.scrollWidth <= container.clientWidth) return;
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      if (delta === 0) return;

      event.preventDefault();
      container.scrollLeft -= delta;
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (
        settingsOpen &&
        settingsRef.current &&
        !settingsRef.current.contains(event.target as Node)
      ) {
        setSettingsOpen(false);
      }
      if (!(event.target as HTMLElement).closest("[data-delete]")) {
        setDeleteConfirmId(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen]);

  const activeNovel =
    state.novels.find((novel) => novel.id === state.activeId) ??
    state.novels[0];

  const characterCount = countCharacters(activeNovel.text);
  const currentPages = pagesFromText(activeNovel.text);
  const progress = clampProgress(currentPages, activeNovel.totalPages);
  const parts = structures[activeNovel.structureType];
  const currentPart =
    parts.find(
      (part, index) =>
        progress >= part.start &&
        (progress < part.end || index === parts.length - 1),
    ) ?? parts[0];

  const editorWidth = useMemo(() => {
    const columns = Math.max(8, Math.ceil(activeNovel.text.length / 18) + 3);
    return `max(100%, ${columns * 2.8}rem)`;
  }, [activeNovel.text.length]);

  function updateActive(updates: Partial<Novel>) {
    setState((current) => ({
      ...current,
      novels: current.novels.map((novel) =>
        novel.id === current.activeId
          ? { ...novel, ...updates, updatedAt: Date.now() }
          : novel,
      ),
    }));
  }

  function addNovel() {
    const novel = createNovel();
    setState((current) => ({
      novels: [...current.novels, novel],
      activeId: novel.id,
    }));
    setEditingId(novel.id);
    setEditingTitle(novel.title);
  }

  function renameNovel(id: string, title: string) {
    setState((current) => ({
      ...current,
      novels: current.novels.map((novel) =>
        novel.id === id
          ? { ...novel, title: title.trim() || "無題の作品" }
          : novel,
      ),
    }));
    setEditingId(null);
  }

  function deleteNovel(id: string) {
    setState((current) => {
      if (current.novels.length <= 1) return current;
      const index = current.novels.findIndex((novel) => novel.id === id);
      const novels = current.novels.filter((novel) => novel.id !== id);
      const activeId =
        current.activeId === id
          ? novels[Math.min(index, novels.length - 1)].id
          : current.activeId;
      return { novels, activeId };
    });
  }

  function printAsPdf() {
    if (!activeNovel.text.trim()) {
      window.alert("PDFにする本文がありません。");
      return;
    }
    window.print();
  }

  function handleIOSArrow(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (
      !isIOSDevice() ||
      event.nativeEvent.isComposing ||
      isComposing ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }
    const textarea = event.currentTarget;
    const position = textarea.selectionStart ?? 0;
    const charsPerColumn = Math.max(
      1,
      Math.floor(textarea.clientHeight / 18),
    );
    let next: number | null = null;
    if (event.key === "ArrowUp") next = position - 1;
    if (event.key === "ArrowDown") next = position + 1;
    if (event.key === "ArrowLeft") next = position + charsPerColumn;
    if (event.key === "ArrowRight") next = position - charsPerColumn;
    if (next === null) return;
    event.preventDefault();
    const clamped = Math.min(Math.max(next, 0), textarea.value.length);
    requestAnimationFrame(() => {
      textarea.setSelectionRange(clamped, clamped);
    });
  }

  if (activeNovel.mode === "screenplay") {
    return (
      <ScreenplayWorkspace
        novel={activeNovel}
        onUpdate={updateActive}
        onSwitchToNovel={() => updateActive({ mode: "novel" })}
      />
    );
  }

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="作品一覧を閉じる"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <header className="sidebar-header">
          <div>
            <p>NOVEL WRITER</p>
            <h1>作品一覧</h1>
          </div>
          <button
            className="icon-button sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="作品一覧を閉じる"
          >
            <X size={19} />
          </button>
        </header>

        <div className="novel-list">
          {state.novels.map((novel) => {
            const pages = pagesFromText(novel.text);
            const miniProgress = clampProgress(pages, novel.totalPages);
            const confirming = deleteConfirmId === novel.id;

            return (
              <article
                key={novel.id}
                className={`novel-card ${
                  state.activeId === novel.id ? "active" : ""
                }`}
                onClick={() => {
                  setState((current) => ({
                    ...current,
                    activeId: novel.id,
                  }));
                  if (window.innerWidth < 900) setSidebarOpen(false);
                }}
              >
                <div className="novel-heading">
                  {editingId === novel.id ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => renameNovel(novel.id, editingTitle)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          renameNovel(novel.id, editingTitle);
                        }
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                  ) : (
                    <h2>{novel.title}</h2>
                  )}

                  {editingId !== novel.id && (
                    <div className="novel-actions">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(novel.id);
                          setEditingTitle(novel.title);
                        }}
                        aria-label="タイトルを変更"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        data-delete
                        disabled={state.novels.length <= 1}
                        className={confirming ? "confirming" : ""}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (state.novels.length <= 1) return;
                          if (confirming) {
                            deleteNovel(novel.id);
                            setDeleteConfirmId(null);
                          } else {
                            setDeleteConfirmId(novel.id);
                          }
                        }}
                        aria-label="作品を削除"
                      >
                        <Trash2 size={15} />
                        {confirming && <span>削除確認</span>}
                      </button>
                    </div>
                  )}
                </div>

                <p className="novel-pages">
                  {pages.toFixed(1)} / {novel.totalPages}枚
                </p>
                <div className="mini-progress">
                  <div style={{ width: `${miniProgress * 100}%` }} />
                </div>
              </article>
            );
          })}
        </div>

        <footer className="sidebar-footer">
          <button onClick={addNovel}>
            <Plus size={18} />
            新しい作品
          </button>
        </footer>
      </aside>

      <main className={`main ${sidebarOpen ? "with-sidebar" : ""}`}>
        <header className="main-header">
          <div className="title-group">
            <button
              className="icon-button"
              onClick={() => setSidebarOpen((value) => !value)}
              aria-label="作品一覧を開閉"
            >
              {sidebarOpen ? (
                <PanelLeftClose size={20} />
              ) : (
                <PanelLeftOpen size={20} />
              )}
            </button>
            <h2>{activeNovel.title}</h2>
          </div>

          <div className="header-tools">
            <div className="mode-switch-group" aria-label="制作モード">
              <button className="active" aria-current="page">小説</button>
              <button onClick={() => updateActive({ mode: "screenplay", screenplay: activeNovel.screenplay ?? createScreenplayProject() })}>脚本</button>
            </div>
            <p className="counter">
              <strong>{currentPages.toFixed(1)}枚</strong>
              <span>/ {activeNovel.totalPages}枚</span>
              <span className="chars">
                {characterCount.toLocaleString("ja-JP")}字
              </span>
            </p>

            <button
              className="pdf-button"
              onClick={printAsPdf}
              aria-label="400字詰めでPDF化"
              title="400字詰めでPDF化"
            >
              <Printer size={17} />
              <span>PDF化</span>
            </button>

            <div className="settings-wrap" ref={settingsRef}>
              <button
                className="icon-button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSettingsOpen((value) => !value);
                }}
                aria-expanded={settingsOpen}
                aria-label="作品設定"
              >
                <Settings size={20} />
              </button>

              {settingsOpen && (
                <div className="settings-panel">
                  <label>
                    目標総枚数
                    <div className="number-wrap">
                      <input
                        type="number"
                        min={1}
                        max={9999}
                        value={activeNovel.totalPages}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          if (Number.isFinite(value)) {
                            updateActive({
                              totalPages: Math.min(
                                Math.max(Math.round(value), 1),
                                9999,
                              ),
                            });
                          }
                        }}
                      />
                      <span>枚</span>
                    </div>
                  </label>

                  <fieldset>
                    <legend>物語構造</legend>
                    <label className="radio">
                      <input
                        type="radio"
                        checked={activeNovel.structureType === "kishotenketsu"}
                        onChange={() =>
                          updateActive({ structureType: "kishotenketsu" })
                        }
                      />
                      起承転結
                    </label>
                    <label className="radio">
                      <input
                        type="radio"
                        checked={activeNovel.structureType === "three-act"}
                        onChange={() =>
                          updateActive({ structureType: "three-act" })
                        }
                      />
                      三幕構成
                    </label>
                  </fieldset>
                </div>
              )}
            </div>
          </div>
        </header>

        <section className="structure-section">
          <div className="structure-meta">
            <span>現在：{currentPart.label}</span>
            <span>進捗 {Math.round(progress * 100)}%</span>
          </div>

          <div className="structure-track">
            {parts.map((part) => {
              let fill = 0;
              if (progress >= part.end) fill = 100;
              else if (progress > part.start) {
                fill =
                  ((progress - part.start) / (part.end - part.start)) * 100;
              }
              return (
                <div
                  key={part.label}
                  className="structure-part"
                  style={{ width: `${(part.end - part.start) * 100}%` }}
                >
                  <div
                    className="structure-fill"
                    style={{ width: `${fill}%` }}
                  />
                  <span>{part.label}</span>
                </div>
              );
            })}
            <div
              className="indicator"
              style={{
                left: `clamp(1px, ${progress * 100}%, calc(100% - 1px))`,
              }}
            />
          </div>
        </section>

        <section className="editor-section">
          <div ref={editorContainerRef} className="vertical-editor-container">
            <textarea
              ref={editorRef}
              className="novel-editor"
              value={activeNovel.text}
              onChange={(e) => updateActive({ text: e.target.value })}
              placeholder="ここから書き始めてください。"
              spellCheck={false}
              style={{ width: editorWidth }}
              onKeyDown={handleIOSArrow}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
            />
          </div>
        </section>
      </main>

      <div className="print-document" aria-hidden="true">
        {splitIntoManuscriptPages(activeNovel.text).map((page, index) => (
          <section className="print-page" key={index}>
            {index === 0 && <h1 className="print-title">{activeNovel.title}</h1>}
            <div className="print-page-content">{page}</div>
            <footer>{index + 1}</footer>
          </section>
        ))}
      </div>
    </div>
  );
}

export default App;
