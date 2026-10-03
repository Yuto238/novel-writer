import { useMemo, useState } from "react";
import { BookmarkPlus, ChevronRight, Languages, Loader2, X } from "lucide-react";
import type { ApplicationSuggestion, DialoguePattern, ReferenceScene, ReferenceScript, ScreenplayProject, StructureMethod, TranslationMode } from "../../types";
import { DNA_LABELS, dnaWord } from "../../services/storyDna/analyze";
import type { OwnAnalysis } from "../../services/storyDna/compare";
import { STRUCTURE_LABELS, NO_FIT } from "../../services/storyDna/structure";
import { applyDialoguePattern, toAnalysis } from "../../services/storyDna/techniques";
import { formatTranslated, glossTranslate, MODE_LABELS, PROVIDER_LABELS, translateScene, type Provider } from "../../services/storyDna/translate";
import { CurveChart, Legend, Radar, StackBar } from "./charts";

export interface ViewCtx {
  script: ReferenceScript;
  onChange: (r: ReferenceScript) => void;
  project: ScreenplayProject;
  own: OwnAnalysis;
  onPropose: (s: ApplicationSuggestion) => void;
  onGoApply: (techKey?: string) => void;
}

const KIND_LABEL = { action: "アクション", dialogue: "会話", exposition: "説明", conflict: "対立", quiet: "静かなシーン" } as const;
const KIND_COLOR = { action: "#c18453", dialogue: "#6889a8", exposition: "#8c78a6", conflict: "#c66a5b", quiet: "#6d9474" } as const;
const Field = ({ label, value }: { label: string; value: string | number }) => <div className="sd-field"><small>{label}</small><p>{value || "—"}</p></div>;

export function SceneTags({ tags, active, onPick }: { tags: string[]; active?: string; onPick: (t: string) => void }) {
  return <div className="sd-tags">{tags.map((t) => <button key={t} className={active === t ? "on" : ""} onClick={(e) => { e.stopPropagation(); onPick(t); }}>{t}</button>)}</div>;
}

// ---------------- 概要 ----------------
export function OverviewTab({ script, own }: ViewCtx) {
  const o = script.overview;
  const [xMode, setXMode] = useState<"page" | "minute">("page");
  const [showOwn, setShowOwn] = useState(true);
  const kinds = useMemo(() => { const m: Record<string, number> = {}; script.scenes.forEach((s) => { m[s.metrics.kind] = (m[s.metrics.kind] ?? 0) + s.metrics.duration; }); return m; }, [script.scenes]);
  if (!o) return <p className="empty-state">解析が完了すると概要が表示されます。</p>;
  const cum = (() => { let t = 0; return script.scenes.map((s) => { const x = xMode === "page" ? s.page : t; t += s.metrics.duration; return x; }); })();
  const xMax = xMode === "page" ? script.pageCount : Math.round(script.scenes.reduce((s, x) => s + x.metrics.duration, 0));
  const mk = (key: "tension" | "intensity" | "advantage") => script.scenes.map((s, i) => ({ x: cum[i], y: s.metrics[key], label: `Scene ${s.sceneNumber}: ${s.metrics[key].toFixed(2)}` }));
  const dna = script.scriptDNA;
  const keys = Object.keys(DNA_LABELS) as (keyof typeof DNA_LABELS)[];
  return (
    <div className="sd-stack-col">
      <div className="sd-metrics">
        {[["作品タイトル", script.title], ["総ページ数", script.pageCount], ["総シーン数", script.scenes.length], ["登場人物数", script.characters.length], ["想定上映時間", `約${o.runtime}分`], ["ACT数", o.actCount ? `${o.actCount}（三幕構成として解釈）` : "明確に該当しない"], ["主要人物", script.characters.slice(0, 4).map((c) => c.name).join("、")], ["主な舞台", o.mainLocations.join("、")], ["物語ジャンル", o.genre], ["主人公", o.protagonist], ["クライマックス位置", o.climaxPage ? `p.${o.climaxPage}（${Math.round(o.climaxPage / script.pageCount * 100)}%）` : "—"]].map(([l, v]) => <Field key={l as string} label={l as string} value={v as string} />)}
      </div>
      <div className="sd-two">
        <section className="sd-panel"><h3>主人公の目的</h3><p>{o.goal}</p><h3>主人公の障害</h3><p>{o.obstacle}</p><h3>主要な対立</h3><p>{o.conflict}</p></section>
        <section className="sd-panel"><h3>AIによる作品構造の要約</h3><p>{o.summary}</p><small className="sd-muted">ローカルのヒューリスティック解析による推定です。断定ではなく手がかりとしてご利用ください。</small></section>
      </div>
      {script.warnings.length > 0 && <div className="sd-warn">{script.warnings.map((w) => <p key={w}>{w}</p>)}</div>}
      <section className="sd-panel">
        <header className="sd-panel-head"><h3>感情曲線</h3><div className="sd-inline"><select value={xMode} onChange={(e) => setXMode(e.target.value as "page" | "minute")}><option value="page">横軸: ページ</option><option value="minute">横軸: 上映時間（分）</option></select></div></header>
        <CurveChart xMax={xMax} xUnit={xMode === "page" ? "p" : "分"} series={[{ name: "緊張度", color: "#c66a5b", points: mk("tension") }, { name: "感情強度", color: "#d4ad51", points: mk("intensity") }]} />
        <Legend items={[{ name: "緊張度", color: "#c66a5b" }, { name: "感情強度", color: "#d4ad51" }]} />
        <h4>主人公の優勢 / 劣勢</h4>
        <CurveChart xMax={xMax} xUnit={xMode === "page" ? "p" : "分"} yMin={-1} yMax={1} height={150} series={[{ name: "優勢", color: "#6889a8", points: mk("advantage") }]} />
      </section>
      <section className="sd-panel"><h3>シーン密度（リズム）</h3><StackBar parts={(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => ({ label: KIND_LABEL[k], value: kinds[k] ?? 0, color: KIND_COLOR[k] }))} /></section>
      {dna && <section className="sd-panel">
        <header className="sd-panel-head"><h3>Script DNA</h3><label className="sd-check"><input type="checkbox" checked={showOwn} onChange={(e) => setShowOwn(e.target.checked)} />自作と重ねる</label></header>
        <div className="sd-dna">
          <Radar axes={keys.map((k) => DNA_LABELS[k])} series={[{ name: script.title, color: "#6889a8", values: keys.map((k) => dna[k]) }, ...(showOwn && own.scenes.length ? [{ name: "自作", color: "#c66a5b", values: keys.map((k) => own.dna[k]) }] : [])]} />
          <div className="sd-dna-list">{keys.map((k) => <div key={k}><span>{DNA_LABELS[k]}</span><i><em style={{ width: `${dna[k] * 100}%` }} /></i><b>{dnaWord(dna[k])}</b></div>)}</div>
        </div>
        <Legend items={[{ name: script.title, color: "#6889a8" }, ...(showOwn ? [{ name: "自作", color: "#c66a5b" }] : [])]} />
      </section>}
    </div>
  );
}

// ---------------- 翻訳 ----------------
export function TranslationTab({ script, onChange }: ViewCtx) {
  const [view, setView] = useState<"original" | "ja" | "both">("both");
  const [mode, setMode] = useState<TranslationMode>("screenplay");
  const [sel, setSel] = useState(script.scenes[0]?.id ?? "");
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<Provider | "">("");
  const scene = script.scenes.find((s) => s.id === sel) ?? script.scenes[0];
  const jaSource = script.language === "ja";

  const run = async (targets: ReferenceScene[], force: boolean) => {
    setError(""); let cur = script;
    try {
      for (let i = 0; i < targets.length; i++) {
        setBusy(`${i + 1} / ${targets.length}`);
        const t = cur.scenes.find((s) => s.id === targets[i].id)!;
        const res = await translateScene(t, mode, force);
        setProvider(res.provider);
        cur = { ...cur, scenes: cur.scenes.map((s) => (s.id === t.id ? { ...s, elements: res.elements } : s)) };
        onChange(cur);
      }
    } catch (e) { setError((e as Error).message + " 原文は保持されています。"); }
    setBusy("");
  };
  if (!scene) return <p className="empty-state">シーンがありません。</p>;
  return (
    <div className="sd-translate">
      <aside className="sd-scene-list">{script.scenes.map((s) => <button key={s.id} className={s.id === scene.id ? "on" : ""} onClick={() => setSel(s.id)}><b>{s.sceneNumber}</b><span>{s.heading}</span>{s.elements.some((e) => e.ja?.[mode]) && <i title="翻訳済み">●</i>}</button>)}</aside>
      <div className="sd-translate-main">
        <div className="sd-toolbar">
          <div className="sd-seg">{([["original", "原文"], ["ja", "日本語訳"], ["both", "原文＋日本語訳"]] as const).map(([v, l]) => <button key={v} className={view === v ? "on" : ""} onClick={() => setView(v)}>{l}</button>)}</div>
          <select value={mode} onChange={(e) => setMode(e.target.value as TranslationMode)}>{(Object.keys(MODE_LABELS) as TranslationMode[]).map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}</select>
          <button className="sd-btn" disabled={!!busy || jaSource} onClick={() => run([scene], true)}><Languages size={14} />このシーンを翻訳</button>
          <button className="sd-btn ghost" disabled={!!busy || jaSource} onClick={() => run(script.scenes, false)}>全シーンを翻訳</button>
          {busy && <span className="sd-muted"><Loader2 size={13} className="spin" /> 翻訳中 {busy}</span>}
        </div>
        {jaSource && <p className="sd-muted">この脚本は日本語のため翻訳は不要です。</p>}
        {provider && <p className="sd-muted">使用した翻訳: {PROVIDER_LABELS[provider]}{provider === "glossary" && "（辞書ベースの粗訳です。「設定」でAI翻訳のAPIキーを登録すると高品質な翻訳になります）"}</p>}
        {error && <div className="sd-error">{error}</div>}
        <article className="sd-script-page">
          <h3>Scene {scene.sceneNumber} <small>p.{scene.page}</small></h3>
          {scene.elements.map((e) => {
            const ja = formatTranslated(e, mode);
            return <div key={e.id} className={`sd-el sd-el-${e.type}`}>
              {view !== "ja" && <p className="orig">{e.text}</p>}
              {view !== "original" && (ja ? <p className="ja">{ja}</p> : view === "ja" ? <p className="orig faint">{e.text}</p> : <p className="ja faint">（未翻訳）</p>)}
            </div>;
          })}
        </article>
      </div>
    </div>
  );
}

// ---------------- 構成 ----------------
export function StructureTab({ script }: ViewCtx) {
  const [method, setMethod] = useState<StructureMethod>("three-act");
  const [open, setOpen] = useState<string>("");
  const st = script.structure[method];
  if (!st) return <p className="empty-state">構成分析は完了していません。</p>;
  const total = Math.max(1, script.pageCount);
  const colors = ["#6889a8", "#d4ad51", "#c66a5b", "#6d9474", "#8c78a6", "#c18453", "#7a8f9a", "#b86f8f"];
  return (
    <div className="sd-stack-col">
      <div className="sd-toolbar">
        <div className="sd-seg wrap">{(Object.keys(STRUCTURE_LABELS) as StructureMethod[]).map((m) => <button key={m} className={method === m ? "on" : ""} onClick={() => setMethod(m)}>{STRUCTURE_LABELS[m]}</button>)}</div>
      </div>
      <div className={`sd-fit ${st.fit}`}>{st.fit === "none" ? NO_FIT : st.fit === "partial" ? "一部のみ該当" : "該当"}　<span>{st.note}</span></div>
      <div className="sd-acts">{st.acts.map((a, i) => <div key={a.name + i} style={{ flex: Math.max(1, a.toPage - a.fromPage + 1), background: colors[i % colors.length] }} title={`${a.name} p.${a.fromPage}–${a.toPage}`}><b>{a.name}</b><small>Scene {a.fromScene}–{a.toScene} · p.{a.fromPage}–{a.toPage}（{Math.round(Math.max(0, a.toPage - a.fromPage + 1) / total * 100)}%）</small></div>)}</div>
      <section className="sd-panel"><CurveChart xMax={script.pageCount} xUnit="p" height={170} markers={st.points.filter((p) => p.matched && p.page).map((p) => ({ x: p.page!, label: p.name.slice(0, 10) }))} series={[{ name: "緊張度", color: "#c66a5b", points: script.scenes.map((s) => ({ x: s.page, y: s.metrics.tension })) }]} /></section>
      <div className="sd-points">{st.points.map((p) => <details key={p.name} open={open === p.name} onToggle={(e) => (e.currentTarget.open ? setOpen(p.name) : undefined)} className={p.matched ? "" : "unmatched"}>
        <summary><b>{p.name}</b>{p.matched ? <span>Scene {p.sceneNumber} · p.{p.page}</span> : <span>{NO_FIT}</span>}<ChevronRight size={14} /></summary>
        <div><Field label="何が起きるか" value={p.summary} /><Field label="なぜその役割と判断したか" value={p.reason} /></div>
      </details>)}</div>
    </div>
  );
}

// ---------------- シーン ----------------
export function SceneCard({ s, onOpen, onTag, activeTag }: { s: ReferenceScene; onOpen: () => void; onTag: (t: string) => void; activeTag?: string }) {
  return (
    <article className="sd-scene-card" onClick={onOpen}>
      <header><span>REF · SCENE {s.sceneNumber}</span><small>p.{s.page}</small></header>
      <h4>{s.heading}</h4>
      <p className="logline">{s.logline}</p>
      <dl><dt>Purpose</dt><dd>{s.purpose}</dd><dt>Conflict</dt><dd>{s.conflict}</dd><dt>Change</dt><dd>{s.emotionalChange}</dd></dl>
      <footer><small>{s.characters.slice(0, 4).join(" / ") || "—"}</small></footer>
      {s.techniques.length > 0 && <SceneTags tags={s.techniques.slice(0, 4)} active={activeTag} onPick={onTag} />}
    </article>
  );
}

export function ScenesTab({ script, project, onGoApply }: ViewCtx) {
  const [tag, setTag] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<ReferenceScene | null>(null);
  const [ownId, setOwnId] = useState("");
  const allTags = useMemo(() => { const m = new Map<string, number>(); script.scenes.forEach((s) => s.techniques.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1))); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [script.scenes]);
  const list = script.scenes.filter((s) => (!tag || s.techniques.includes(tag)) && (!q || (s.heading + s.logline + s.characters.join(" ")).toLowerCase().includes(q.toLowerCase())));
  const ownScene = project.scenes.find((s) => s.id === ownId);
  return (
    <div className="sd-stack-col">
      <div className="sd-toolbar"><input className="sd-search" placeholder="シーンを検索" value={q} onChange={(e) => setQ(e.target.value)} />{tag && <button className="sd-btn ghost" onClick={() => setTag("")}>タグ「{tag}」を解除 <X size={12} /></button>}</div>
      <div className="sd-tags big">{allTags.map(([t, n]) => <button key={t} className={tag === t ? "on" : ""} onClick={() => setTag(tag === t ? "" : t)}>{t}<em>{n}</em></button>)}</div>
      {tag && <p className="sd-muted">技法「{tag}」が使われているシーン: {list.length}件</p>}
      <div className="sd-scene-grid">{list.map((s) => <SceneCard key={s.id} s={s} activeTag={tag} onOpen={() => setOpen(s)} onTag={(t) => setTag(t)} />)}</div>
      {!list.length && <p className="empty-state">該当するシーンがありません。</p>}
      {open && <div className="sd-modal" onClick={() => setOpen(null)}><div className="sd-modal-box wide" onClick={(e) => e.stopPropagation()}>
        <header><div><small>REF · SCENE {open.sceneNumber} · p.{open.page}–{open.endPage}</small><h3>{open.heading}</h3></div><button onClick={() => setOpen(null)}><X size={16} /></button></header>
        <div className="sd-modal-body">
          <div className="sd-detail-grid">{([["ログライン", open.logline], ["場所", open.location], ["時間帯", open.time], ["登場人物", open.characters.join("、")], ["推定尺", `約${open.metrics.duration}分`], ["表面的な出来事", open.surfaceEvent], ["物語上の役割", `${open.storyRole}: ${open.purpose}`], ["感情上の役割", open.emotionalRole], ["主人公の目的", open.protagonistGoal], ["障害", open.obstacle], ["対立", open.conflict], ["人物関係の変化", open.relationChange], ["情報提示", open.information], ["伏線", open.foreshadow], ["サブテキスト", open.subtext], ["開始状態", open.startState], ["終了状態", open.endState], ["感情変化", open.emotionalChange], ["観客に与える効果", open.audienceEffect]] as [string, string][]).map(([l, v]) => <Field key={l} label={l} value={v} />)}</div>
          <h4>使用されている脚本技法</h4>
          {open.techniques.length ? <SceneTags tags={open.techniques} onPick={(t) => { setTag(t); setOpen(null); }} /> : <p className="sd-muted">検出された技法はありません。</p>}
          <details className="sd-fold"><summary>原文を見る</summary><pre>{open.originalText}</pre></details>
          <details className="sd-fold" open={!!ownId}><summary>自作のSceneと比較</summary>
            <select value={ownId} onChange={(e) => setOwnId(e.target.value)}><option value="">自作のシーンを選択</option>{project.scenes.map((s) => <option key={s.id} value={s.id}>Scene {s.sceneNumber} · {s.title}</option>)}</select>
            {ownScene && <div className="sd-compare-cols">
              <div className="ref"><small>参考脚本</small>{[["目的", open.purpose], ["障害", open.obstacle], ["開始 → 終了", open.emotionalChange], ["尺", `${open.metrics.duration}分`]].map(([l, v]) => <Field key={l} label={l} value={v} />)}</div>
              <div className="own"><small>自作</small>{[["目的", ownScene.purpose], ["障害", ownScene.obstacle], ["開始 → 終了", `${ownScene.startState || "—"} → ${ownScene.endState || "—"}`], ["尺", `${ownScene.estimatedDuration}分`]].map(([l, v]) => <Field key={l} label={l} value={v} />)}</div>
            </div>}
          </details>
          <button className="sd-btn" onClick={() => { setOpen(null); onGoApply(); }}>この作品の技法を自作へ応用する</button>
        </div>
      </div></div>}
    </div>
  );
}

// ---------------- セリフ ----------------
export function DialogueTab({ script, project, onChange, onPropose }: ViewCtx) {
  const [scene, setScene] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [use, setUse] = useState<DialoguePattern | null>(null);
  const [aId, setAId] = useState(""), [bId, setBId] = useState(""), [sceneId, setSceneId] = useState("");
  const speakers = [...new Set(script.dialogues.map((d) => d.speaker))];
  const rows = script.dialogues.filter((d) => (!scene || d.sceneNumber === Number(scene)) && (!speaker || d.speaker === speaker)).slice(0, 80);
  const elOf = (d: (typeof rows)[number]) => script.scenes[d.sceneNumber - 1]?.elements.find((e) => e.id === d.elementId);
  const toggleSave = (id: string) => onChange({ ...script, dialoguePatterns: script.dialoguePatterns.map((p) => (p.id === id ? { ...p, saved: !p.saved } : p)) });
  const nameOf = (id: string) => project.characters.find((c) => c.id === id)?.name ?? "";
  const go = () => {
    const target = project.scenes.find((s) => s.id === sceneId);
    if (!use || !target || !nameOf(aId) || !nameOf(bId)) return;
    onPropose(applyDialoguePattern(use, nameOf(aId), nameOf(bId), target, script.id, script.title));
    setUse(null);
  };
  return (
    <div className="sd-stack-col">
      <section className="sd-panel"><h3>この脚本の会話傾向</h3><div className="sd-tendency">{script.dialogueTendencies.map((t) => <div key={t.label}><b>・{t.label}</b><i><em style={{ width: `${t.strength * 100}%` }} /></i><small>{t.evidence}</small></div>)}</div></section>
      <section className="sd-panel"><header className="sd-panel-head"><h3>会話テンプレート（会話構造）</h3><small className="sd-muted">セリフではなく「会話の力学」だけを抽出しています</small></header>
        {script.dialoguePatterns.length === 0 && <p className="sd-muted">抽出できる会話構造が見つかりませんでした。</p>}
        <div className="sd-pattern-grid">{script.dialoguePatterns.map((p) => <article key={p.id} className="sd-pattern">
          <header><b>Scene {p.sourceScene}</b><small>{p.characters.join(" × ")}</small></header>
          <ol>{p.structure.map((m, i) => <li key={i}><span className={m.speaker}>{m.speaker}</span>{m.move}</li>)}</ol>
          <p className="sub">サブテキスト: {p.subtextPattern}</p>
          <footer><button className={`sd-btn ghost ${p.saved ? "on" : ""}`} onClick={() => toggleSave(p.id)}><BookmarkPlus size={13} />{p.saved ? "保存済み" : "テンプレートとして保存"}</button><button className="sd-btn" onClick={() => { setUse(p); setAId(project.characters[0]?.id ?? ""); setBId(project.characters[1]?.id ?? ""); setSceneId(project.scenes[0]?.id ?? ""); }}>自作で使う</button></footer>
        </article>)}</div>
      </section>
      <section className="sd-panel"><header className="sd-panel-head"><h3>セリフ分析</h3><div className="sd-inline">
        <select value={scene} onChange={(e) => setScene(e.target.value)}><option value="">全シーン</option>{[...new Set(script.dialogues.map((d) => d.sceneNumber))].map((n) => <option key={n} value={n}>Scene {n}</option>)}</select>
        <select value={speaker} onChange={(e) => setSpeaker(e.target.value)}><option value="">全話者</option>{speakers.map((s) => <option key={s}>{s}</option>)}</select></div></header>
        <p className="sd-muted">重要度の高いセリフを最大400件まで抽出して分析しています。</p>
        <div className="sd-dialogues">{rows.map((d) => { const el = elOf(d); const ja = el?.ja?.natural ?? el?.ja?.screenplay ?? el?.ja?.literal ?? (script.language === "ja" ? d.original : glossTranslate(d.original));
          return <details key={d.id}><summary><b>{d.speaker}</b><i>→ {d.addressee || "—"}</i><span>{d.original}</span><small>Scene {d.sceneNumber}</small></summary>
            <div className="sd-detail-grid"><Field label="原文" value={d.original} /><Field label={`日本語訳${el?.ja ? "" : "（簡易）"}`} value={ja} /><Field label="表面的な意味" value={d.surface} /><Field label="本音" value={d.hidden} /><Field label="隠している情報" value={d.hiddenInfo} /><Field label="相手に与えたい印象" value={d.impression} /><Field label="感情" value={d.emotion} /><Field label="目的" value={d.goal} /><Field label="サブテキスト" value={d.subtext} /><Field label="シーン内での役割" value={d.role} /></div></details>; })}
          {!rows.length && <p className="empty-state">セリフが見つかりません。</p>}</div>
      </section>
      {use && <div className="sd-modal" onClick={() => setUse(null)}><div className="sd-modal-box" onClick={(e) => e.stopPropagation()}>
        <header><div><small>会話テンプレートを自作で使う</small><h3>適用先を選択</h3></div><button onClick={() => setUse(null)}><X size={16} /></button></header>
        <div className="sd-modal-body">
          <p className="sd-muted">参考作品のセリフは再利用せず、会話の力学だけで新しい会話案を作ります。</p>
          {project.characters.length < 2 || project.scenes.length === 0 ? <p className="sd-error">自作に登場人物（2人以上）とシーンを登録すると使用できます。</p> : <>
            <label className="sd-label">適用人物 A（{use.structure[0]?.move}から始める側）<select value={aId} onChange={(e) => setAId(e.target.value)}>{project.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="sd-label">適用人物 B<select value={bId} onChange={(e) => setBId(e.target.value)}>{project.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="sd-label">適用シーン<select value={sceneId} onChange={(e) => setSceneId(e.target.value)}>{project.scenes.map((s) => <option key={s.id} value={s.id}>Scene {s.sceneNumber} · {s.title}</option>)}</select></label>
            <button className="sd-btn primary" disabled={aId === bId} onClick={go}>会話案を生成してプレビュー</button>{aId === bId && <small className="sd-error">AとBは別の人物を選んでください。</small>}
          </>}
        </div>
      </div></div>}
    </div>
  );
}

// ---------------- 人物 ----------------
export function CharactersTab({ script }: ViewCtx) {
  const [name, setName] = useState(script.characters[0]?.name ?? "");
  const c = script.characters.find((x) => x.name === name) ?? script.characters[0];
  if (!c) return <p className="empty-state">登場人物を検出できませんでした。</p>;
  const rels = script.relationships.filter((r) => r.a === c.name || r.b === c.name);
  return (
    <div className="sd-chars">
      <aside className="sd-scene-list">{script.characters.map((x) => <button key={x.name} className={x.name === c.name ? "on" : ""} onClick={() => setName(x.name)}><b>{x.name.slice(0, 1)}</b><span>{x.name}<small>{x.role} · {x.lineCount}セリフ</small></span></button>)}</aside>
      <div className="sd-stack-col">
        <section className="sd-panel"><h3>{c.name} <small className="sd-pill">{c.role}</small></h3>
          <div className="sd-detail-grid">{([["役割", c.role], ["総セリフ数", c.lineCount], ["総登場時間", `約${c.screenTime.toFixed(1)}分`], ["登場シーン数", c.sceneNumbers.length], ["登場ページ", c.pages.slice(0, 12).map((p) => `p.${p}`).join(", ") + (c.pages.length > 12 ? " …" : "")], ["目的", c.goal], ["欲望", c.desire], ["弱点", c.weakness], ["恐怖", c.fear], ["主要な対立相手", c.opponent], ["人物変化", c.change], ["物語上の機能", c.function]] as [string, string | number][]).map(([l, v]) => <Field key={l} label={l} value={v} />)}</div>
          <details className="sd-fold"><summary>登場シーン</summary><div className="sd-chiprow">{c.sceneNumbers.map((n) => <span key={n}>Scene {n}</span>)}</div></details>
        </section>
        <section className="sd-panel"><h3>キャラクターアーク</h3>
          <div className="sd-arc">{c.arc.map((a, i) => <div key={a.sceneNumber}><b>Scene {a.sceneNumber}</b><span className={a.value > 0.1 ? "pos" : a.value < -0.1 ? "neg" : ""}>{a.emotion}</span>{i < c.arc.length - 1 && <i>↓</i>}</div>)}</div>
          <CurveChart xMax={Math.max(...c.arc.map((a) => a.sceneNumber), 1)} xUnit="" yMin={-1} yMax={1} height={130} series={[{ name: "感情の方向", color: "#6889a8", points: c.arc.map((a) => ({ x: a.sceneNumber, y: a.value, label: `Scene ${a.sceneNumber}: ${a.emotion}` })) }]} />
        </section>
        <section className="sd-panel"><h3>人物関係</h3>{rels.length === 0 && <p className="sd-muted">十分な共演シーンがありません。</p>}
          {rels.map((r) => <div key={r.a + r.b} className="sd-rel"><div className="sd-rel-head"><b>{r.a}</b><span>↓ {r.aToB}</span><b>{r.b}</b><span>↓ {r.bToA}</span></div>
            <p className="sd-muted">{r.a} → {r.b}: {r.aToB} ／ {r.b} → {r.a}: {r.bToA}</p>
            <div className="sd-rel-line">{r.timeline.map((t) => <div key={t.sceneNumber} className={`s${t.score > 0.15 ? "near" : t.score > -0.15 ? "far" : "fight"}`}><small>Scene {t.sceneNumber}</small><b>{t.label}</b></div>)}</div></div>)}
        </section>
      </div>
    </div>
  );
}

// ---------------- 技法 ----------------
export function TechniquesTab({ script, onGoApply }: ViewCtx) {
  const [open, setOpen] = useState(script.techniques[0]?.id ?? "");
  const an = toAnalysis(script);
  void an;
  if (!script.techniques.length) return <p className="empty-state">明確な技法を抽出できませんでした。</p>;
  return (
    <div className="sd-stack-col">
      <h3 className="sd-h">この作品から学べる技法</h3>
      {script.techniques.map((t, i) => <details key={t.id} className="sd-tech" open={open === t.id} onToggle={(e) => (e.currentTarget.open ? setOpen(t.id) : undefined)}>
        <summary><span>{i + 1}</span><b>{t.name}</b><small>確度 {Math.round(t.strength * 100)}%</small><ChevronRight size={14} /></summary>
        <div className="sd-tech-body">
          <div className="sd-detail-grid"><Field label="説明" value={t.description} /><Field label="使用シーン" value={t.sourceScenes.map((n) => `Scene ${n}`).join("、")} /><Field label="なぜ機能するか" value={t.why} /><Field label="応用できるジャンル" value={t.applicableGenres.join("、")} /></div>
          <div className="sd-abstract">
            <div><small>原作要素</small><p>{t.original}</p></div><span>↓</span>
            <div><small>構造的意味</small><p>{t.structural}</p></div><span>↓</span>
            <div className="last"><small>抽象化された技法</small><p>{t.abstract}</p></div>
          </div>
          <button className="sd-btn primary" onClick={() => onGoApply(t.key)}>自作への応用を見る</button>
        </div>
      </details>)}
    </div>
  );
}
