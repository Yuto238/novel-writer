import { nanoid } from "nanoid";
import type {
  DialogueAnalysis, DialoguePattern, DialogueTendency, RefCharacter, RefElement, RefRelationship,
  ReferenceScene, SceneKind, ScriptDNA, ScriptOverview, StructureAnalysis,
} from "../../types";
import * as L from "./lexicon";
import { isUpper, type ParsedScene } from "./pdf";

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
export const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
const excerpt = (s: string, n = 80) => (s.length > n ? s.slice(0, n).trimEnd() + "…" : s);
const sentences = (s: string) => s.split(/(?<=[.!?。！？])\s*/).map((x) => x.trim()).filter(Boolean);
const words = (s: string, lang: string) => lang === "ja" ? s.length / 2 : s.split(/\s+/).filter(Boolean).length;

const CAPS_RE = /\b[A-Z]{3,}\b/g;
const WIN = ["win", "won", "success", "agree", "praise", "applause", "congratulat", "approve", "victory", "yes!", "perfect", "勝", "成功", "認め", "賞賛", "拍手"];
const LOSE = ["fail", "lose", "lost", "reject", "fired", "beaten", "defeat", "humiliat", "cry", "bleed", "no!", "refuse", "負け", "失敗", "断", "拒", "クビ", "屈辱", "泣"];

export const emotionLabel = (text: string) => {
  let best = { label: "平静", value: 0, hits: 0 };
  for (const e of L.EMOTIONS) { const h = L.countHits(text, e.words); if (h > best.hits) best = { label: e.label, value: e.value, hits: h }; }
  return best;
};
const tensionOf = (text: string, wc: number) => {
  const d = (L.countHits(text, L.CONFLICT_WORDS) + (text.match(/!/g)?.length ?? 0) * 0.6 + (text.match(CAPS_RE)?.length ?? 0) * 0.12 + L.countHits(text, L.TIME_LIMIT_WORDS) * 0.8 + L.countHits(text, L.THREAT) * 1.5) / (wc / 100);
  return r2(clamp(0.1 + 0.9 * (1 - Math.exp(-d / 5))));
};
const advOf = (text: string) => {
  const w = L.countHits(text, WIN), l = L.countHits(text, LOSE);
  return r2(clamp((w - l) / (w + l + 1.5), -1, 1));
};

const tokens = (text: string) => new Set([...(text.toLowerCase().match(/[a-z']{5,}/g) ?? []), ...(text.match(/[\u30a0-\u30ff]{3,}|[\u4e00-\u9fff]{2,}/g) ?? [])]);

function parseHeading(heading: string) {
  const m = /^(?:INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\.?|EXT\.?|I\/E\.?|EST\.?)\s+(.*)$/i.exec(heading.trim());
  const rest = (m ? m[1] : heading).trim();
  const parts = rest.split(/\s+[-–—]\s+/);
  let time = "";
  if (parts.length > 1) time = parts[parts.length - 1].trim();
  const location = (parts.length > 1 ? parts.slice(0, -1) : parts).join(" - ").trim();
  return { location: location || heading, time };
}

interface BuildOptions { lang: string; pageCount: number; fixedDuration?: boolean }

export function buildScenes(parsed: ParsedScene[], { lang, pageCount, fixedDuration }: BuildOptions): { scenes: ReferenceScene[]; protagonist: string } {
  // --- 全体の事前集計 ---
  const lineCount = new Map<string, number>();
  const sceneCount = new Map<string, number>();
  for (const sc of parsed) {
    const seen = new Set<string>();
    for (const el of sc.elements) if (el.type === "dialogue" && el.speaker) { lineCount.set(el.speaker, (lineCount.get(el.speaker) ?? 0) + 1); seen.add(el.speaker); }
    for (const c of sc.cast ?? []) seen.add(c.toUpperCase());
    for (const s of seen) sceneCount.set(s, (sceneCount.get(s) ?? 0) + 1);
  }
  const names = [...new Set([...lineCount.keys(), ...sceneCount.keys()])].filter((n) => (lineCount.get(n) ?? 0) >= 3 || (sceneCount.get(n) ?? 0) >= 2).filter((n) => !L.STOP_NAMES.has(n));
  const protagonist = [...names].sort((a, b) => ((lineCount.get(b) ?? 0) + 3 * (sceneCount.get(b) ?? 0)) - ((lineCount.get(a) ?? 0) + 3 * (sceneCount.get(a) ?? 0)))[0] ?? "";
  const display = (n: string) => (lang === "ja" ? n : titleCase(n));
  const nameRes = names.filter((n) => n.length >= 3 || lang === "ja").map((n) => ({ n, re: lang === "ja" ? null : new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i") }));
  const knownChars = new Set<string>();
  const knownLocs = new Set<string>();
  const total = parsed.length;
  let prevTension = 0;

  const scenes: ReferenceScene[] = parsed.map((sc, idx) => {
    const els = sc.elements.filter((e) => e.type !== "heading");
    const dlg = els.filter((e) => e.type === "dialogue");
    const text = els.map((e) => e.text).join("\n");
    const dlgText = dlg.map((e) => e.text).join(" ");
    const wc = Math.max(20, words(text, lang));
    const speakers = [...new Set(dlg.map((e) => e.speaker!).filter(Boolean))].sort((a, b) => dlg.filter((e) => e.speaker === b).length - dlg.filter((e) => e.speaker === a).length);
    const present = new Set<string>(speakers);
    for (const c of sc.cast ?? []) present.add(c.toUpperCase());
    for (const { n, re } of nameRes) if (!present.has(n) && (re ? re.test(text) : text.includes(n))) present.add(n);
    const chars = [...present].filter((n) => !L.STOP_NAMES.has(n)).sort((a, b) => dlg.filter((e) => e.speaker === b).length - dlg.filter((e) => e.speaker === a).length);
    const { location, time } = parseHeading(sc.heading);

    const half = Math.floor(els.length / 2);
    const third = Math.max(1, Math.floor(els.length / 3));
    const first = els.slice(0, third).map((e) => e.text).join(" ");
    const last = els.slice(-third).map((e) => e.text).join(" ");
    const firstHalf = els.slice(0, half).map((e) => e.text).join(" ");
    const secondHalf = els.slice(half).map((e) => e.text).join(" ");
    const tension = tensionOf(text, wc);
    const startTension = tensionOf(first, Math.max(20, words(first, lang)));
    const endTension = tensionOf(last, Math.max(20, words(last, lang)));
    const advantage = advOf(text);
    const startAdv = advOf(firstHalf), endAdv = advOf(secondHalf);
    const emoHits = L.EMOTIONS.reduce((s, e) => s + L.countHits(text, e.words), 0);
    const intensity = r2(clamp(tension * 0.6 + clamp(emoHits / (wc / 60)) * 0.3 + (text.match(/!/g)?.length ?? 0) / (wc / 40) * 0.1));
    const dialogueRatio = r2(text.length ? dlgText.length / text.length : 0);
    const avgLine = dlg.length ? words(dlgText, lang) / dlg.length : 0;
    const silence = L.countHits(text, L.SILENCE_WORDS);
    const duration = sc.pages ?? (fixedDuration ? 1 : r2(Math.max(0.2, wc / 190)));
    let kind: SceneKind = "dialogue";
    if (tension > 0.5 && dialogueRatio > 0.3 && speakers.length >= 2) kind = "conflict";
    else if (tension < 0.25 && (silence >= 2 || wc < 90)) kind = "quiet";
    else if (dialogueRatio < 0.25) kind = "action";
    else if (dialogueRatio >= 0.5 && avgLine > 14 && tension < 0.4) kind = "exposition";

    // --- 技法タグ（シーン単体で判定できるもの） ---
    const tags = new Set<string>();
    const deflect = L.countHits(dlgText, L.DEFLECT_WORDS);
    const direct = L.countHits(dlgText, L.DIRECT_EMOTION);
    const parens = els.filter((e) => e.type === "parenthetical").length;
    let evade = 0;
    for (let i = 0; i < dlg.length - 1; i++) {
      const q = dlg[i], a = dlg[i + 1];
      if (q.speaker !== a.speaker && /[?？]\s*$/.test(q.text.trim())) {
        const al = a.text.toLowerCase().trim();
        if (!L.QUESTION_EVADE.some((w) => al.startsWith(w)) && (words(a.text, lang) <= 9 || L.countHits(al, L.DEFLECT_WORDS) > 0)) evade++;
      }
    }
    if ((deflect >= 1 && dlg.length >= 3) || (parens >= 2 && direct === 0 && tension > 0.3) || (evade >= 1 && direct === 0)) tags.add("サブテキスト");
    if (L.countHits(text, L.SECRET_WORDS) >= 1) tags.add("情報隠し");
    const grams = new Map<string, number>();
    for (const e of dlg) {
      const t = e.text.toLowerCase().replace(/[^a-z\u3040-\u9fff'\s]/g, " ").split(/\s+/).filter(Boolean);
      const seg = lang === "ja" ? [...e.text].map((_, i) => e.text.slice(i, i + 5)).filter((g) => g.length === 5) : t.map((_, i) => t.slice(i, i + 3).join(" ")).filter((g) => g.split(" ").length === 3);
      for (const g of new Set(seg)) grams.set(g, (grams.get(g) ?? 0) + 1);
    }
    if ([...grams.values()].some((c) => c >= 2)) tags.add("反復");
    if (silence >= 2) tags.add("沈黙");
    if (evade >= 1) tags.add("質問回避");
    if (L.countHits(text, L.POWER_WORDS) >= 2) tags.add("権力差");
    if (L.countHits(text, L.TIME_LIMIT_WORDS) >= 1) tags.add("タイムリミット");
    if (kind === "action" && L.countHits(text, L.VISUAL_WORDS) >= 2) tags.add("視覚的説明");
    if (L.countHits(text, ["ironic", "of all people", "皮肉"]) >= 1) tags.add("状況アイロニー");
    if (L.countHits(text, L.IRONY_WORDS) >= 1) tags.add("ドラマティックアイロニー");
    if (L.countHits(text, ["pretend", "disguise", "fake", "mistake for", "勘違い", "なりすま"]) >= 1) tags.add("ミスリード");
    if (L.countHits(text, L.SURPRISE_WORDS) >= 1 && tension >= 0.4) tags.add("期待と裏切り");
    if (Math.abs(endAdv - startAdv) >= 0.6) tags.add("逆転");

    // --- 文章化 ---
    const A = chars[0] ? display(chars[0]) : "", B = chars[1] ? display(chars[1]) : "";
    const emoStart = emotionLabel(first).label, emoEnd = emotionLabel(last).label;
    const newChars = chars.filter((c) => !knownChars.has(c)).map(display);
    const newLoc = !knownLocs.has(location);
    chars.forEach((c) => knownChars.add(c)); knownLocs.add(location);
    const pct = total > 1 ? idx / (total - 1) : 0;
    const jump = tension - prevTension; prevTension = tension;
    const protagPresent = protagonist && present.has(protagonist);
    let storyRole = "物語を前進させる";
    let purpose = "状況を一段進め、次の展開へつなぐ";
    if (idx === 0) { storyRole = "オープニング"; purpose = "世界観・トーン・人物を提示する"; }
    else if (jump >= 0.3) { storyRole = "転換点の候補"; purpose = "状況を大きく動かし、人物に新たな選択を迫る"; }
    else if (kind === "conflict") { storyRole = "対立の顕在化"; purpose = "人物同士の衝突を見せ、関係と力関係を揺さぶる"; }
    else if (kind === "quiet") { storyRole = "余韻・内面"; purpose = "緊張を緩め、内面や関係性をじっくり見せる"; }
    else if (kind === "exposition") { storyRole = "情報提示"; purpose = "必要な情報や背景を観客に渡す"; }
    else if (kind === "action") { storyRole = "行動による前進"; purpose = "台詞ではなく行動で状況を動かす"; }
    else if (pct < 0.12) { storyRole = "セットアップ"; purpose = "人物・目的・関係の前提を整える"; }
    else if (pct > 0.92) { storyRole = "決着・余波"; purpose = "結果を示し、人物の変化を確認する"; }
    else { storyRole = "関係の更新"; purpose = "会話を通じて人物関係や目的を更新する"; }
    if (idx > 0 && pct > 0.92 && storyRole === "物語を前進させる") storyRole = "決着・余波";

    const goalSentence = protagPresent ? sentences(els.filter((e) => e.type === "action" || (e.type === "dialogue" && e.speaker === protagonist)).map((e) => e.text).join(" ")).find((s) => L.countHits(s, L.GOAL_WORDS) > 0 && (s.toLowerCase().includes(protagonist.toLowerCase()) || els.some((e) => e.speaker === protagonist && e.text.includes(s)))) : undefined;
    const obstacleParts: string[] = [];
    if (L.countHits(text, L.TIME_LIMIT_WORDS)) obstacleParts.push("時間的な制約");
    if (L.countHits(text, L.POWER_WORDS) >= 2) obstacleParts.push("立場・権力の差");
    if (L.countHits(text, L.SECRET_WORDS)) obstacleParts.push("隠された情報");
    if (L.countHits(text, L.CONFLICT_WORDS) >= 2) obstacleParts.push("相手との衝突");
    const conflict = tension >= 0.4 ? (A && B ? `${A} vs ${B}` : "状況・環境との対立") : "目立った対立は小さい";
    const warm = L.countHits(text, L.WARM_WORDS), hostile = L.countHits(text, L.CONFLICT_WORDS);
    const firstW = L.countHits(firstHalf, L.WARM_WORDS) - L.countHits(firstHalf, L.CONFLICT_WORDS);
    const lastW = L.countHits(secondHalf, L.WARM_WORDS) - L.countHits(secondHalf, L.CONFLICT_WORDS);
    const relationChange = A && B ? (lastW - firstW >= 2 ? `${A}と${B}の距離が縮まる傾向` : firstW - lastW >= 2 ? `${A}と${B}の関係が悪化する傾向` : `${A}と${B}の関係に大きな変化は見られない`) : "人物関係の変化は小さい";
    const surface = els.find((e) => e.type === "action")?.text ?? dlg[0]?.text ?? "";
    const kindText = { conflict: "対立・衝突", dialogue: "会話", action: "行動", exposition: "説明", quiet: "静かな場面" }[kind];
    const who = A ? (B ? `${A}と${B}` : A) : "人物";
    const info: string[] = [];
    if (newChars.length) info.push(`新登場: ${newChars.slice(0, 3).join("、")}`);
    if (newLoc) info.push(`新しい場所: ${location}`);
    const subtext = tags.has("サブテキスト") ? "発言と本音にずれがある可能性があります（質問回避・間・話題逸らしなど）" : "目立ったサブテキストは検出されませんでした";
    const audience = tension >= 0.55 ? "緊張・不安を高める" : kind === "quiet" ? "緊張を緩め、感情に浸らせる" : kind === "exposition" ? "状況を理解させ、先を予測させる" : tension >= 0.35 ? "先の展開への関心を保つ" : "人物や世界への親しみを育てる";

    return {
      id: nanoid(), sceneNumber: idx + 1, heading: sc.heading, page: sc.page, endPage: sc.endPage, location, time,
      characters: chars.map(display), originalText: els.map((e) => e.text).join("\n"), translation: "", elements: sc.elements,
      logline: `${who}が${location}${time ? `（${time}）` : ""}で${kindText}を展開。${emoStart !== emoEnd ? `${emoStart}から${emoEnd}へ。` : ""}`,
      purpose, protagonistGoal: goalSentence ? `原文: ${excerpt(goalSentence)}` : protagPresent ? "この場面では明示的な目的は検出されませんでした" : "主人公は登場しないか目的は不明",
      obstacle: obstacleParts.length ? obstacleParts.join("／") : "明確な障害は小さい", conflict,
      startState: emoStart, endState: emoEnd, emotionalChange: emoStart === emoEnd ? `${emoStart}（大きな変化なし）` : `${emoStart} → ${emoEnd}`,
      storyRole, surfaceEvent: surface ? `原文: ${excerpt(surface, 100)}` : "", emotionalRole: emoEnd === "平静" ? "感情を抑えた場面" : `${emoEnd}を観客に体験させる`,
      relationChange, information: info.join(" / ") || "新しい情報提示は少ない", foreshadow: "", subtext, audienceEffect: audience,
      techniques: [...tags], metrics: { tension, intensity, advantage, dialogueRatio, duration, kind, startTension, endTension, startAdv, endAdv },
    };
  });

  // 暖かさ・敵意は後続の関係分析でも再利用するため、ここでは使用しない
  void pageCount;
  crossSceneTags(scenes, lang, names);
  return { scenes, protagonist: protagonist ? display(protagonist) : "" };
}

function crossSceneTags(scenes: ReferenceScene[], lang: string, names: string[]) {
  const n = scenes.length;
  const nameTokens = new Set(names.flatMap((x) => x.toLowerCase().split(/\s+/)));
  const sets = scenes.map((s) => tokens(s.originalText));
  const df = new Map<string, number[]>();
  sets.forEach((set, i) => set.forEach((t) => { if (!nameTokens.has(t) && !(t in L.WORD_JA)) (df.get(t) ?? df.set(t, []).get(t)!).push(i); }));
  const chains = [...df.entries()].filter(([, idx]) => idx.length >= 2 && idx.length <= 5 && idx[0] <= n * 0.55 && idx[idx.length - 1] - idx[0] >= Math.max(3, n * 0.25))
    .sort((a, b) => (b[1][b[1].length - 1] - b[1][0]) - (a[1][a[1].length - 1] - a[1][0])).slice(0, 12);
  const usedSetup = new Set<number>(), usedPay = new Set<number>();
  for (const [tok, idx] of chains) {
    const s = idx[0], p = idx[idx.length - 1];
    if (!usedSetup.has(s)) { usedSetup.add(s); scenes[s].techniques.push("セットアップ", "伏線"); scenes[s].foreshadow = `「${tok}」が後のScene ${scenes[p].sceneNumber}で再登場します（伏線・セットアップの可能性）`; }
    if (!usedPay.has(p)) { usedPay.add(p); scenes[p].techniques.push("ペイオフ"); }
    for (const m of idx.slice(1, -1)) if (m !== s && !scenes[m].techniques.includes("コールバック")) scenes[m].techniques.push("コールバック");
    if (idx.length >= 2 && p !== s && !scenes[p].techniques.includes("コールバック") && lang) scenes[p].techniques.push("コールバック");
  }
  for (let i = 1; i < n; i++) {
    const a = scenes[i - 1].metrics, b = scenes[i].metrics;
    if (Math.abs(b.tension - a.tension) >= 0.4 || Math.abs(b.advantage - a.advantage) >= 0.8) scenes[i].techniques.push("対比");
    if (i >= 2 && scenes[i - 2].metrics.tension + 0.04 < a.tension && a.tension + 0.04 < b.tension) scenes[i].techniques.push("エスカレーション");
    if (a.advantage * b.advantage < 0 && Math.abs(b.advantage - a.advantage) >= 0.7) scenes[i].techniques.push("逆転");
  }
  for (const s of scenes) s.techniques = [...new Set(s.techniques)];
}

// ---------- 登場人物・関係 ----------
export function analyzeCharacters(scenes: ReferenceScene[], lang: string) {
  const stats = new Map<string, { lines: string[]; scenes: ReferenceScene[]; share: number }>();
  for (const sc of scenes) {
    const total = sc.elements.filter((e) => e.type === "dialogue").length || 1;
    for (const c of sc.characters) {
      const key = c;
      const mine = sc.elements.filter((e) => e.type === "dialogue" && (lang === "ja" ? e.speaker === c : titleCase(e.speaker ?? "") === c));
      const st = stats.get(key) ?? { lines: [], scenes: [], share: 0 };
      st.lines.push(...mine.map((e) => e.text)); st.scenes.push(sc); st.share += sc.metrics.duration * (mine.length ? mine.length / total : 0.15);
      stats.set(key, st);
    }
  }
  const ranked = [...stats.entries()].sort((a, b) => (b[1].lines.length + 3 * b[1].scenes.length) - (a[1].lines.length + 3 * a[1].scenes.length));
  const top = ranked.slice(0, 24);
  const prot = top[0]?.[0];

  // 共演シーンの対立・親密度
  const pairs = new Map<string, { a: string; b: string; scenes: ReferenceScene[]; conflict: number }>();
  for (const sc of scenes) {
    const spk = sc.characters.filter((c) => top.some((t) => t[0] === c)).slice(0, 4);
    for (let i = 0; i < spk.length; i++) for (let j = i + 1; j < spk.length; j++) {
      const [a, b] = [spk[i], spk[j]].sort();
      const k = `${a}|${b}`; const p = pairs.get(k) ?? { a, b, scenes: [], conflict: 0 };
      p.scenes.push(sc); p.conflict += sc.metrics.tension; pairs.set(k, p);
    }
  }
  const opponentOf = (name: string) => [...pairs.values()].filter((p) => p.a === name || p.b === name).sort((x, y) => y.conflict - x.conflict)[0];
  const protOpp = prot ? opponentOf(prot) : undefined;
  const oppName = protOpp ? (protOpp.a === prot ? protOpp.b : protOpp.a) : "";

  const characters: RefCharacter[] = top.map(([name, st], rank) => {
    const lines = st.lines.join(" ");
    const pick = (ws: readonly string[]) => { const s = sentences(lines).find((x) => L.countHits(x, ws) > 0); return s ? `原文より: 「${excerpt(s, 70)}」` : "本文からは明確に特定できません"; };
    const op = opponentOf(name);
    const opponent = op ? (op.a === name ? op.b : op.a) : "—";
    const third = Math.max(1, Math.floor(st.scenes.length / 3));
    const early = emotionLabel(st.scenes.slice(0, third).map((s) => s.originalText).join(" ")).label;
    const late = emotionLabel(st.scenes.slice(-third).map((s) => s.originalText).join(" ")).label;
    const role = name === prot ? "主人公" : name === oppName && protOpp && protOpp.conflict / protOpp.scenes.length >= 0.3 ? "対立者" : rank < 5 ? "主要人物" : "脇役";
    const sampled = st.scenes.length <= 10 ? st.scenes : Array.from({ length: 10 }, (_, i) => st.scenes[Math.round(i * (st.scenes.length - 1) / 9)]);
    return {
      name, role, sceneNumbers: st.scenes.map((s) => s.sceneNumber), pages: [...new Set(st.scenes.map((s) => s.page))], lineCount: st.lines.length, screenTime: r2(st.share),
      goal: pick(L.GOAL_WORDS), desire: pick(L.DESIRE_WORDS), weakness: pick(L.WEAK_WORDS), fear: pick(L.FEAR_WORDS), opponent,
      change: early === late ? `${early}（大きな変化は検出されず）` : `${early} → ${late}`,
      function: { 主人公: "物語の目的を担い、変化する中心人物", 対立者: "主人公の目的に抵抗し、成長・選択を迫る存在", 主要人物: "主人公との関係を通じて物語を支える人物", 脇役: "場面・情報・関係を補う人物" }[role]!,
      arc: sampled.map((sc) => {
        const mine = sc.elements.filter((e) => e.speaker && (lang === "ja" ? e.speaker === name : titleCase(e.speaker) === name)).map((e) => e.text).join(" ");
        const em = emotionLabel(mine || sc.originalText);
        return { sceneNumber: sc.sceneNumber, emotion: em.hits ? em.label : sc.endState, value: em.hits ? em.value : L.EMOTIONS.find((e) => e.label === sc.endState)?.value ?? 0 };
      }),
    };
  });

  const relationships: RefRelationship[] = [...pairs.values()].filter((p) => p.scenes.length >= 2).sort((a, b) => b.scenes.length - a.scenes.length).slice(0, 8).map((p) => {
    const dirLabel = (from: string) => {
      const mine = p.scenes.flatMap((sc) => sc.elements.filter((e) => e.type === "dialogue" && e.speaker && (lang === "ja" ? e.speaker === from : titleCase(e.speaker) === from)));
      const humble = mine.filter((e) => /\b(sir|ma'am|please|sorry)\b/i.test(e.text) || /すみません|お願い|申し訳/.test(e.text)).length;
      const command = mine.filter((e) => L.IMPERATIVE_START.some((w) => e.text.toLowerCase().startsWith(w))).length;
      const hostile = L.countHits(mine.map((e) => e.text).join(" "), L.CONFLICT_WORDS);
      const warm = L.countHits(mine.map((e) => e.text).join(" "), L.WARM_WORDS);
      if (humble > command + 1) return "敬意・従属";
      if (command > humble + 1 && command >= 3) return "指示・支配";
      if (hostile > warm + 1) return "敵意・反発";
      if (warm > hostile + 1) return "好意・信頼";
      return "関与・探り合い";
    };
    const timeline = p.scenes.map((sc) => {
      const warm = L.countHits(sc.originalText, L.WARM_WORDS), hostile = L.countHits(sc.originalText, L.CONFLICT_WORDS);
      const score = r2(clamp((warm - hostile) / (warm + hostile + 2) - (sc.metrics.tension - 0.4) * 0.5, -1, 1));
      return { sceneNumber: sc.sceneNumber, score, label: score > 0.5 ? "親密" : score > 0.15 ? "近づく" : score > -0.15 ? "距離がある" : score > -0.5 ? "対立" : "決裂" };
    });
    return { a: p.a, b: p.b, aToB: dirLabel(p.a), bToA: dirLabel(p.b), timeline: timeline.length > 12 ? Array.from({ length: 12 }, (_, i) => timeline[Math.round(i * (timeline.length - 1) / 11)]) : timeline };
  });
  return { characters, relationships };
}

// ---------- セリフ ----------
type Move = string;
function classifyMove(e: RefElement, prev: RefElement | undefined): Move {
  const t = e.text.trim(), tl = t.toLowerCase();
  if (e.type === "parenthetical" || /^\(?(beat|pause|silence)\)?$/i.test(t)) return "沈黙する";
  if (L.countHits(tl, L.THREAT) > 0) return "脅す";
  if (L.countHits(tl, L.APOLOGY) > 0) return "謝罪する";
  if (L.countHits(tl, L.DIRECT_EMOTION) > 0) return "感情を表明する";
  const prevQ = prev && /[?？]\s*$/.test(prev.text.trim());
  if (/[?？]\s*$/.test(t)) return prevQ && prev?.speaker === e.speaker ? "質問を言い換える" : prevQ ? "問い返す" : "質問する";
  if (L.countHits(tl, L.DEFLECT_WORDS) > 0 || (prevQ && !L.QUESTION_EVADE.some((w) => tl.startsWith(w)) && t.split(/\s+/).length <= 8)) return "回避する";
  if (/^(no|don't|can't|won't|never|いいえ|だめ|無理)/i.test(tl)) return "拒否する";
  if (L.IMPERATIVE_START.some((w) => tl.startsWith(w))) return "命令する";
  if (prevQ) return "答える";
  return "情報・意見を述べる";
}

export function analyzeDialogue(scenes: ReferenceScene[], lang: string, pageCount: number) {
  const all: (DialogueAnalysis & { score: number })[] = [];
  let totalLines = 0, totalWords = 0, short = 0, direct = 0, deflect = 0, qCount = 0, evaded = 0, interrupted = 0, beats = 0;
  const repScenes = scenes.filter((s) => s.techniques.includes("反復")).length;
  for (const sc of scenes) {
    const els = sc.elements.filter((e) => e.type === "dialogue" || e.type === "parenthetical");
    const dlgs = els.filter((e) => e.type === "dialogue");
    els.forEach((e, i) => {
      if (e.type === "parenthetical") { if (/beat|pause|silence|間/i.test(e.text)) beats++; return; }
      const prev = els.slice(0, i).reverse().find((x) => x.type === "dialogue");
      const wc = words(e.text, lang);
      totalLines++; totalWords += wc; if (wc <= 6) short++;
      if (L.countHits(e.text, L.DIRECT_EMOTION)) direct++;
      if (L.countHits(e.text, L.DEFLECT_WORDS)) deflect++;
      if (/(--|—|-)\s*$/.test(e.text.trim())) interrupted++;
      const move = classifyMove(e, prev);
      if (prev && /[?？]\s*$/.test(prev.text.trim()) && prev.speaker !== e.speaker) { qCount++; if (move === "回避する") evaded++; }
      const nextOther = dlgs.slice(dlgs.indexOf(e) + 1).find((x) => x.speaker !== e.speaker);
      const prevOther = [...dlgs.slice(0, dlgs.indexOf(e))].reverse().find((x) => x.speaker !== e.speaker);
      const addressee = (prevOther ?? nextOther)?.speaker ?? "";
      const em = emotionLabel(e.text);
      const hiddenFlag = move === "回避する" || move === "拒否する" || (L.countHits(e.text, L.SECRET_WORDS) > 0);
      const goal = ({ "質問する": "情報を引き出す", "問い返す": "答えを迫る・主導権を取る", "質問を言い換える": "回答を引き出す", "回避する": "話題を逸らして本音を守る", "拒否する": "要求を退ける", "命令する": "相手を動かす", "感情を表明する": "感情を明示して理解を求める", "謝罪する": "関係を修復する", "脅す": "威圧して従わせる", "答える": "問いに応じる", "沈黙する": "言葉にしない感情を伝える", "情報・意見を述べる": "状況や考えを伝える" } as Record<string, string>)[move];
      const impression = ({ "質問する": "関心がある", "問い返す": "主導権を持っている", "質問を言い換える": "引き下がらない", "回避する": "平静を装う", "拒否する": "意思が固い", "命令する": "主導権を持つ", "感情を表明する": "素直・無防備", "謝罪する": "誠実・弱い立場", "脅す": "危険・強い", "答える": "協力的", "沈黙する": "内面を隠す", "情報・意見を述べる": "説明的・中立" } as Record<string, string>)[move];
      const idx = dlgs.indexOf(e);
      all.push({
        id: nanoid(), elementId: e.id, sceneNumber: sc.sceneNumber, speaker: lang === "ja" ? e.speaker ?? "" : titleCase(e.speaker ?? ""),
        addressee: lang === "ja" ? addressee : titleCase(addressee), original: e.text,
        surface: ({ "質問する": "質問している", "問い返す": "質問に質問で返している", "質問を言い換える": "同じ質問を言い換えている", "回避する": "質問に正面から答えていない", "拒否する": "拒否している", "命令する": "指示・要求している", "感情を表明する": "感情を直接言葉にしている", "謝罪する": "謝っている", "脅す": "脅している", "答える": "質問に答えている", "沈黙する": "間・沈黙", "情報・意見を述べる": "情報や意見を述べている" } as Record<string, string>)[move],
        hidden: hiddenFlag ? "表面の言葉とは別の意図が隠れている可能性があります" : "表面の意味と意図は近いと考えられます",
        hiddenInfo: L.countHits(e.text, L.SECRET_WORDS) ? "隠し事に触れている可能性があります" : move === "回避する" ? "答えたくない情報がある可能性があります" : "—",
        impression, emotion: em.hits ? em.label : sc.endState, goal, subtext: hiddenFlag ? "言葉にされない本音が回避・拒否の形で表れている可能性があります" : "目立ったサブテキストなし",
        role: idx === 0 ? "会話の口火を切る" : idx === dlgs.length - 1 ? "場面の着地点をつくる" : move.startsWith("質問") ? "情報を要求し、展開を促す" : "やり取りを進める",
        score: sc.metrics.tension * 0.5 + (hiddenFlag ? 0.6 : 0) + Math.min(0.3, wc / 60) + (idx === 0 || idx === dlgs.length - 1 ? 0.2 : 0),
      });
    });
  }
  const dialogues: DialogueAnalysis[] = all.sort((a, b) => b.score - a.score).slice(0, 400).sort((a, b) => a.sceneNumber - b.sceneNumber).map(({ score: _s, ...rest }) => rest);

  const tendencies: DialogueTendency[] = [];
  const avg = totalLines ? totalWords / totalLines : 0;
  tendencies.push(avg <= 9 ? { label: "短文が多い", evidence: `1セリフ平均 ${avg.toFixed(1)} ${lang === "ja" ? "字/2" : "語"}、6語以下が${Math.round(short / Math.max(1, totalLines) * 100)}%`, strength: clamp(1 - avg / 14) } : { label: "比較的長い発話が多い", evidence: `1セリフ平均 ${avg.toFixed(1)}語`, strength: clamp((avg - 9) / 12) });
  tendencies.push(qCount && evaded / qCount >= 0.25 ? { label: "質問に直接答えない", evidence: `質問${qCount}件中 約${Math.round(evaded / qCount * 100)}% が回避的な応答`, strength: clamp(evaded / qCount * 1.5) } : { label: "質問には比較的素直に答える", evidence: `質問${qCount}件中 回避的な応答は${evaded}件`, strength: 0.3 });
  tendencies.push(direct / Math.max(1, totalLines) < 0.012 ? { label: "感情を直接説明しない", evidence: `感情を明言するセリフは${direct}件（全体の${(direct / Math.max(1, totalLines) * 100).toFixed(1)}%）`, strength: clamp(1 - direct / Math.max(1, totalLines) * 40) } : { label: "感情を言葉にして伝える場面がある", evidence: `感情を明言するセリフ ${direct}件`, strength: clamp(direct / Math.max(1, totalLines) * 20) });
  const beatRate = beats / Math.max(1, pageCount / 10);
  tendencies.push({ label: beatRate >= 2 ? "沈黙・間を多く使用" : "沈黙・間は控えめ", evidence: `（間）系の指定が10ページあたり ${beatRate.toFixed(1)}回`, strength: clamp(beatRate / 6) });
  tendencies.push({ label: repScenes / Math.max(1, scenes.length) >= 0.15 ? "同じ言葉を反復する" : "反復は限定的", evidence: `反復が見られるシーン ${repScenes}/${scenes.length}`, strength: clamp(repScenes / Math.max(1, scenes.length) * 3) });
  tendencies.push({ label: (deflect + interrupted) / Math.max(1, totalLines) >= 0.04 ? "会話途中で遮る・話題を切り替える" : "会話は途切れず進む傾向", evidence: `話題逸らし ${deflect}件、中断 ${interrupted}件`, strength: clamp((deflect + interrupted) / Math.max(1, totalLines) * 8) });

  // 会話構造（パターン）
  const patterns: DialoguePattern[] = [];
  const candidates = scenes.map((sc) => {
    const dl = sc.elements.filter((e) => e.type === "dialogue" || e.type === "parenthetical");
    const spk = [...new Set(dl.filter((e) => e.type === "dialogue").map((e) => e.speaker!))].slice(0, 2);
    const moves: { speaker: "A" | "B"; move: string }[] = [];
    dl.forEach((e, i) => {
      const who = e.type === "parenthetical" ? (e.speaker === spk[1] ? "B" : "A") : e.speaker === spk[0] ? "A" : e.speaker === spk[1] ? "B" : null;
      if (!who) return;
      const m = classifyMove(e, dl.slice(0, i).reverse().find((x) => x.type === "dialogue"));
      const last = moves[moves.length - 1];
      if (!last || last.speaker !== who || last.move !== m) moves.push({ speaker: who, move: m });
    });
    const variety = new Set(moves.map((m) => m.move)).size;
    return { sc, spk, moves: moves.slice(0, 8), variety, score: variety + sc.metrics.tension * 3 + (moves.some((m) => ["回避する", "拒否する", "沈黙する", "質問を言い換える"].includes(m.move)) ? 2 : 0) };
  }).filter((c) => c.spk.length === 2 && c.moves.length >= 5 && c.variety >= 3).sort((a, b) => b.score - a.score).slice(0, 10);
  for (const c of candidates) {
    const set = new Set(c.moves.map((m) => m.move));
    patterns.push({
      id: nanoid(), structure: c.moves, sourceScene: c.sc.sceneNumber, characters: c.spk.map((s) => (lang === "ja" ? s : titleCase(s))), saved: false,
      description: c.moves.map((m) => `${m.speaker}: ${m.move}`).join(" → "),
      subtextPattern: set.has("回避する") ? "質問に直接答えず話題をずらす（本音は答えの外側にある）" : set.has("沈黙する") ? "言葉にしない間で感情を伝える" : set.has("拒否する") && set.has("命令する") ? "主導権をめぐる押し引き" : "表面的なやり取りの下で関係が動く",
    });
  }
  return { dialogues, tendencies, patterns };
}

// ---------- 概要・DNA ----------
export function buildOverview(
  title: string, scenes: ReferenceScene[], characters: RefCharacter[], structure: StructureAnalysis | undefined, pageCount: number, lang: string,
): ScriptOverview {
  const prot = characters.find((c) => c.role === "主人公");
  const opp = characters.find((c) => c.role === "対立者");
  const text = scenes.map((s) => s.originalText).join(" ");
  const genre = L.GENRES.map((g) => ({ g: g.label, n: L.countHits(text, g.words) })).sort((a, b) => b.n - a.n)[0];
  const goalScene = prot ? scenes.find((s) => s.characters.includes(prot.name) && s.protagonistGoal.startsWith("原文")) : undefined;
  const climax = structure?.points.find((p) => p.name === "Climax");
  const locCount = new Map<string, number>();
  scenes.forEach((s) => locCount.set(s.location, (locCount.get(s.location) ?? 0) + 1));
  const mainLocations = [...locCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([l]) => l);
  const peak = scenes.reduce((m, s) => (s.metrics.tension > m.metrics.tension ? s : m), scenes[0]);
  const runtime = Math.round(scenes.reduce((s, x) => s + x.metrics.duration, 0)) || pageCount;
  const genreLabel = genre && genre.n >= 5 ? genre.g : "ドラマ";
  const goal = goalScene ? goalScene.protagonistGoal + `（Scene ${goalScene.sceneNumber}）` : prot?.goal && !prot.goal.startsWith("本文") ? prot.goal : "本文からは明確に特定できません";
  return {
    protagonist: prot?.name ?? "特定できません", goal,
    obstacle: opp ? `${opp.name}との対立が主な障害となっている可能性があります` : "明確な対立者は特定できません",
    conflict: opp && prot ? `${prot.name} vs ${opp.name}` : "—", genre: genreLabel, climaxPage: climax?.page ?? peak?.page ?? 0,
    actCount: structure && structure.fit !== "none" ? 3 : 0, runtime, mainLocations,
    summary: `${title}は約${runtime}分・${scenes.length}シーン・主要人物${characters.filter((c) => c.role !== "脇役").length}人で構成される${genreLabel}寄りの作品と推定されます。${prot ? `${prot.name}が物語の中心で、` : ""}${opp ? `${opp.name}との対立が緊張を生み、` : ""}緊張度はScene ${peak?.sceneNumber}（p.${peak?.page}）付近で最も高まります。${structure?.fit === "clear" ? "三幕構成として解釈しやすい配置です。" : "三幕構成には厳密に当てはまらない部分があります。"}${lang === "ja" ? "" : "（英語脚本のためセリフ・目的は原文を抜粋して表示します）"}`,
  };
}

export function computeDNA(scenes: ReferenceScene[], characters: RefCharacter[], tendencies: DialogueTendency[], pageCount: number): ScriptDNA {
  const n = Math.max(1, scenes.length);
  const prot = characters.find((c) => c.role === "主人公");
  const goalScenes = scenes.filter((s) => s.protagonistGoal.startsWith("原文")).length;
  const meanT = scenes.reduce((s, x) => s + x.metrics.tension, 0) / n;
  const delta = scenes.slice(1).reduce((s, x, i) => s + Math.abs(x.metrics.tension - scenes[i].metrics.tension), 0) / Math.max(1, n - 1);
  const emoChanges = scenes.filter((s) => s.startState !== s.endState).length / n;
  const t = (label: string) => tendencies.find((x) => x.label.includes(label))?.strength ?? 0;
  return {
    desire: r2(clamp(0.2 + goalScenes / n * 4 + (prot ? 0.1 : 0))),
    conflict: r2(clamp((meanT - 0.15) / 0.5)),
    explanation: r2(clamp(0.25 + (tendencies.some((x) => x.label.startsWith("感情を言葉")) ? 0.35 : 0) + (tendencies.some((x) => x.label.startsWith("比較的長い")) ? 0.2 : 0) + scenes.filter((s) => s.metrics.kind === "exposition").length / n)),
    subtext: r2(clamp(scenes.filter((s) => s.techniques.includes("サブテキスト")).length / n * 2.2 + t("質問に直接") * 0.2)),
    pace: r2(clamp((n / Math.max(1, pageCount)) * 10 / 5)),
    foreshadow: r2(clamp(scenes.filter((s) => s.techniques.includes("セットアップ")).length / 6)),
    emotionChange: r2(clamp(delta * 3 + emoChanges * 0.4)),
    humor: r2(clamp(scenes.reduce((s, x) => s + L.countHits(x.originalText, L.HUMOR_WORDS), 0) / Math.max(1, pageCount / 10) / 6)),
  };
}

export const DNA_LABELS: Record<keyof ScriptDNA, string> = {
  desire: "主人公欲望", conflict: "対立頻度", explanation: "セリフ説明量", subtext: "サブテキスト", pace: "シーン転換", foreshadow: "伏線", emotionChange: "感情変化", humor: "ユーモア",
};
export const dnaWord = (v: number) => (v >= 0.8 ? "非常に高い" : v >= 0.6 ? "高い" : v >= 0.4 ? "中程度" : v >= 0.2 ? "低い" : "非常に低い");
export { isUpper };
