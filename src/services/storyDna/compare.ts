import { nanoid } from "nanoid";
import type { RefElement, ReferenceScene, ScreenplayProject, ScriptDNA } from "../../types";
import { analyzeCharacters, analyzeDialogue, buildOverview, buildScenes, computeDNA } from "./analyze";
import { analyzeStructure } from "./structure";
import { TECH_TAGS } from "./lexicon";
import type { ParsedScene } from "./pdf";
import type { ScriptAnalysis } from "./techniques";

export interface OwnAnalysis extends ScriptAnalysis {
  dna: ScriptDNA;
  protagonist: string;
  totalPages: number;
  thin: boolean;
}

// 自作脚本（カード＋脚本本文）を、参考脚本と同じ形式に変換して解析する
export function analyzeOwn(project: ScreenplayProject, title: string): OwnAnalysis {
  const name = (id: string) => project.characters.find((c) => c.id === id)?.name ?? "";
  let cum = 0;
  let dialogueCount = 0;
  const parsed: ParsedScene[] = project.scenes.map((sc) => {
    const pages = Math.max(0.25, Number(sc.pages) || Number(sc.estimatedDuration) || 1);
    const page = Math.floor(cum) + 1;
    cum += pages;
    const els: RefElement[] = [{ id: nanoid(), type: "heading", text: `${sc.title}${sc.location ? ` - ${sc.location}` : ""}`, page }];
    let speaker = "";
    if (sc.script.length) {
      for (const it of sc.script) {
        if (it.type === "character") speaker = it.text.trim().toUpperCase();
        if (it.type === "dialogue") dialogueCount++;
        els.push({ id: it.id, type: it.type === "heading" ? "action" : it.type, text: it.text, page, speaker: it.type === "dialogue" || it.type === "parenthetical" ? speaker : it.type === "character" ? speaker : undefined });
      }
    } else {
      for (const t of [sc.logline, sc.purpose, sc.obstacle, [sc.startState, sc.endState].filter(Boolean).join(" → ")]) if (t) els.push({ id: nanoid(), type: "action", text: t, page });
    }
    return { heading: els[0].text, page, endPage: Math.max(page, Math.ceil(cum)), elements: els, pages, cast: sc.characters.map(name).filter(Boolean) };
  });
  const totalPages = Math.max(1, Math.ceil(cum));
  const thin = dialogueCount < 5;
  if (!parsed.length) {
    return { title, pageCount: 1, scenes: [], characters: [], structure: {}, dialogues: [], dialogueTendencies: [], dna: { desire: 0, conflict: 0, explanation: 0, subtext: 0, pace: 0, foreshadow: 0, emotionChange: 0, humor: 0 }, protagonist: "", totalPages: 1, thin: true };
  }
  const { scenes, protagonist } = buildScenes(parsed, { lang: "ja", pageCount: totalPages, fixedDuration: true });
  scenes.forEach((s, i) => {
    const card = project.scenes[i];
    s.id = card.id;
    s.sceneNumber = card.sceneNumber;
    s.heading = card.title;
    if (card.obstacle) { s.metrics.tension = Math.min(1, s.metrics.tension + 0.15); s.obstacle = card.obstacle; }
    if (card.purpose) s.purpose = card.purpose;
    if (card.logline) s.logline = card.logline;
    const user = card.tags.filter((t) => (TECH_TAGS as readonly string[]).includes(t));
    s.techniques = [...new Set([...s.techniques, ...user])];
  });
  project.foreshadowing.forEach((f) => {
    const add = (id: string, tag: string) => { const s = scenes.find((x) => x.id === id); if (s && !s.techniques.includes(tag)) s.techniques.push(tag); };
    if (f.firstScene) { add(f.firstScene, "セットアップ"); add(f.firstScene, "伏線"); }
    if (f.payoffScene) add(f.payoffScene, "ペイオフ");
    f.returnScenes.forEach((id) => add(id, "コールバック"));
  });
  const { characters } = analyzeCharacters(scenes, "ja");
  const d = analyzeDialogue(scenes, "ja", totalPages);
  const structure = analyzeStructure(scenes);
  const dna = computeDNA(scenes, characters, d.tendencies, totalPages);
  return { title, pageCount: totalPages, scenes, characters, structure, dialogues: d.dialogues, dialogueTendencies: d.tendencies, dna, protagonist, totalPages, thin };
}

export interface CompareRow { key: string; label: string; ref: string; own: string; refNum?: number; ownNum?: number }
export interface Comparison { rows: CompareRow[]; comments: { text: string; sceneNumber?: number }[]; refCurve: CurvePoint[]; ownCurve: CurvePoint[] }
export interface CurvePoint { x: number; tension: number; intensity: number; advantage: number }

const dlgCount = (a: ScriptAnalysis) => a.scenes.reduce((s, x) => s + x.elements.filter((e) => e.type === "dialogue").length, 0);
const goalScene = (a: ScriptAnalysis, project?: ScreenplayProject) => a.scenes.find((s) => s.protagonistGoal.startsWith("原文")) ?? (project ? a.scenes.find((s) => project.scenes.find((c) => c.id === s.id)?.purpose) : undefined);
const point = (a: ScriptAnalysis, name: string) => { const p = a.structure["three-act"]?.points.find((x) => x.name === name); return p?.matched ? p.page : undefined; };
export const curve = (a: ScriptAnalysis): CurvePoint[] => { const total = Math.max(1, ...a.scenes.map((s) => s.endPage)); return a.scenes.map((s) => ({ x: (s.page - 1) / total, tension: s.metrics.tension, intensity: s.metrics.intensity, advantage: s.metrics.advantage })); };
const delta = (a: ScriptAnalysis) => a.scenes.slice(1).reduce((s, x, i) => s + Math.abs(x.metrics.tension - a.scenes[i].metrics.tension), 0) / Math.max(1, a.scenes.length - 1);
const actRatio = (a: ScriptAnalysis) => { const acts = a.structure["three-act"]?.acts ?? []; const t = acts.reduce((s, x) => s + Math.max(0, x.toPage - x.fromPage + 1), 0) || 1; return acts.map((x) => Math.round(Math.max(0, x.toPage - x.fromPage + 1) / t * 100)); };

export function compareScripts(ref: ScriptAnalysis, own: OwnAnalysis, project: ScreenplayProject): Comparison {
  const total = (a: ScriptAnalysis) => Math.max(1, a.pageCount);
  const posStr = (page: number | undefined, a: ScriptAnalysis) => (page ? `p.${page}（${Math.round(page / total(a) * 100)}%）` : "該当なし");
  const rg = goalScene(ref), og = goalScene(own, project);
  const protShare = (a: ScriptAnalysis) => { const p = a.characters.find((c) => c.role === "主人公"); return p ? Math.round(a.scenes.filter((s) => s.characters.includes(p.name)).length / Math.max(1, a.scenes.length) * 100) : 0; };
  const rows: CompareRow[] = [
    { key: "pages", label: "ページ数", ref: `${ref.pageCount}`, own: `${own.totalPages}`, refNum: ref.pageCount, ownNum: own.totalPages },
    { key: "scenes", label: "シーン数", ref: `${ref.scenes.length}`, own: `${own.scenes.length}`, refNum: ref.scenes.length, ownNum: own.scenes.length },
    { key: "act", label: "ACT比率 (1/2/3)", ref: actRatio(ref).join(" / ") + " %", own: actRatio(own).join(" / ") + " %" },
    { key: "goal", label: "主人公の目的提示位置", ref: rg ? `${posStr(rg.page, ref)} Scene ${rg.sceneNumber}` : "検出できず", own: og ? `${posStr(og.page, own)} Scene ${og.sceneNumber}` : "未設定", refNum: rg ? rg.page / total(ref) : undefined, ownNum: og ? og.page / total(own) : undefined },
    { key: "inciting", label: "Inciting Incident位置", ref: posStr(point(ref, "Inciting Incident"), ref), own: posStr(point(own, "Inciting Incident"), own), refNum: point(ref, "Inciting Incident") ? point(ref, "Inciting Incident")! / total(ref) : undefined, ownNum: point(own, "Inciting Incident") ? point(own, "Inciting Incident")! / total(own) : undefined },
    { key: "midpoint", label: "Midpoint位置", ref: posStr(point(ref, "Midpoint"), ref), own: posStr(point(own, "Midpoint"), own), refNum: point(ref, "Midpoint") ? point(ref, "Midpoint")! / total(ref) : undefined, ownNum: point(own, "Midpoint") ? point(own, "Midpoint")! / total(own) : undefined },
    { key: "climax", label: "Climax位置", ref: posStr(point(ref, "Climax"), ref), own: posStr(point(own, "Climax"), own), refNum: point(ref, "Climax") ? point(ref, "Climax")! / total(ref) : undefined, ownNum: point(own, "Climax") ? point(own, "Climax")! / total(own) : undefined },
    { key: "protagonist", label: "主人公の登場頻度", ref: `${protShare(ref)}% のシーン`, own: `${protShare(own)}% のシーン`, refNum: protShare(ref), ownNum: protShare(own) },
    { key: "dialogue", label: "セリフ量（1ページあたり）", ref: `${(dlgCount(ref) / total(ref)).toFixed(1)} 件`, own: `${(dlgCount(own) / total(own)).toFixed(1)} 件`, refNum: dlgCount(ref) / total(ref), ownNum: dlgCount(own) / total(own) },
    { key: "avg", label: "シーン平均尺（ページ）", ref: (ref.pageCount / Math.max(1, ref.scenes.length)).toFixed(1), own: (own.totalPages / Math.max(1, own.scenes.length)).toFixed(1), refNum: ref.pageCount / Math.max(1, ref.scenes.length), ownNum: own.totalPages / Math.max(1, own.scenes.length) },
    { key: "curve", label: "平均緊張度", ref: (ref.scenes.reduce((s, x) => s + x.metrics.tension, 0) / Math.max(1, ref.scenes.length)).toFixed(2), own: (own.scenes.reduce((s, x) => s + x.metrics.tension, 0) / Math.max(1, own.scenes.length)).toFixed(2) },
    { key: "fore", label: "伏線（セットアップ数）", ref: `${ref.scenes.filter((s) => s.techniques.includes("セットアップ")).length}`, own: `${project.foreshadowing.length}`, refNum: ref.scenes.filter((s) => s.techniques.includes("セットアップ")).length, ownNum: project.foreshadowing.length },
    { key: "change", label: "シーン変化量（緊張度の平均変化）", ref: delta(ref).toFixed(2), own: delta(own).toFixed(2), refNum: delta(ref), ownNum: delta(own) },
  ];

  const comments: Comparison["comments"] = [];
  const row = (k: string) => rows.find((r) => r.key === k)!;
  const g = row("goal");
  const earlyScene = own.scenes.find((s) => s.characters.length) ?? own.scenes[0];
  if (g.refNum !== undefined && (g.ownNum === undefined || g.ownNum > g.refNum * 1.4 + 0.05)) {
    comments.push({ sceneNumber: earlyScene?.sceneNumber, text: `あなたの脚本では、主人公の目的が明確になるまで時間がかかっている可能性があります。Scene ${earlyScene?.sceneNumber ?? 3}付近で、主人公の欲望が分かる行動を加えると、物語の方向性が早く伝わるかもしれません。` });
  }
  const m = row("midpoint");
  if (m.refNum !== undefined && m.ownNum === undefined) comments.push({ text: "自作の脚本では、中盤に優勢・劣勢が大きく入れ替わる場面が検出されませんでした。中盤に状況を反転させる出来事を置く案も考えられます。" });
  const c = row("climax");
  if (c.refNum !== undefined && c.ownNum !== undefined && Math.abs(c.refNum - c.ownNum) > 0.12) comments.push({ text: `クライマックスの位置が参考脚本（${Math.round(c.refNum * 100)}%）と自作（${Math.round(c.ownNum * 100)}%）で異なります。意図した配置であれば問題ありません。終盤の長さを調整する場合の一案として検討できます。` });
  const d = row("dialogue");
  if (d.refNum && d.ownNum !== undefined && !own.thin && (d.ownNum > d.refNum * 1.4 || d.ownNum < d.refNum * 0.6)) comments.push({ text: d.ownNum > d.refNum ? "自作はセリフ量が多めです。感情の説明をセリフから行動・間へ置き換える方向も考えられます。" : "自作はセリフ量が少なめです。会話で関係を動かす場面を足す余地があるかもしれません。" });
  const ch = row("change");
  if (ch.refNum && ch.ownNum !== undefined && ch.ownNum < ch.refNum * 0.6) comments.push({ text: "自作はシーン間の緊張度の変化が小さい傾向があります。対立の強度を段階的に上げる、または静と動の対比をつける案が考えられます。" });
  const f = row("fore");
  if (f.refNum && f.ownNum !== undefined && f.ownNum < f.refNum * 0.5) comments.push({ text: "伏線（セットアップとペイオフ）が参考脚本より少ない可能性があります。小さな要素を序盤に置いて終盤で意味を変える手法を試せます。" });
  if (own.thin) comments.unshift({ text: "自作の脚本本文（セリフ）がまだ少ないため、比較は参考値です。カードの目的・障害や脚本本文を書き進めると精度が上がります。" });
  if (!comments.length) comments.push({ text: "大きな差は検出されませんでした。違いを意図的に選ぶための参考としてご覧ください。参考作品に近づけること自体は目的ではありません。" });
  return { rows, comments, refCurve: curve(ref), ownCurve: curve(own) };
}

export function sceneBrief(s: ReferenceScene) {
  return `Scene ${s.sceneNumber} · ${s.heading}`;
}
