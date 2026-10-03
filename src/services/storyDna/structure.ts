import type { ReferenceScene, StructureAnalysis, StructureMethod, StructurePoint } from "../../types";

export const STRUCTURE_LABELS: Record<StructureMethod, string> = {
  "three-act": "三幕構成", "save-the-cat": "Save the Cat", "eight-sequence": "8シークエンス", kishotenketsu: "起承転結", "jo-ha-kyu": "序破急", "scene-change": "シーン変化ベース", free: "AI自由分析",
};
export const NO_FIT = "この作品では明確に該当しない";

type Scorer = (s: ReferenceScene, prev: ReferenceScene | undefined, i: number) => number;
const rise: Scorer = (s, p) => s.metrics.tension - (p?.metrics.tension ?? s.metrics.tension) + (s.characters.length > (p?.characters.length ?? 0) ? 0.04 : 0) + (p && p.location !== s.location ? 0.03 : 0);
const peak: Scorer = (s) => s.metrics.tension + s.metrics.intensity * 0.3;
const swing: Scorer = (s, p) => Math.abs(s.metrics.advantage - (p?.metrics.advantage ?? 0)) + Math.abs((s.metrics.endAdv ?? 0) - (s.metrics.startAdv ?? 0)) * 0.5 + Math.max(0, s.metrics.tension - (p?.metrics.tension ?? 0)) * 0.5;
const low: Scorer = (s) => -s.metrics.advantage + s.metrics.tension * 0.3;
const quiet: Scorer = (s) => -s.metrics.tension + (s.metrics.kind === "quiet" ? 0.2 : 0);
const talk: Scorer = (s) => s.metrics.dialogueRatio - s.metrics.tension * 0.5;
const intro: Scorer = (s) => s.characters.length * 0.25 + (s.information.startsWith("新") ? 0.2 : 0);
const win: Scorer = (s) => s.metrics.advantage + s.metrics.intensity * 0.3;

interface Spec { name: string; from: number; to: number; scorer: Scorer; min: number; desc: string }

function median(v: number[]) { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; }

export function analyzeStructure(scenes: ReferenceScene[]): Record<StructureMethod, StructureAnalysis> {
  const total = Math.max(1, ...scenes.map((s) => s.endPage));
  const pos = (s: ReferenceScene) => (s.page - 1) / total;
  const pct = (s: ReferenceScene) => Math.round(pos(s) * 100);

  const pickPoint = (spec: Spec): StructurePoint => {
    const idx = scenes.map((s, i) => ({ s, i })).filter(({ s }) => pos(s) >= spec.from && pos(s) <= spec.to);
    if (!idx.length) return { name: spec.name, matched: false, summary: NO_FIT, reason: "該当する位置にシーンがありません。" };
    const scored = idx.map(({ s, i }) => ({ s, v: spec.scorer(s, scenes[i - 1], i) }));
    const best = scored.reduce((m, x) => (x.v > m.v ? x : m));
    const matched = best.v - median(scored.map((x) => x.v)) >= spec.min;
    if (!matched) return { name: spec.name, matched: false, summary: NO_FIT, reason: `${Math.round(spec.from * 100)}〜${Math.round(spec.to * 100)}%付近に、この役割を示す明確な変化（${spec.desc}）が見当たりませんでした。無理に当てはめていません。` };
    return {
      name: spec.name, matched: true, sceneNumber: best.s.sceneNumber, page: best.s.page,
      summary: `${best.s.logline}${best.s.surfaceEvent ? " " + best.s.surfaceEvent : ""}`,
      reason: `全体の約${pct(best.s)}%付近で、${spec.desc}が最も大きく、この役割を担っている可能性があります（緊張度 ${best.s.metrics.tension.toFixed(2)}）。`,
    };
  };
  const fixed = (name: string, s: ReferenceScene, why: string): StructurePoint => ({ name, matched: true, sceneNumber: s.sceneNumber, page: s.page, summary: `${s.logline}${s.surfaceEvent ? " " + s.surfaceEvent : ""}`, reason: why });
  const first = scenes[0], lastS = scenes[scenes.length - 1];
  const fitOf = (pts: StructurePoint[]): StructureAnalysis["fit"] => { const r = pts.filter((p) => p.matched).length / Math.max(1, pts.length); return r >= 0.7 ? "clear" : r >= 0.4 ? "partial" : "none"; };
  const range = (name: string, a: ReferenceScene | undefined, b: ReferenceScene | undefined) => ({ name, fromScene: a?.sceneNumber ?? 0, toScene: b?.sceneNumber ?? 0, fromPage: a?.page ?? 0, toPage: b?.endPage ?? 0 });
  const byPos = (from: number, to: number) => scenes.filter((s) => pos(s) >= from && pos(s) < to);
  const noteFor = (fit: StructureAnalysis["fit"], base: string) => fit === "none" ? `${NO_FIT}。${base}` : fit === "partial" ? `一部のポイントのみ当てはまります。${base}` : base;

  // 三幕
  const threeSpecs: Spec[] = [
    { name: "Setup", from: 0, to: 0.1, scorer: intro, min: 0.05, desc: "人物・状況の提示量" },
    { name: "Inciting Incident", from: 0.06, to: 0.2, scorer: rise, min: 0.1, desc: "緊張度の上昇" },
    { name: "First Plot Point", from: 0.18, to: 0.32, scorer: rise, min: 0.1, desc: "緊張度の上昇と状況の転換" },
    { name: "First Pinch", from: 0.33, to: 0.45, scorer: peak, min: 0.1, desc: "緊張度の高まり" },
    { name: "Midpoint", from: 0.43, to: 0.57, scorer: swing, min: 0.15, desc: "優勢・劣勢の反転や状況の転換" },
    { name: "Second Pinch", from: 0.58, to: 0.7, scorer: peak, min: 0.1, desc: "緊張度の高まり" },
    { name: "All Is Lost", from: 0.68, to: 0.82, scorer: low, min: 0.12, desc: "主人公の劣勢と緊張" },
    { name: "Second Plot Point", from: 0.74, to: 0.88, scorer: rise, min: 0.1, desc: "緊張度の再上昇" },
    { name: "Climax", from: 0.82, to: 0.98, scorer: peak, min: 0, desc: "緊張度と感情強度のピーク" },
  ];
  const threePts: StructurePoint[] = [fixed("Opening Image", first, "脚本の冒頭シーンであり、トーンと世界観を提示する位置です。"), ...threeSpecs.map(pickPoint), fixed("Resolution", lastS, "最終シーンで、結果と余韻を示す位置です。")];
  const fpp = threePts.find((p) => p.name === "First Plot Point"), spp = threePts.find((p) => p.name === "Second Plot Point");
  const c1 = fpp?.matched ? scenes[fpp.sceneNumber! - 1] : byPos(0.25, 1)[0];
  const c2 = spp?.matched ? scenes[spp.sceneNumber! - 1] : byPos(0.75, 1)[0];
  const fit3 = fitOf(threePts);
  const three: StructureAnalysis = {
    method: "three-act", fit: fit3, points: threePts,
    note: noteFor(fit3, "各ポイントは緊張度・優勢劣勢・人物の出入りから推定した候補です。"),
    acts: [range("ACT 1", first, scenes[(c1?.sceneNumber ?? 2) - 2] ?? first), range("ACT 2", c1, scenes[(c2?.sceneNumber ?? scenes.length) - 2] ?? c1), range("ACT 3", c2, lastS)],
  };

  // Save the Cat
  const stcSpecs: Spec[] = [
    { name: "Theme Stated", from: 0.02, to: 0.09, scorer: talk, min: 0.08, desc: "会話中心で緊張が低い場面" },
    { name: "Set-Up", from: 0, to: 0.1, scorer: intro, min: 0.05, desc: "人物・状況の提示量" },
    { name: "Catalyst", from: 0.08, to: 0.17, scorer: rise, min: 0.1, desc: "緊張度の上昇" },
    { name: "Debate", from: 0.12, to: 0.25, scorer: talk, min: 0.08, desc: "会話中心で緊張が下がる場面" },
    { name: "Break into Two", from: 0.19, to: 0.28, scorer: rise, min: 0.1, desc: "緊張度の上昇と状況の転換" },
    { name: "B Story", from: 0.22, to: 0.36, scorer: intro, min: 0.1, desc: "新しい人物の登場" },
    { name: "Fun and Games", from: 0.28, to: 0.45, scorer: win, min: 0.15, desc: "主人公の優勢と感情の高まり" },
    { name: "Midpoint", from: 0.45, to: 0.55, scorer: swing, min: 0.15, desc: "優勢・劣勢の反転" },
    { name: "Bad Guys Close In", from: 0.56, to: 0.72, scorer: peak, min: 0.1, desc: "緊張度の高まり" },
    { name: "All Is Lost", from: 0.70, to: 0.80, scorer: low, min: 0.12, desc: "主人公の劣勢" },
    { name: "Dark Night of the Soul", from: 0.75, to: 0.86, scorer: quiet, min: 0.12, desc: "緊張が下がる静かな場面" },
    { name: "Break into Three", from: 0.80, to: 0.89, scorer: rise, min: 0.1, desc: "緊張度の再上昇" },
    { name: "Finale", from: 0.88, to: 0.99, scorer: peak, min: 0, desc: "緊張度のピーク" },
  ];
  const stcPts = [fixed("Opening Image", first, "冒頭シーンです。"), ...stcSpecs.map(pickPoint), fixed("Final Image", lastS, "最終シーンです。")];
  const fitS = fitOf(stcPts);
  const stc: StructureAnalysis = { method: "save-the-cat", fit: fitS, points: stcPts, note: noteFor(fitS, "15ビートを機械的に割り当てず、変化が見つからないビートは「該当しない」と表示します。"), acts: three.acts };

  // 8シークエンス
  const seqPts: StructurePoint[] = [];
  const seqActs: StructureAnalysis["acts"] = [];
  for (let k = 0; k < 8; k++) {
    const part = byPos(k / 8, (k + 1) / 8);
    seqActs.push(range(`SEQUENCE ${k + 1}`, part[0], part[part.length - 1]));
    if (!part.length) { seqPts.push({ name: `Sequence ${k + 1}`, matched: false, summary: NO_FIT, reason: "該当シーンなし" }); continue; }
    const sc = part.map((s) => ({ s, v: rise(s, scenes[s.sceneNumber - 2], 0) }));
    const best = sc.reduce((m, x) => (x.v > m.v ? x : m));
    const ok = best.v >= 0.12 || k === 7 || k === 0;
    seqPts.push(ok ? { name: `Sequence ${k + 1} の山場`, matched: true, sceneNumber: best.s.sceneNumber, page: best.s.page, summary: best.s.logline, reason: `Scene ${part[0].sceneNumber}〜${part[part.length - 1].sceneNumber}の区間で最も緊張が上がるシーンです。` } : { name: `Sequence ${k + 1}`, matched: false, summary: NO_FIT, reason: "区間内に明確な山場が見つかりませんでした。" });
  }
  const fit8 = fitOf(seqPts);
  const eight: StructureAnalysis = { method: "eight-sequence", fit: fit8, points: seqPts, acts: seqActs, note: noteFor(fit8, "全体をページ数で8等分し、各区間の山場を推定しています。均等な区切りはモデル上の仮定です。") };

  // 起承転結
  const ki = byPos(0, 0.25), sho = byPos(0.25, 0.5), ten = byPos(0.5, 0.78), ketsu = byPos(0.78, 1.01);
  const tenPick = pickPoint({ name: "転", from: 0.45, to: 0.8, scorer: swing, min: 0.2, desc: "視点・価値・状況の大きな転換" });
  const kisPts: StructurePoint[] = [
    { name: "起", matched: ki.length > 0, sceneNumber: ki[0]?.sceneNumber, page: ki[0]?.page, summary: ki[0]?.logline ?? NO_FIT, reason: "冒頭〜25%付近: 人物と状況の提示区間として解釈しました。" },
    { name: "承", matched: sho.length > 0, sceneNumber: sho[0]?.sceneNumber, page: sho[0]?.page, summary: sho[0]?.logline ?? NO_FIT, reason: "25〜50%付近: 状況の展開区間として解釈しました。" },
    tenPick.name === "転" ? tenPick : tenPick,
    { name: "結", matched: ketsu.length > 0, sceneNumber: ketsu[0]?.sceneNumber, page: ketsu[0]?.page, summary: ketsu[0]?.logline ?? NO_FIT, reason: "終盤: 結果と余韻の区間として解釈しました。" },
  ];
  const kisFit: StructureAnalysis["fit"] = tenPick.matched ? "clear" : "none";
  const kisho: StructureAnalysis = {
    method: "kishotenketsu", fit: kisFit, points: kisPts, note: tenPick.matched ? "中盤以降に大きな転換があり、起承転結としても解釈できます。" : `${NO_FIT}。視点や価値を切り替える「転」が見当たらず、因果で進む直線的な構成の可能性があります。`,
    acts: [range("起", ki[0], ki[ki.length - 1]), range("承", sho[0], sho[sho.length - 1]), range("転", ten[0], ten[ten.length - 1]), range("結", ketsu[0], ketsu[ketsu.length - 1])],
  };

  // 序破急
  const jo = byPos(0, 0.15), ha = byPos(0.15, 0.75), kyu = byPos(0.75, 1.01);
  const mean = (a: ReferenceScene[]) => a.reduce((s, x) => s + x.metrics.tension, 0) / Math.max(1, a.length);
  const kyuUp = mean(kyu) >= mean(ha) * 1.08;
  const jhk: StructureAnalysis = {
    method: "jo-ha-kyu", fit: kyuUp ? "clear" : "partial", note: kyuUp ? "終盤の緊張度が中盤より高く、「急」として加速する構造と解釈できます。" : "終盤で明確な加速が見られないため、一部のみ当てはまります。",
    acts: [range("序", jo[0], jo[jo.length - 1]), range("破", ha[0], ha[ha.length - 1]), range("急", kyu[0], kyu[kyu.length - 1])],
    points: [
      { name: "序", matched: true, sceneNumber: jo[0]?.sceneNumber, page: jo[0]?.page, summary: `平均緊張度 ${mean(jo).toFixed(2)}`, reason: "導入区間（約15%）。" },
      { name: "破", matched: true, sceneNumber: ha[0]?.sceneNumber, page: ha[0]?.page, summary: `平均緊張度 ${mean(ha).toFixed(2)}`, reason: "展開区間（15〜75%）。" },
      kyuUp ? { name: "急", matched: true, sceneNumber: kyu[0]?.sceneNumber, page: kyu[0]?.page, summary: `平均緊張度 ${mean(kyu).toFixed(2)}（「破」より上昇）`, reason: "終盤で加速する区間です。" } : { name: "急", matched: false, summary: NO_FIT, reason: `終盤の緊張度（${mean(kyu).toFixed(2)}）が中盤（${mean(ha).toFixed(2)}）を明確に上回っていません。` },
    ],
  };

  // シーン変化ベース
  const change = scenes.map((s, i) => ({ s, v: Math.abs(s.metrics.tension - (scenes[i - 1]?.metrics.tension ?? s.metrics.tension)) + Math.abs(s.metrics.advantage - (scenes[i - 1]?.metrics.advantage ?? 0)) * 0.6 + (s.startState !== s.endState ? 0.15 : 0) }));
  const topN = Math.max(5, Math.min(12, Math.round(scenes.length / 8)));
  const turning = [...change].sort((a, b) => b.v - a.v).slice(0, topN).sort((a, b) => a.s.sceneNumber - b.s.sceneNumber);
  const scChange: StructureAnalysis = {
    method: "scene-change", fit: "clear", note: "テンプレートを使わず、緊張度・優勢劣勢・感情の変化量が大きいシーンを転換点として抽出しました。",
    points: turning.map(({ s, v }, i) => ({ name: `転換点 ${i + 1}`, matched: true, sceneNumber: s.sceneNumber, page: s.page, summary: `${s.logline} (${s.emotionalChange})`, reason: `前のシーンからの変化量 ${v.toFixed(2)}。` })),
    acts: turning.map((t, i) => range(`パート ${i + 1}`, i === 0 ? first : turning[i - 1].s, scenes[t.s.sceneNumber - 2] ?? t.s)).concat([range(`パート ${turning.length + 1}`, turning[turning.length - 1]?.s, lastS)]),
  };

  // AI自由分析
  const smooth = scenes.map((_, i) => mean(scenes.slice(Math.max(0, i - 2), i + 3)));
  const valleys: number[] = [0];
  for (let i = 2; i < scenes.length - 2; i++) if (smooth[i] <= smooth[i - 1] && smooth[i] < smooth[i + 1] && i - valleys[valleys.length - 1] >= Math.max(4, scenes.length / 7)) valleys.push(i);
  const segs = valleys.slice(0, 6).map((v, i) => ({ a: scenes[v], b: scenes[(valleys[i + 1] ?? scenes.length) - 1] }));
  const peaks = [...scenes].sort((a, b) => b.metrics.tension - a.metrics.tension).slice(0, 3).sort((a, b) => a.sceneNumber - b.sceneNumber);
  const free: StructureAnalysis = {
    method: "free", fit: "clear", note: "既存テンプレートを当てはめず、緊張度の谷でパートを区切り、作品固有のリズムを読み取ります。",
    acts: segs.map(({ a, b }, i) => { const seg = scenes.slice(a.sceneNumber - 1, b.sceneNumber); const d = mean(seg.slice(-3)) - mean(seg.slice(0, 3)); return range(`パート ${i + 1}（${d > 0.08 ? "上昇" : d < -0.08 ? "下降" : mean(seg) > 0.45 ? "高原" : "静"}）`, a, b); }),
    points: [...peaks.map((s, i) => fixed(`主要な山 ${i + 1}`, s, `緊張度 ${s.metrics.tension.toFixed(2)}、感情強度 ${s.metrics.intensity.toFixed(2)} で全体の上位です。`)),
      fixed("最も静かな場面", [...scenes].sort((a, b) => a.metrics.tension - b.metrics.tension)[0], "緊張度が最も低く、リズムの緩急をつくる場面です。")],
  };
  return { "three-act": three, "save-the-cat": stc, "eight-sequence": eight, kishotenketsu: kisho, "jo-ha-kyu": jhk, "scene-change": scChange, free };
}
