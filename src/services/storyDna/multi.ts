import type { ReferenceScript } from "../../types";

export interface CommonRow { label: string; values: { title: string; text: string }[]; principle: string; common: boolean }

const pct = (n: number, total: number) => Math.round((n / Math.max(1, total)) * 100);

export function commonAnalysis(list: ReferenceScript[]) {
  const total = list.length;
  const techMap = new Map<string, { name: string; key: string; count: number; why: string; abstract: string }>();
  list.forEach((s) => s.techniques.forEach((t) => { const e = techMap.get(t.key) ?? { name: t.name, key: t.key, count: 0, why: t.why, abstract: t.abstract }; e.count++; techMap.set(t.key, e); }));
  const techniques = [...techMap.values()].sort((a, b) => b.count - a.count);

  const pt = (s: ReferenceScript, name: string) => { const p = s.structure["three-act"]?.points.find((x) => x.name === name); return p?.matched && p.page ? pct(p.page, s.pageCount) : undefined; };
  const goalPct = (s: ReferenceScript) => { const g = s.scenes.find((x) => x.protagonistGoal.startsWith("原文")); return g ? pct(g.page, s.pageCount) : undefined; };
  const rows: CommonRow[] = [];
  const add = (label: string, per: (s: ReferenceScript) => string, check: (s: ReferenceScript) => boolean, yes: string, no: string) => {
    const common = list.every(check);
    rows.push({ label, values: list.map((s) => ({ title: s.title, text: per(s) })), principle: common ? yes : no, common });
  };
  add("導入", (s) => (goalPct(s) !== undefined ? `目的の提示 ${goalPct(s)}%付近` : "目的の提示を検出できず"), (s) => (goalPct(s) ?? 100) <= 25, "全作品で、主人公の目的が序盤（25%以内）に提示されています。", "導入の目的提示位置は作品ごとに異なり、共通原理は見られません。");
  add("主人公", (s) => { const p = s.characters.find((c) => c.role === "主人公"); return p ? `${p.name}（${pct(p.sceneNumbers.length, s.scenes.length)}%のシーンに登場）` : "特定できず"; }, (s) => { const p = s.characters.find((c) => c.role === "主人公"); return !!p && p.sceneNumbers.length / Math.max(1, s.scenes.length) >= 0.5; }, "主人公が物語の過半のシーンに登場し、視点が一貫しています。", "主人公の比重は作品により異なります。");
  add("対立", (s) => s.overview?.conflict ?? "—", (s) => s.characters.some((c) => c.role === "対立者"), "全作品に、主人公と継続的に衝突する対立者が置かれています。", "対立の置き方は作品ごとに異なります。");
  add("会話", (s) => s.dialogueTendencies.filter((t) => t.strength >= 0.5).map((t) => t.label).slice(0, 3).join("、") || "顕著な傾向なし", (s) => s.dialogueTendencies.some((t) => t.label.startsWith("感情を直接") && t.strength >= 0.4), "全作品で、感情を直接セリフで説明せず、間接的に伝える傾向があります。", "会話傾向に共通点は多くありません。");
  add("Midpoint", (s) => (pt(s, "Midpoint") !== undefined ? `${pt(s, "Midpoint")}%付近で転換` : "明確に該当しない"), (s) => pt(s, "Midpoint") !== undefined, "全作品の中盤に、状況や優劣が入れ替わる転換点があります。", "中盤の転換点は一部の作品でのみ見られます。");
  add("Climax", (s) => (pt(s, "Climax") !== undefined ? `${pt(s, "Climax")}%付近` : "—"), (s) => (pt(s, "Climax") ?? 0) >= 80, "全作品で、クライマックスが終盤（80%以降）に置かれています。", "クライマックスの位置は作品により異なります。");
  add("人物関係", (s) => s.relationships[0] ? `${s.relationships[0].a}→${s.relationships[0].b}: ${s.relationships[0].aToB}／逆: ${s.relationships[0].bToA}` : "—", (s) => !!s.relationships[0] && s.relationships[0].aToB !== s.relationships[0].bToA, "主要な二人の関係は、互いに非対称（片方が主導・片方が従う／反発する）に描かれています。", "主要な人物関係の型に共通点は見られません。");
  add("感情曲線", (s) => { const peak = s.scenes.reduce((m, x) => (x.metrics.tension > m.metrics.tension ? x : m), s.scenes[0]); return peak ? `最大の山 ${pct(peak.page, s.pageCount)}%付近` : "—"; }, (s) => { const peak = s.scenes.reduce((m, x) => (x.metrics.tension > m.metrics.tension ? x : m), s.scenes[0]); return !!peak && pct(peak.page, s.pageCount) >= 70; }, "全作品で、緊張の最大の山が後半に置かれています。", "感情曲線のピーク位置は作品ごとに異なります。");
  return { techniques, rows, total };
}
