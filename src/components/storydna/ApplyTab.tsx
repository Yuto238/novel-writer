import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import type { ApplicationSuggestion } from "../../types";
import { DNA_LABELS, dnaWord } from "../../services/storyDna/analyze";
import { compareScripts } from "../../services/storyDna/compare";
import { buildSuggestion, evaluate, findCandidates, makeCtx, technique, TECHNIQUE_DEFS, toAnalysis, type Candidate } from "../../services/storyDna/techniques";
import { CurveChart, Legend, Radar } from "./charts";
import type { ViewCtx } from "./ReferenceView";

type Sub = "apply" | "compare" | "dna";

export function ApplyTab({ ctx, initialKey, suggestions }: { ctx: ViewCtx; initialKey?: string; suggestions: ApplicationSuggestion[] }) {
  const { script, project, own } = ctx;
  const [sub, setSub] = useState<Sub>("apply");
  const refA = useMemo(() => toAnalysis(script), [script]);
  const ownEmpty = project.scenes.length === 0;
  return (
    <div className="sd-stack-col">
      <div className="sd-flow">{["参考脚本", "何が上手いか", "なぜ上手いか", "どんな原理か", "自分のどのシーンに使えるか", "どう変更できるか"].map((s, i, a) => <span key={s}>{s}{i < a.length - 1 && <ArrowRight size={12} />}</span>)}</div>
      <div className="sd-seg"><button className={sub === "apply" ? "on" : ""} onClick={() => setSub("apply")}>応用できる技法</button><button className={sub === "compare" ? "on" : ""} onClick={() => setSub("compare")}>自作との比較</button><button className={sub === "dna" ? "on" : ""} onClick={() => setSub("dna")}>Script DNA比較</button></div>
      {ownEmpty && <div className="sd-warn"><p>自作にシーンがありません。脚本モードでシーンを作成すると、比較と応用候補が表示されます。</p></div>}
      {sub === "apply" && !ownEmpty && <TechniqueApply ctx={ctx} initialKey={initialKey} suggestions={suggestions} refA={refA} />}
      {sub === "compare" && !ownEmpty && <Compare ctx={ctx} refA={refA} />}
      {sub === "dna" && !ownEmpty && <DnaCompare ctx={ctx} />}
    </div>
  );
}

function TechniqueApply({ ctx, initialKey, suggestions, refA }: { ctx: ViewCtx; initialKey?: string; suggestions: ApplicationSuggestion[]; refA: ReturnType<typeof toAnalysis> }) {
  const { script, project, own, onPropose } = ctx;
  const items = useMemo(() => script.techniques.map((t) => ({ t, def: TECHNIQUE_DEFS.find((d) => d.key === t.key)! })).filter((x) => x.def).map((x) => ({ ...x, cands: findCandidates(x.def, own, project) })), [script.techniques, own, project]);
  const [open, setOpen] = useState(initialKey ?? items.find((i) => i.cands.length)?.t.key ?? "");
  const [applying, setApplying] = useState("");
  useEffect(() => { if (initialKey) setOpen(initialKey); }, [initialKey]);
  const generate = (key: string, c: Candidate) => {
    const def = technique(key)!;
    const scene = project.scenes.find((s) => s.id === c.sceneId);
    if (!scene) return;
    onPropose(evaluate(buildSuggestion(def, makeCtx(refA, own, scene, project), 2, script.id, c.reason), refA));
  };
  if (!items.length) return <p className="empty-state">この作品から応用できる技法を抽出できませんでした。</p>;
  const history = suggestions.filter((s) => s.referenceId === script.id).slice(-6).reverse();
  return (
    <>
      <h3 className="sd-h">あなたの脚本に活かせそうな技法</h3>
      <p className="sd-muted">参考作品に近づけることが目的ではありません。気になる技法だけを選び、提案をプレビューして判断してください。</p>
      {items.map(({ t, def, cands }, i) => <section key={t.key} className={`sd-apply ${open === t.key ? "open" : ""} ${cands.length ? "" : "dim"}`}>
        <button className="sd-apply-head" onClick={() => setOpen(open === t.key ? "" : t.key)}><span>{i + 1}</span><b>{def.applyTitle}</b><small>{cands.length ? `適用候補 ${cands.length}件` : "候補なし"}</small><ChevronDown size={15} /></button>
        {open === t.key && <div className="sd-apply-body">
          <ol className="sd-steps">
            <li><small>① 何が上手いか</small><p>{t.name}<br /><span>{t.original}</span></p></li>
            <li><small>② なぜ上手いか</small><p>{t.why}</p></li>
            <li><small>③ どんな原理か</small><div className="sd-abstract"><div><small>原作要素</small><p>{t.original}</p></div><span>↓</span><div><small>構造的意味</small><p>{t.structural}</p></div><span>↓</span><div className="last"><small>抽象化</small><p>{t.abstract}</p></div></div></li>
            <li><small>④ 自分のどのシーンに使えるか</small>
              <button className="sd-btn primary" onClick={() => setApplying(applying === t.key ? "" : t.key)}>この技法を適用</button>
              {applying === t.key && <div className="sd-cands"><small>適用候補（相性）</small>{cands.length ? cands.map((c) => <div key={c.sceneId} className={`fit-${c.fit}`}><div><b>Scene {c.sceneNumber}</b><em>相性：{c.fit}</em><span>{project.scenes.find((s) => s.id === c.sceneId)?.title}</span><p>{c.reason}</p></div><button className="sd-btn" onClick={() => generate(t.key, c)}>修正案を見る</button></div>) : <p className="sd-muted">自作内に適した候補が見つかりませんでした。</p>}</div>}
            </li>
            <li><small>⑤ どう変更できるか</small><p className="sd-muted">候補を選ぶと、Before / After のプレビューと類似度チェックが表示されます。採用するまで脚本は変更されません。</p></li>
          </ol>
        </div>}
      </section>)}
      {history.length > 0 && <section className="sd-panel"><h3>最近の提案</h3>{history.map((h) => <div key={h.id} className="sd-hist"><span className={`sd-pill ${h.status}`}>{{ proposed: "未判断", edited: "編集済み", adopted: "採用", rejected: "却下" }[h.status]}</span><b>{h.referenceTechnique}</b><small>Scene {project.scenes.find((s) => s.id === h.targetScene)?.sceneNumber ?? "—"}</small><button className="sd-btn ghost" onClick={() => onPropose(h)}>開く</button></div>)}</section>}
    </>
  );
}

function Compare({ ctx, refA }: { ctx: ViewCtx; refA: ReturnType<typeof toAnalysis> }) {
  const { script, project, own } = ctx;
  const [layout, setLayout] = useState<"side" | "stack">("side");
  const cmp = useMemo(() => compareScripts(refA, own, project), [refA, own, project]);
  const bar = (r: number | undefined, o: number | undefined) => { const m = Math.max(r ?? 0, o ?? 0) || 1; return [((r ?? 0) / m) * 100, ((o ?? 0) / m) * 100]; };
  return (
    <>
      <div className="sd-toolbar"><div className="sd-seg"><button className={layout === "side" ? "on" : ""} onClick={() => setLayout("side")}>左右比較</button><button className={layout === "stack" ? "on" : ""} onClick={() => setLayout("stack")}>上下比較</button></div></div>
      <section className="sd-panel"><div className={`sd-cmp ${layout}`}>
        <div className="sd-cmp-head"><span /><b className="ref">参考脚本 · {script.title}</b><b className="own">自分の脚本</b></div>
        {cmp.rows.map((r) => { const [a, b] = bar(r.refNum, r.ownNum); return <div key={r.key} className="sd-cmp-row"><small>{r.label}</small><div className="ref"><p>{r.ref}</p>{r.refNum !== undefined && <i><em style={{ width: `${a}%` }} /></i>}</div><div className="own"><p>{r.own}</p>{r.ownNum !== undefined && <i><em style={{ width: `${b}%` }} /></i>}</div></div>; })}
      </div></section>
      <section className="sd-panel"><h3>感情曲線の比較（横軸: 作品全体の位置 %）</h3>
        <CurveChart xMax={100} xUnit="%" series={[{ name: "参考脚本", color: "#6889a8", points: cmp.refCurve.map((p) => ({ x: p.x * 100, y: p.tension })) }, { name: "自作", color: "#c66a5b", dashed: true, points: cmp.ownCurve.map((p) => ({ x: p.x * 100, y: p.tension })) }]} />
        <Legend items={[{ name: "参考脚本（緊張度）", color: "#6889a8" }, { name: "自作（緊張度）", color: "#c66a5b" }]} />
      </section>
      <section className="sd-panel sd-ai"><h3>AIコメント</h3>{cmp.comments.map((c, i) => <p key={i}>{c.text}</p>)}<small className="sd-muted">違いを可視化するための一案です。どの違いを残すかはあなたが決められます。</small></section>
    </>
  );
}

function DnaCompare({ ctx }: { ctx: ViewCtx }) {
  const { script, own } = ctx;
  const [choice, setChoice] = useState<Record<string, "keep" | "approach" | "">>({});
  const dna = script.scriptDNA;
  if (!dna) return <p className="empty-state">Script DNAがありません。</p>;
  const keys = Object.keys(DNA_LABELS) as (keyof typeof DNA_LABELS)[];
  return (
    <section className="sd-panel">
      <div className="sd-dna"><Radar axes={keys.map((k) => DNA_LABELS[k])} series={[{ name: script.title, color: "#6889a8", values: keys.map((k) => dna[k]) }, { name: "自作", color: "#c66a5b", values: keys.map((k) => own.dna[k]) }]} />
        <div className="sd-dna-table">{keys.map((k) => { const d = own.dna[k] - dna[k]; return <div key={k}><b>{DNA_LABELS[k]}</b><span>参考 {dnaWord(dna[k])}</span><span>自作 {dnaWord(own.dna[k])}</span><em className={Math.abs(d) < 0.15 ? "" : d > 0 ? "up" : "down"}>{Math.abs(d) < 0.15 ? "近い" : d > 0 ? "自作が強い" : "自作が弱い"}</em>
          <select value={choice[k] ?? ""} onChange={(e) => setChoice({ ...choice, [k]: e.target.value as "keep" | "approach" | "" })}><option value="">方針を選ぶ</option><option value="keep">意図的にこのまま</option><option value="approach">参考に寄せてみる</option></select></div>; })}</div>
      </div>
      <Legend items={[{ name: script.title, color: "#6889a8" }, { name: "自作", color: "#c66a5b" }]} />
      <small className="sd-muted">参考作品に近づけることが目的ではありません。差を確認し、意図的に選択するための表示です。</small>
    </section>
  );
}
