import { useMemo, useState } from "react";
import { AlertTriangle, Check, Pencil, Sparkles, X } from "lucide-react";
import { nanoid } from "nanoid";
import type { ApplicationSuggestion, ScreenplayProject, ScreenplayScene, ScriptElementType } from "../../types";
import type { OwnAnalysis } from "../../services/storyDna/compare";
import { buildSuggestion, checkSimilarity, evaluate, makeCtx, simClass, simLabel, technique, type ScriptAnalysis } from "../../services/storyDna/techniques";

const LABEL: Record<ScriptElementType, string> = { heading: "見出し", action: "ト書き", character: "人物", dialogue: "セリフ", parenthetical: "ト書き(括弧)", transition: "トランジション" };
const FIELD_LABEL = { purpose: "目的", obstacle: "障害", endState: "終了時の状態", notes: "メモ" } as const;
type Line = { text: string; kind: "same" | "added" | "changed" };

export const insertAt = (s: ApplicationSuggestion, len: number, pos?: number) => Math.min(len, Math.max(0, pos ?? len));

export function diffLines(scene: ScreenplayScene, s: ApplicationSuggestion, pos: number): { before: Line[]; after: Line[] } {
  const fields = Object.keys(s.patch.fieldUpdates) as (keyof typeof FIELD_LABEL)[];
  const fieldLine = (k: keyof typeof FIELD_LABEL, v: string) => `【${FIELD_LABEL[k]}】${v || "（未設定）"}`;
  const before: Line[] = fields.map((k) => ({ text: fieldLine(k, scene[k] as string), kind: "same" }));
  const after: Line[] = fields.map((k) => ({ text: fieldLine(k, s.patch.fieldUpdates[k] as string), kind: "changed" }));
  const body = scene.script.map((e) => ({ text: `${LABEL[e.type]}: ${e.text}`, kind: "same" as const }));
  before.push(...body);
  const ins = s.patch.insert.map((i) => ({ text: `${LABEL[i.type]}: ${i.text}`, kind: "added" as const }));
  after.push(...body.slice(0, pos), ...ins, ...body.slice(pos));
  return { before, after };
}

export function ProposalModal({ suggestion, refAnalysis, own, project, onChange, onClose, onAdopt, onReject, onOpenScene }: {
  suggestion: ApplicationSuggestion; refAnalysis: ScriptAnalysis; own: OwnAnalysis; project: ScreenplayProject;
  onChange: (s: ApplicationSuggestion) => void; onClose: () => void; onAdopt: (s: ApplicationSuggestion, pos: number) => void; onReject: (s: ApplicationSuggestion) => void; onOpenScene: (id: string) => void;
}) {
  const scene = project.scenes.find((x) => x.id === suggestion.targetScene);
  const [editing, setEditing] = useState(false);
  const [pos, setPos] = useState<number>(scene?.script.length ?? 0);
  const def = technique(suggestion.techniqueKey);
  const high = suggestion.similarityScore >= 0.6;
  const done = suggestion.status === "adopted" || suggestion.status === "rejected";
  const diff = useMemo(() => (scene ? diffLines(scene, suggestion, insertAt(suggestion, scene.script.length, pos)) : null), [scene, suggestion, pos]);
  if (!scene || !diff) return null;

  const update = (patch: Partial<ApplicationSuggestion>) => onChange(evaluate({ ...suggestion, ...patch, status: patch.status ?? (suggestion.status === "proposed" ? "edited" : suggestion.status) }, refAnalysis));
  const abstractMore = () => {
    if (!def) return;
    const level = Math.min(3, suggestion.level + 1) as 1 | 2 | 3;
    const next = buildSuggestion(def, makeCtx(refAnalysis, own, scene, project), level, suggestion.referenceId, suggestion.reason);
    onChange(evaluate({ ...next, id: suggestion.id }, refAnalysis));
  };
  const setLevel = (level: 1 | 2 | 3) => {
    if (!def) return;
    onChange(evaluate({ ...buildSuggestion(def, makeCtx(refAnalysis, own, scene, project), level, suggestion.referenceId, suggestion.reason), id: suggestion.id }, refAnalysis));
  };
  const sim = suggestion.similarity;
  const items: [string, number][] = [["設定", sim.setting], ["構造", sim.structure], ["セリフ", sim.dialogue], ["人物関係", sim.relation]];

  return (
    <div className="sd-modal" onClick={onClose}><div className="sd-modal-box wide" onClick={(e) => e.stopPropagation()}>
      <header><div><small>提案 → プレビュー → 採用　（脚本は採用するまで変更されません）</small><h3>{suggestion.referenceTechnique}</h3></div><button onClick={onClose}><X size={16} /></button></header>
      <div className="sd-modal-body">
        <p className="sd-target">適用先: <b>Scene {scene.sceneNumber} · {scene.title}</b>{suggestion.status !== "proposed" && <span className={`sd-pill ${suggestion.status}`}>{{ edited: "編集済み", adopted: "採用済み", rejected: "却下", proposed: "" }[suggestion.status]}</span>}</p>
        <p className="sd-why">{suggestion.reason}</p>
        {editing ? <textarea className="sd-edit" value={suggestion.suggestion} onChange={(e) => update({ suggestion: e.target.value })} rows={3} /> : <p className="sd-suggestion">{suggestion.suggestion}</p>}
        {def && <div className="sd-inline"><small>抽象度</small><div className="sd-seg">{([[1, "具体（参考作品の要素を含む）"], [2, "標準"], [3, "抽象"]] as const).map(([v, l]) => <button key={v} className={suggestion.level === v ? "on" : ""} disabled={done} onClick={() => setLevel(v)}>{l}</button>)}</div></div>}
        <div className="sd-inline"><small>挿入位置</small><select value={insertAt(suggestion, scene.script.length, pos)} disabled={done} onChange={(e) => setPos(Number(e.target.value))}><option value={0}>先頭</option>{scene.script.map((e, i) => <option key={e.id} value={i + 1}>{i + 1}番目（{LABEL[e.type]}）の後</option>)}</select></div>
        {suggestion.status === "adopted" ? <p className="sd-muted">この提案は脚本に反映済みです（元に戻す場合は脚本画面でCmd/Ctrl+Zを使用できます）。</p> : <div className="sd-diff">
          <div><small>Before（現在の脚本）</small>{diff.before.length ? diff.before.map((l, i) => <p key={i} className={l.kind}>{l.text}</p>) : <p className="faint">（本文なし）</p>}</div>
          <div><small>After（修正案）</small>{diff.after.map((l, i) => <p key={i} className={l.kind}>{l.kind === "added" && "＋ "}{l.text}</p>)}</div>
        </div>}
        {editing && <div className="sd-edit-list"><small>挿入するブロックを編集</small>{suggestion.patch.insert.map((b, i) => <div key={i}><span>{LABEL[b.type]}</span><input value={b.text} onChange={(e) => update({ patch: { ...suggestion.patch, insert: suggestion.patch.insert.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) } })} /></div>)}</div>}
        <section className="sd-orig">
          <h4>オリジナリティチェック</h4>
          <div className="sd-sim">{items.map(([l, v]) => <div key={l} className={simClass(v)}><small>{l}</small><b>{simLabel(v)}</b></div>)}</div>
          {high && <div className="sd-warn"><AlertTriangle size={15} /><div><p>参考作品との表現類似度が高くなっています。</p><p>このまま使用するのではなく、さらに抽象化することを推奨します。</p><button className="sd-btn" onClick={abstractMore}><Sparkles size={13} />さらに抽象化する</button></div></div>}
          {!high && suggestion.level < 3 && def && <button className="sd-btn ghost" onClick={abstractMore}><Sparkles size={13} />さらに抽象化する</button>}
          <small className="sd-muted">参考作品の文章・セリフは再利用していません。類似度は設定語・固有名・4語連続一致・抽象度から算出した目安です。</small>
        </section>
      </div>
      <footer className="sd-modal-foot">
        {suggestion.status === "adopted" ? <button className="sd-btn primary" onClick={() => { onOpenScene(scene.id); onClose(); }}>脚本のシーンを開く</button> : <>
          <button className="sd-btn primary" disabled={done} onClick={() => onAdopt(suggestion, insertAt(suggestion, scene.script.length, pos))}><Check size={14} />採用</button>
          <button className={`sd-btn ${editing ? "on" : ""}`} disabled={done} onClick={() => setEditing(!editing)}><Pencil size={13} />{editing ? "編集を終える" : "編集"}</button>
          <button className="sd-btn ghost" disabled={done} onClick={() => onReject(suggestion)}>却下</button>
        </>}
      </footer>
    </div></div>
  );
}

export const applyPatchToProject = (project: ScreenplayProject, s: ApplicationSuggestion, pos: number): ScreenplayProject => ({
  ...project,
  scenes: project.scenes.map((sc) => {
    if (sc.id !== s.targetScene) return sc;
    const ins = s.patch.insert.map((b) => ({ id: nanoid(), type: b.type, text: b.text }));
    return { ...sc, ...s.patch.fieldUpdates, script: [...sc.script.slice(0, pos), ...ins, ...sc.script.slice(pos)] };
  }),
});

export { checkSimilarity };
