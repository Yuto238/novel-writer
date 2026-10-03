import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Circle, FilePlus2, Loader2, RefreshCw, Settings2, Trash2, X } from "lucide-react";
import type { ApplicationSuggestion, ReferenceScript, ScreenplayProject } from "../../types";
import { analyzeOwn } from "../../services/storyDna/compare";
import { commonAnalysis } from "../../services/storyDna/multi";
import { analyzeReference, newReference, STAGES } from "../../services/storyDna/pipeline";
import { deleteReference, getFile, listReferences, loadSuggestions, saveFile, saveReference, saveSuggestions } from "../../services/storyDna/store";
import { evaluate, toAnalysis } from "../../services/storyDna/techniques";
import { loadLlm, saveLlm, type LlmSettings } from "../../services/storyDna/translate";
import "./storydna.css";
import { ApplyTab } from "./ApplyTab";
import { applyPatchToProject, ProposalModal } from "./ProposalModal";
import { CharactersTab, DialogueTab, OverviewTab, ScenesTab, StructureTab, TechniquesTab, TranslationTab, type ViewCtx } from "./ReferenceView";

const TABS = [["overview", "概要"], ["translation", "翻訳"], ["structure", "構成"], ["scenes", "シーン"], ["dialogue", "セリフ"], ["characters", "人物"], ["techniques", "技法"], ["apply", "自作への応用"]] as const;
type TabId = (typeof TABS)[number][0];
const MAX_BYTES = 80 * 1024 * 1024;

interface Props {
  novelId: string;
  novelTitle: string;
  project: ScreenplayProject;
  onCommit: (next: ScreenplayProject) => void;
  onOpenScene: (sceneId: string) => void;
}

export default function StoryDnaWorkspace({ novelId, novelTitle, project, onCommit, onOpenScene }: Props) {
  const [refs, setRefs] = useState<ReferenceScript[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState("");
  const [tab, setTab] = useState<TabId>("overview");
  const [applyKey, setApplyKey] = useState<string | undefined>();
  const [selected, setSelected] = useState<string[]>([]);
  const [showCommon, setShowCommon] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const [llm, setLlm] = useState<LlmSettings>(loadLlm);
  const [suggestions, setSuggestions] = useState<ApplicationSuggestion[]>(() => loadSuggestions(novelId));
  const [activeSuggestion, setActiveSuggestion] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const projectRef = useRef(project);
  projectRef.current = project;

  useEffect(() => {
    listReferences().then((list) => {
      setRefs(list.map((r) => (r.analysisStatus === "analyzing" ? { ...r, analysisStatus: "error" as const, errorMessage: "解析が中断されました。「再解析」でやり直してください。" } : r)).sort((a, b) => b.createdAt - a.createdAt));
      setLoaded(true);
    }).catch(() => { setError("解析済み脚本の読み込みに失敗しました（ブラウザの保存領域にアクセスできません）。"); setLoaded(true); });
  }, []);

  const upsert = useCallback((r: ReferenceScript) => {
    setRefs((prev) => (prev.some((x) => x.id === r.id) ? prev.map((x) => (x.id === r.id ? r : x)) : [r, ...prev]));
    saveReference(r).catch(() => setError("解析結果を保存できませんでした（保存容量が不足している可能性があります）。"));
  }, []);

  const own = useMemo(() => analyzeOwn(project, novelTitle), [project, novelTitle]);

  const persistSuggestions = (list: ApplicationSuggestion[]) => { setSuggestions(list); saveSuggestions(novelId, list); };
  const propose = (s: ApplicationSuggestion) => {
    const exists = suggestions.some((x) => x.id === s.id);
    persistSuggestions(exists ? suggestions : [...suggestions, s]);
    setActiveSuggestion(s.id);
  };
  const changeSuggestion = (s: ApplicationSuggestion) => persistSuggestions(suggestions.map((x) => (x.id === s.id ? s : x)));

  const runAnalysis = async (r: ReferenceScript, blob: Blob) => { await analyzeReference(r, blob, projectRef.current, upsert); };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    for (const file of Array.from(files)) {
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") { setError(`「${file.name}」はPDFではありません。脚本のPDFファイルを選択してください。`); continue; }
      if (file.size > MAX_BYTES) { setError(`「${file.name}」はファイルサイズが大きすぎます（上限 ${MAX_BYTES / 1024 / 1024}MB）。`); continue; }
      const r = newReference(file);
      try { await saveFile(r.id, file); } catch { setError("PDFを保存できませんでした。ブラウザの保存容量をご確認ください。"); continue; }
      upsert(r);
      await runAnalysis(r, file);
    }
    if (input.current) input.current.value = "";
  };

  const reanalyze = async (r: ReferenceScript) => {
    const blob = await getFile(r.id).catch(() => undefined);
    if (!blob) { setError("元のPDFが見つからないため再解析できません。PDFを追加し直してください。"); return; }
    await runAnalysis(r, blob);
  };
  const remove = async (r: ReferenceScript) => {
    if (!window.confirm(`「${r.title}」の解析結果を削除しますか？`)) return;
    await deleteReference(r.id).catch(() => undefined);
    setRefs((p) => p.filter((x) => x.id !== r.id)); setSelected((p) => p.filter((x) => x !== r.id));
    if (openId === r.id) setOpenId("");
  };
  const saveLlmSettings = () => { saveLlm(llm); setSettings(false); };

  const open = refs.find((r) => r.id === openId);
  const doneSelected = refs.filter((r) => selected.includes(r.id) && r.analysisStatus === "done");
  const common = useMemo(() => (showCommon && doneSelected.length >= 2 ? commonAnalysis(doneSelected) : null), [showCommon, doneSelected]);

  const active = suggestions.find((s) => s.id === activeSuggestion);
  const activeRef = active ? refs.find((r) => r.id === active.referenceId) : undefined;
  const modal = active && activeRef && (
    <ProposalModal suggestion={active} refAnalysis={toAnalysis(activeRef)} own={own} project={project} onChange={changeSuggestion} onClose={() => setActiveSuggestion("")}
      onAdopt={(s, pos) => { onCommit(applyPatchToProject(project, s, pos)); changeSuggestion(evaluate({ ...s, status: "adopted" }, toAnalysis(activeRef))); }}
      onReject={(s) => { changeSuggestion({ ...s, status: "rejected" }); setActiveSuggestion(""); }} onOpenScene={onOpenScene} />
  );

  const ctx: ViewCtx | undefined = open && { script: open, onChange: upsert, project, own, onPropose: propose, onGoApply: (k) => { setApplyKey(k); setTab("apply"); } };

  if (open && ctx) {
    return (
      <div className="sd-root">
        <header className="sd-view-head">
          <button className="sd-back" onClick={() => setOpenId("")}><ArrowLeft size={15} />換骨奪胎</button>
          <div><small>REFERENCE SCRIPT</small><h2>{open.title}</h2></div>
          <span className="sd-muted">{open.pageCount}ページ · {open.scenes.length}シーン</span>
        </header>
        <nav className="sd-tabs">{TABS.map(([id, label]) => <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>)}</nav>
        {open.analysisStatus === "error" && <div className="sd-error">{open.errorMessage}</div>}
        {open.analysisStatus === "analyzing" ? <ProgressList r={open} /> : <>
          {tab === "overview" && <OverviewTab {...ctx} />}
          {tab === "translation" && <TranslationTab {...ctx} />}
          {tab === "structure" && <StructureTab {...ctx} />}
          {tab === "scenes" && <ScenesTab {...ctx} />}
          {tab === "dialogue" && <DialogueTab {...ctx} />}
          {tab === "characters" && <CharactersTab {...ctx} />}
          {tab === "techniques" && <TechniquesTab {...ctx} />}
          {tab === "apply" && <ApplyTab ctx={ctx} initialKey={applyKey} suggestions={suggestions} />}
        </>}
        {modal}
      </div>
    );
  }

  return (
    <div className="sd-root">
      <header className="sd-hero">
        <div><small className="sd-eyebrow">STORY DNA · SCRIPT DECONSTRUCTION</small><h2>換骨奪胎</h2><p>優れた脚本を分解し、<br />技法だけを自分の作品へ取り込む。</p></div>
        <div className="sd-hero-actions">
          <button className="sd-btn primary big" onClick={() => input.current?.click()}><FilePlus2 size={16} />脚本PDFを追加</button>
          <button className="sd-btn ghost" onClick={() => setSettings(true)}><Settings2 size={14} />翻訳設定</button>
          <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => addFiles(e.target.files)} />
        </div>
      </header>
      <p className="sd-notice">表現をコピーするのではなく、構造と技法を学ぶための機能です。分析はブラウザ内のルールベース解析による推定で、断定ではなく提案として表示されます。脚本は採用するまで自動では変更されません。</p>
      {error && <div className="sd-error">{error}<button onClick={() => setError("")}><X size={13} /></button></div>}
      <div className="sd-list-head"><h3>解析済み脚本</h3>{selected.length >= 2 && <button className="sd-btn primary" onClick={() => setShowCommon(true)}>共通点を分析（{selected.length}作品）</button>}</div>
      {!loaded && <p className="sd-muted"><Loader2 size={13} className="spin" /> 読み込み中…</p>}
      {loaded && !refs.length && <div className="sd-empty"><p>まだ参考脚本がありません。</p><p>ハリウッド映画などの脚本PDF（テキストが選択できるもの）を追加してください。</p></div>}
      <div className="sd-cards">
        {refs.map((r) => <article key={r.id} className={`sd-ref-card ${r.analysisStatus}`}>
          <header><label className="sd-check"><input type="checkbox" disabled={r.analysisStatus !== "done"} checked={selected.includes(r.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, r.id] : selected.filter((x) => x !== r.id))} />比較</label><span className={`sd-status ${r.analysisStatus}`}>{{ pending: "待機中", analyzing: "解析中", done: "解析済み", error: "エラー" }[r.analysisStatus]}</span></header>
          <h4>{r.title}</h4>
          <dl><dt>ファイル</dt><dd>{r.file.name}</dd><dt>ページ数</dt><dd>{r.pageCount || "—"}</dd><dt>解析済みシーン</dt><dd>{r.scenes.length}</dd><dt>追加日</dt><dd>{new Date(r.createdAt).toLocaleDateString("ja-JP")}</dd></dl>
          {r.tags.length > 0 && <div className="sd-tags">{r.tags.map((t) => <span key={t}>{t}</span>)}</div>}
          {r.analysisStatus === "analyzing" && <ProgressList r={r} />}
          {r.analysisStatus === "error" && <p className="sd-error small">{r.errorMessage}</p>}
          {r.warnings.length > 0 && r.analysisStatus === "done" && <p className="sd-warn small">{r.warnings[0]}</p>}
          <footer>
            <button className="sd-btn" disabled={r.analysisStatus === "analyzing" || (!r.scenes.length)} onClick={() => { setOpenId(r.id); setTab("overview"); }}>開く</button>
            <button className="sd-btn ghost" disabled={r.analysisStatus === "analyzing"} onClick={() => reanalyze(r)}><RefreshCw size={13} />再解析</button>
            <button className="sd-btn ghost danger" disabled={r.analysisStatus === "analyzing"} onClick={() => remove(r)}><Trash2 size={13} />削除</button>
          </footer>
        </article>)}
      </div>
      {common && <div className="sd-modal" onClick={() => setShowCommon(false)}><div className="sd-modal-box wide" onClick={(e) => e.stopPropagation()}>
        <header><div><small>複数脚本の共通点</small><h3>{doneSelected.map((r) => r.title).join(" / ")}</h3></div><button onClick={() => setShowCommon(false)}><X size={16} /></button></header>
        <div className="sd-modal-body">
          <h4>共通する技法</h4>
          {common.techniques.map((t) => <div key={t.key} className={`sd-common-tech ${t.count === common.total ? "all" : ""}`}><b>{t.name}</b><span>{t.count}/{common.total}作品</span><small>{t.abstract}</small></div>)}
          <h4>観点別の共通原理</h4>
          {common.rows.map((row) => <details key={row.label} className="sd-fold" open={row.common}><summary>{row.label}<em className={row.common ? "yes" : ""}>{row.common ? "共通" : "共通なし"}</em></summary>
            <p className="principle">{row.principle}</p>{row.values.map((v) => <p key={v.title}><b>{v.title}</b>: {v.text}</p>)}</details>)}
          <small className="sd-muted">共通点は可能性を示すもので、この通りに書くべきという意味ではありません。</small>
        </div>
      </div></div>}
      {settings && <div className="sd-modal" onClick={() => setSettings(false)}><div className="sd-modal-box" onClick={(e) => e.stopPropagation()}>
        <header><div><small>翻訳設定</small><h3>AI翻訳（任意）</h3></div><button onClick={() => setSettings(false)}><X size={16} /></button></header>
        <div className="sd-modal-body">
          <p className="sd-muted">未設定の場合は、ブラウザ内蔵の翻訳機能（利用可能な場合）または簡易辞書訳を使用します。APIキーはこのブラウザにのみ保存され、翻訳時にここで指定したエンドポイントへ直接送信されます。</p>
          <label className="sd-label">エンドポイント（OpenAI互換）<input value={llm.endpoint} onChange={(e) => setLlm({ ...llm, endpoint: e.target.value })} /></label>
          <label className="sd-label">モデル<input value={llm.model} onChange={(e) => setLlm({ ...llm, model: e.target.value })} /></label>
          <label className="sd-label">APIキー<input type="password" autoComplete="off" value={llm.apiKey} onChange={(e) => setLlm({ ...llm, apiKey: e.target.value })} /></label>
          <button className="sd-btn primary" onClick={saveLlmSettings}><Check size={14} />保存</button>
        </div>
      </div></div>}
      {modal}
    </div>
  );
}

function ProgressList({ r }: { r: ReferenceScript }) {
  return (
    <ul className="sd-progress"><li className="head">PDF解析中</li>{STAGES.map((s, i) => <li key={s} className={i < r.progress ? "done" : i === r.progress ? "now" : ""}>{i < r.progress ? <Check size={13} /> : i === r.progress ? <Loader2 size={13} className="spin" /> : <Circle size={11} />}{s}{i === r.progress && "中"}</li>)}</ul>
  );
}
