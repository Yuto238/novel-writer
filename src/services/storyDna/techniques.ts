import { nanoid } from "nanoid";
import type {
  ApplicationPatch, ApplicationSuggestion, DialoguePattern, DialogueAnalysis, DialogueTendency, RefCharacter, ReferenceScene, ReferenceScript,
  ScreenplayProject, ScreenplayScene, StructureAnalysis, StructureMethod, Technique,
} from "../../types";
import * as L from "./lexicon";

export interface ScriptAnalysis {
  title: string;
  pageCount: number;
  scenes: ReferenceScene[];
  characters: RefCharacter[];
  structure: Partial<Record<StructureMethod, StructureAnalysis>>;
  dialogues: DialogueAnalysis[];
  dialogueTendencies: DialogueTendency[];
}

export const toAnalysis = (r: ReferenceScript): ScriptAnalysis => ({ title: r.title, pageCount: r.pageCount, scenes: r.scenes, characters: r.characters, structure: r.structure, dialogues: r.dialogues, dialogueTendencies: r.dialogueTendencies });

export interface Candidate { sceneId: string; sceneNumber: number; fit: "高" | "中" | "低"; reason: string }
interface Ctx { refTitle: string; refProt: string; refOpp: string; prot: string; other: string; scene: ScreenplayScene }
type Levels = [(c: Ctx) => string, (c: Ctx) => string, (c: Ctx) => string];

interface Def {
  key: string; name: string; description: string; principle: string; why: string; genres: string[];
  original: (r: ScriptAnalysis, scenes: number[]) => string;
  structural: string; abstract: string;
  detect: (r: ScriptAnalysis) => { scenes: number[]; strength: number } | null;
  find: (o: ScriptAnalysis, project: ScreenplayProject) => { scene: ReferenceScene; score: number; reason: string }[];
  core: Levels;
  fields?: (scene: ScreenplayScene) => ApplicationPatch["fieldUpdates"];
  applyTitle: string;
}

const pos = (a: ScriptAnalysis, s: ReferenceScene) => (s.page - 1) / Math.max(1, ...a.scenes.map((x) => x.endPage));
const prot = (a: ScriptAnalysis) => a.characters.find((c) => c.role === "主人公")?.name ?? "主人公";
const opp = (a: ScriptAnalysis) => a.characters.find((c) => c.role === "対立者")?.name ?? "対立者";
const tagged = (a: ScriptAnalysis, tag: string) => a.scenes.filter((s) => s.techniques.includes(tag));
const sceneOf = (a: ScriptAnalysis, n: number) => a.scenes[n - 1];
const pt = (a: ScriptAnalysis, name: string) => { const p = a.structure["three-act"]?.points.find((x) => x.name === name); return p?.matched ? p.sceneNumber : undefined; };
const mid = <T,>(arr: T[], n: number) => arr.slice(0, n);
const hasGoal = (s: ReferenceScene) => s.protagonistGoal.startsWith("原文");
const tagDef = (tag: string, min: number, base: Pick<Def, "key" | "name" | "description" | "principle" | "why" | "genres" | "structural" | "abstract" | "original" | "core" | "applyTitle" | "find">): Def => ({
  ...base, detect: (a) => { const t = tagged(a, tag); return t.length >= min ? { scenes: mid(t.map((s) => s.sceneNumber), 6), strength: Math.min(1, t.length / (min * 3)) } : null; },
});

const DEFS: Def[] = [
  {
    key: "early-goal", name: "主人公の目的を序盤で行動によって提示する", applyTitle: "主人公の目的提示を早める",
    description: "主人公が何を求めているかを、説明ではなく具体的な行動として序盤で見せます。",
    principle: "観客は目的を理解した時点から、物語の成否を自分ごととして追い始めます。", why: "目的が早く分かると、以降のすべての出来事が「目的に近づく／遠ざかる」として読めるため、物語の方向性が早く伝わります。", genres: ["ドラマ", "スポーツ", "サスペンス", "ビジネス"],
    original: (r, s) => `${prot(r)}の目的が Scene ${s[0]}（${sceneOf(r, s[0])?.heading}）付近で示される`,
    structural: "主人公が目的に向けて動く姿を、序盤の場面で見せる構造", abstract: "欲求を、説明ではなく序盤の行動として観客に目撃させる",
    detect: (a) => { const g = a.scenes.find(hasGoal); if (!g) return null; const p = pos(a, g); return p <= 0.25 ? { scenes: [g.sceneNumber], strength: p <= 0.15 ? 1 : 0.6 } : null; },
    find: (o) => o.scenes.filter((s) => pos(o, s) <= 0.3).map((s, i) => ({ scene: s, score: 3 - i * 0.4 + (hasGoal(s) ? -1 : 0.5) + (s.characters.length ? 0.3 : 0), reason: hasGoal(s) ? "目的を示す表現はありますが、行動としてさらに見せる余地があります。" : "序盤で目的が行動として明示されていない可能性があります。" })),
    core: [(c) => `参考作品「${c.refTitle}」の${c.refProt}のように、${c.prot}が求めているものを序盤の具体的な行動で見せる`, (c) => `${c.prot}が叶えたいことに向けて、具体的な行動を起こす姿を見せる`, () => "登場人物の欲求を、観客が目撃できる行動として提示する"],
    fields: (s) => (s.purpose ? {} : { purpose: "主人公の目的を行動で示す" }),
  },
  {
    key: "antagonist-mirror", name: "敵役を主人公の欲望を増幅させる存在として配置する", applyTitle: "敵役に主人公と同じ価値観を持たせる",
    description: "対立者を単なる障害ではなく、主人公の欲望や弱点を映し、増幅させる存在として置きます。",
    principle: "対立者が主人公と同じ価値観を別の形で体現すると、衝突が内面の葛藤にもなります。", why: "外側の対立と内側の葛藤が重なり、勝敗が人物の変化と直結するためです。", genres: ["ドラマ", "スリラー", "スポーツ", "ビジネス"],
    original: (r, s) => `${prot(r)}と${opp(r)}の衝突が Scene ${s.join("・")} で繰り返される`,
    structural: "対立者との衝突が、主人公の欲望を強める構造", abstract: "対立者が主人公の欲望を映す鏡として機能し、衝突のたびに主人公を追い込む",
    detect: (a) => { const o = a.characters.find((c) => c.role === "対立者"); const p = a.characters.find((c) => c.role === "主人公"); if (!o || !p) return null; const s = a.scenes.filter((x) => x.characters.includes(o.name) && x.characters.includes(p.name) && x.metrics.tension >= 0.4); return s.length >= 3 ? { scenes: mid(s.map((x) => x.sceneNumber), 6), strength: Math.min(1, s.length / 8) } : null; },
    find: (o) => o.scenes.filter((s) => s.characters.length >= 2 && pos(o, s) > 0.2 && pos(o, s) < 0.85).map((s) => ({ scene: s, score: s.metrics.tension + s.characters.length * 0.1 + (s.obstacle.startsWith("明確") ? 0.4 : 0), reason: "二人以上が登場し、対立者の価値観を主人公の欲望と重ねられる余地があります。" })),
    core: [(c) => `参考作品の${c.refOpp}のように、${c.other}を${c.prot}の欲望を映し増幅する存在として描く`, (c) => `${c.other}に、${c.prot}と同じ価値観を別の形で持たせ、衝突が${c.prot}自身の葛藤にもなるようにする`, () => "対立者を、主人公の欲望を鏡のように映して増幅する存在として配置する"],
    fields: (s) => (s.obstacle ? {} : { obstacle: "相手が主人公と同じ価値観を別の形で体現している" }),
  },
  {
    key: "subtext-emotion", name: "重要な感情をセリフで説明しない", applyTitle: "感情説明をサブテキスト化する",
    description: "怒りや悲しみなどの重要な感情を、直接言葉にせず、行動・間・話題の逸らしで伝えます。",
    principle: "観客が自分で感情を読み取る余白を残すと、理解が体験に変わります。", why: "説明されない感情は観客の推測を引き出し、場面への没入と記憶への定着を高めます。", genres: ["ドラマ", "ロマンス", "サスペンス"],
    original: (r, s) => `Scene ${s.slice(0, 3).join("・")} などで、感情が言葉ではなく回避や間で表現される`,
    structural: "感情を直接語らせず、態度・間・回避で示す構造", abstract: "感情は言葉にせず、行動と間に託して観客に読み取らせる",
    detect: (a) => { const t = tagged(a, "サブテキスト"); const ten = a.dialogueTendencies.find((x) => x.label.startsWith("感情を直接")); return t.length >= 3 && (ten?.strength ?? 0) >= 0.4 ? { scenes: mid(t.map((s) => s.sceneNumber), 6), strength: Math.min(1, (ten?.strength ?? 0.5)) } : null; },
    find: (o) => o.scenes.map((s) => ({ scene: s, hits: L.countHits(s.elements.filter((e) => e.type === "dialogue").map((e) => e.text).join(" "), L.DIRECT_EMOTION) })).filter((x) => x.hits > 0).map((x) => ({ scene: x.scene, score: x.hits + x.scene.metrics.intensity, reason: `感情を直接述べるセリフが${x.hits}件あります。行動や間に置き換えられる可能性があります。` })),
    core: [(c) => `参考作品の会話のように、${c.prot}の感情を口にせず、視線・間・話題の逸らしで見せる`, (c) => `${c.prot}は気持ちを言葉にせず、手を止める・視線を外すなどの行動で感情を示す`, () => "感情の説明を、行動・間・回避といった非言語の表現へ置き換える"],
  },
  {
    key: "repeat-vary", name: "同じ状況を複数回使用し、結果だけを変化させる", applyTitle: "同じ状況を反復し、結果を変える",
    description: "似た場所・人物・状況を繰り返し、毎回の結果や力関係だけを変えます。",
    principle: "反復によって観客に型を覚えさせ、型が崩れた瞬間に変化を強く感じさせます。", why: "比較対象があるため、小さな違いが大きな意味を持ちます。", genres: ["ドラマ", "コメディ", "スポーツ"],
    original: (r, s) => `同じ場所・人物の組み合わせが Scene ${s.join("・")} で繰り返され、結果が変わる`,
    structural: "同じ状況を繰り返し、勝敗や力関係だけを変える構造", abstract: "既視感のある状況を反復し、結果の差で人物の変化を示す",
    detect: (a) => { const g = new Map<string, ReferenceScene[]>(); a.scenes.forEach((s) => { const k = `${s.location}|${s.characters.slice(0, 2).sort().join(",")}`; (g.get(k) ?? g.set(k, []).get(k)!).push(s); }); const best = [...g.values()].filter((v) => v.length >= 3 && Math.max(...v.map((x) => x.metrics.advantage)) - Math.min(...v.map((x) => x.metrics.advantage)) >= 0.4).sort((x, y) => y.length - x.length)[0]; return best ? { scenes: mid(best.map((s) => s.sceneNumber), 6), strength: Math.min(1, best.length / 5) } : null; },
    find: (o) => { const cnt = new Map<string, number>(); o.scenes.forEach((s) => cnt.set(s.location, (cnt.get(s.location) ?? 0) + 1)); return o.scenes.filter((s) => (cnt.get(s.location) ?? 0) >= 2).map((s) => ({ scene: s, score: (cnt.get(s.location) ?? 0) + 0.3, reason: "同じ場所が複数回使われており、結果を変えた反復にできる可能性があります。" })); },
    core: [(c) => `参考作品のように、${c.scene.location || "同じ場所"}での状況を繰り返し、${c.prot}の結果だけを変える`, (c) => `${c.scene.location || "既出の場所"}での状況を再び用い、今回は${c.prot}の立場や結果を変える`, () => "同じ状況を再登場させ、結果の違いによって変化を示す"],
  },
  {
    key: "midpoint-reversal", name: "中盤で一度主人公を成功させる", applyTitle: "Midpointで一度主人公を成功させる",
    description: "中盤で主人公に大きな成功を与え、その後の転落や価値の反転につなげます。",
    principle: "高く上げてから落とすことで、後半の危機を強く感じさせます。", why: "成功が大きいほど、その後に失うものも大きくなり、後半の緊張が高まります。", genres: ["ドラマ", "スリラー", "スポーツ"],
    original: (r, s) => `Scene ${s[0]}（${sceneOf(r, s[0])?.heading}）付近で主人公が優勢になる`,
    structural: "中盤で主人公が優勢になり、その後に状況が反転する構造", abstract: "中盤の成功を、後半の喪失を大きくするための土台として置く",
    detect: (a) => { const m = a.scenes.filter((s) => pos(a, s) >= 0.4 && pos(a, s) <= 0.62).sort((x, y) => y.metrics.advantage - x.metrics.advantage)[0]; if (!m || m.metrics.advantage < 0.2) return null; const after = a.scenes.filter((s) => pos(a, s) > pos(a, m) + 0.05 && pos(a, s) < 0.85); const mean = after.reduce((x, s) => x + s.metrics.advantage, 0) / Math.max(1, after.length); return mean + 0.15 < m.metrics.advantage ? { scenes: [m.sceneNumber], strength: 0.7 } : null; },
    find: (o) => o.scenes.filter((s) => pos(o, s) >= 0.38 && pos(o, s) <= 0.62).map((s) => ({ scene: s, score: 2 - Math.abs(pos(o, s) - 0.5) * 4 - s.metrics.advantage * 0.5, reason: "全体の中央付近にあり、成功や価値の反転を置く位置として検討できます。" })),
    core: [(c) => `参考作品の中盤のように、${c.prot}に一度大きな成功を与え、その後の反転に備える`, (c) => `ここで${c.prot}が目的に大きく近づく成功を収める。ただし後半で揺らぐ要素を一つ残す`, () => "中盤で主人公に成功を与え、後半の喪失を大きくする土台にする"],
  },
  {
    key: "protagonist-choice", name: "クライマックスでは主人公自身に選択させる", applyTitle: "クライマックスで主人公に選択させる",
    description: "決着を偶然や他者の介入に任せず、主人公が自ら選んだ行動で迎えます。",
    principle: "物語の変化は、主人公の選択として表れたときに最も説得力を持ちます。", why: "それまでの葛藤の答えが主人公の意思として示され、観客が結末に納得しやすくなります。", genres: ["ドラマ", "アクション", "スリラー"],
    original: (r, s) => `クライマックス（Scene ${s[0]}）で${prot(r)}が決定的な行動・発言をする`,
    structural: "最終局面で主人公が自分の意思で選び、結末を決める構造", abstract: "葛藤の答えを、主人公の能動的な選択として結末で示す",
    detect: (a) => { const n = pt(a, "Climax"); const sc = n ? sceneOf(a, n) : undefined; const p = prot(a); if (!sc) return null; const mine = sc.elements.filter((e) => e.type === "dialogue" && e.speaker?.toLowerCase() === p.toLowerCase()); return mine.some((e) => L.countHits(e.text, L.DECISION_WORDS) > 0) || sc.characters[0] === p ? { scenes: [sc.sceneNumber], strength: 0.6 } : null; },
    find: (o) => o.scenes.filter((s) => pos(o, s) >= 0.82).map((s) => ({ scene: s, score: s.metrics.tension + (pos(o, s) > 0.88 ? 0.5 : 0), reason: "終盤のシーンで、主人公自身の選択として決着を描く位置の候補です。" })),
    core: [(c) => `参考作品の終盤のように、${c.prot}自身の選択が結末を決める形にする`, (c) => `${c.prot}が外からの助けに頼らず、自分の意思で選び取った行動で局面を決める`, () => "結末を、主人公の能動的な選択として提示する"],
  },
  tagDef("エスカレーション", 2, {
    key: "escalation", name: "対立を段階的にエスカレートさせる", applyTitle: "対立をエスカレートさせる",
    description: "連続するシーンで、対立の強度・代償・リスクを一段ずつ引き上げます。",
    principle: "同じ種類の衝突でも、賭け金が上がると体験は別物になります。", why: "観客は「次はもっと悪くなる」と予期し、先を見たくなります。", genres: ["スリラー", "ドラマ", "スポーツ"],
    original: (r, s) => `Scene ${s.join("・")} で緊張度が段階的に上昇する`, structural: "連続する場面で対立の強度が段階的に上がる構造", abstract: "賭け金を段階的に引き上げ、後戻りしにくくする",
    find: (o) => o.scenes.map((s, i) => ({ scene: s, prev: o.scenes[i - 1] })).filter((x) => x.prev && pos(o, x.scene) > 0.25 && pos(o, x.scene) < 0.8 && x.scene.metrics.tension <= x.prev.metrics.tension + 0.02).map((x) => ({ scene: x.scene, score: 1 + (x.prev!.metrics.tension - x.scene.metrics.tension) + x.scene.characters.length * 0.1, reason: "前のシーンから緊張度が上がっておらず、対立を強められる余地があります。" })),
    core: [(c) => `参考作品の連続した衝突のように、${c.scene.title || "このシーン"}で対立の代償を前のシーンより一段重くする`, (c) => `前のシーンよりも${c.prot}が失うものを大きくし、対立を一段強める`, () => "連続する場面で、対立の代償を段階的に引き上げる"],
  }),
  tagDef("沈黙", 3, {
    key: "silence", name: "沈黙・間で感情と力関係を伝える", applyTitle: "沈黙・間を使う",
    description: "言葉を止める瞬間や間を意図的に置き、言えないことを伝えます。",
    principle: "言葉の不在は、言葉以上に意味を持つことがあります。", why: "観客は沈黙の理由を補完しようとし、場面への集中が高まります。", genres: ["ドラマ", "ロマンス", "スリラー"],
    original: (r, s) => `Scene ${s.slice(0, 3).join("・")} などで間・沈黙が使われる`, structural: "会話の要所に間を置く構造", abstract: "言葉が途切れる瞬間に、感情や力関係を託す",
    find: (o) => o.scenes.filter((s) => s.metrics.kind === "conflict" || s.metrics.kind === "dialogue").map((s) => ({ scene: s, score: s.metrics.dialogueRatio + s.metrics.tension - L.countHits(s.originalText, L.SILENCE_WORDS) * 0.2, reason: "会話が続く場面で、重要な瞬間に間を置く余地があります。" })),
    core: [(c) => `参考作品の会話の間のように、核心に触れた瞬間に${c.prot}が言葉を失う`, (c) => `核心に触れられた瞬間、${c.prot}は答えられず、数秒の間が生まれる`, () => "決定的な瞬間に言葉を止め、間に意味を託す"],
  }),
  tagDef("セットアップ", 2, {
    key: "setup-payoff", name: "セットアップとペイオフで物語を回収する", applyTitle: "伏線（セットアップ→ペイオフ）を設計する",
    description: "序盤で置いた小さな要素を、終盤で意味を変えて回収します。",
    principle: "最初は何気なかったものが、後で重い意味を持つと、物語に必然性が生まれます。", why: "観客に「あれがここにつながった」という発見の快感を与えます。", genres: ["ミステリー", "ドラマ", "コメディ"],
    original: (r, s) => `Scene ${s[0]} で置かれた要素が後のシーンで再登場する`, structural: "序盤の小さな要素を終盤で意味を変えて回収する構造", abstract: "序盤に置いた要素を、終盤で新しい意味を持たせて回収する",
    find: (o, p) => { const open = p.foreshadowing.filter((f) => f.status !== "回収済み"); const late = o.scenes.filter((s) => pos(o, s) >= 0.6); return late.map((s) => ({ scene: s, score: open.length * 0.6 + (s.techniques.includes("ペイオフ") ? 0 : 0.4) + pos(o, s), reason: open.length ? `未回収の伏線が${open.length}件あり、回収の候補になります。` : "終盤で、序盤の要素を新しい意味で再登場させる余地があります。" })); },
    core: [(c) => `参考作品の再登場する要素のように、序盤の小物や台詞を${c.scene.title || "このシーン"}で別の意味にして回収する`, (c) => `序盤に置いた要素を${c.scene.title || "このシーン"}で再登場させ、意味を反転させる`, () => "序盤に置いた要素を、終盤で意味を変えて回収する"],
  }),
  tagDef("タイムリミット", 3, {
    key: "time-limit", name: "タイムリミットで緊張を持続させる", applyTitle: "タイムリミットを導入する",
    description: "期限や残り時間を明示し、行動の猶予を削っていきます。",
    principle: "時間の制約は、選択を急がせ、人物の本性を露わにします。", why: "観客が結果までの時間を意識し、緊張が持続します。", genres: ["スリラー", "アクション", "ビジネス"],
    original: (r, s) => `Scene ${s.slice(0, 3).join("・")} などで期限・時間の制約が示される`, structural: "期限を設定し、行動の猶予を削っていく構造", abstract: "時間の制約によって、選択を急がせる",
    find: (o) => o.scenes.filter((s) => pos(o, s) >= 0.45 && pos(o, s) <= 0.85).map((s) => ({ scene: s, score: 1 - s.metrics.tension + (s.techniques.includes("タイムリミット") ? -1 : 0.3), reason: "中盤〜終盤で緊張が低めの場面です。期限を示すと緊張を保てる可能性があります。" })),
    core: [(c) => `参考作品のように、${c.prot}の行動に明確な期限（あと何時間か）を設ける`, (c) => `${c.prot}の目的に期限を設け、${c.scene.title || "この場面"}で残り時間を示す`, () => "目的達成までの時間を限定し、選択を急がせる"],
  }),
  tagDef("権力差", 2, {
    key: "power-gap", name: "権力差で会話に緊張をつくる", applyTitle: "権力差を会話に取り入れる",
    description: "立場や権限の差を会話の前提に置き、言えることと言えないことを分けます。",
    principle: "力関係の差があると、言葉の裏に利害や恐れが生まれます。", why: "同じ言葉でも、誰が誰に言うかで意味が変わり、サブテキストが生まれます。", genres: ["ドラマ", "ビジネス", "サスペンス"],
    original: (r, s) => `Scene ${s.slice(0, 3).join("・")} などで立場の差が会話を支配する`, structural: "立場の差が会話の主導権を決める構造", abstract: "力関係の差を会話の前提にし、言える言葉を制限する",
    find: (o) => o.scenes.filter((s) => s.characters.length >= 2).map((s) => ({ scene: s, score: s.metrics.dialogueRatio + (s.techniques.includes("権力差") ? -0.5 : 0.3), reason: "二人以上の会話があり、立場の差を明確にすることで緊張を生める可能性があります。" })),
    core: [(c) => `参考作品のように、${c.prot}と${c.other}の立場の差をはっきりさせ、会話の主導権を一方に偏らせる`, (c) => `${c.prot}より${c.other}の立場を上に置き、${c.prot}が言いたいことを言えない状況にする`, () => "立場の差によって、言える言葉を制限する"],
  }),
  tagDef("視覚的説明", 2, {
    key: "visual-exposition", name: "視覚的な見せ方で説明を省く", applyTitle: "説明を視覚表現へ置き換える",
    description: "情報を台詞で説明せず、物・光景・動作として見せます。",
    principle: "映像は語るより早く、強く伝えられます。", why: "観客が自分で気づく体験になり、説明臭さが減ります。", genres: ["ドラマ", "サスペンス", "SF"],
    original: (r, s) => `Scene ${s.slice(0, 3).join("・")} などで物や光景が情報を伝える`, structural: "台詞を使わず、物や光景で状況を伝える構造", abstract: "説明を、観客が目にするものへ置き換える",
    find: (o) => o.scenes.filter((s) => s.metrics.kind === "exposition" || s.metrics.dialogueRatio > 0.6).map((s) => ({ scene: s, score: s.metrics.dialogueRatio, reason: "会話中心の場面で、説明を映像（物・光景）で見せる余地があります。" })),
    core: [(c) => `参考作品のように、${c.scene.title || "この場面"}の説明を台詞ではなく具体的な物や光景で見せる`, (c) => `台詞で説明している内容を、${c.prot}が目にする物や光景で伝える`, () => "情報を台詞ではなく視覚要素で提示する"],
  }),
  tagDef("逆転", 2, {
    key: "reversal", name: "逆転で期待を裏切る", applyTitle: "逆転を仕込む",
    description: "優勢・劣勢や状況が一気に入れ替わる瞬間を置きます。",
    principle: "予測を裏切りつつ、振り返ると必然だった、という逆転が最も効果的です。", why: "観客の予測を更新させ、物語への集中を再点火します。", genres: ["スリラー", "コメディ", "ドラマ"],
    original: (r, s) => `Scene ${s.slice(0, 3).join("・")} などで優劣が入れ替わる`, structural: "優劣・状況が一気に入れ替わる構造", abstract: "予測を更新させる逆転を、必然に見える形で置く",
    find: (o) => o.scenes.filter((s) => pos(o, s) > 0.2 && pos(o, s) < 0.9).map((s) => ({ scene: s, score: 1 - Math.abs((s.metrics.endAdv ?? 0) - (s.metrics.startAdv ?? 0)), reason: "場面内の優劣の変化が小さく、逆転を入れる余地があります。" })),
    core: [(c) => `参考作品のように、${c.scene.title || "この場面"}の終盤で優劣を入れ替える`, (c) => `場面の終わりで、${c.prot}と${c.other}の優劣を入れ替える一手を置く`, () => "場面の終盤で、優劣や状況を反転させる"],
  }),
  tagDef("質問回避", 3, {
    key: "question-evasion", name: "質問に直接答えさせず、本音を隠す", applyTitle: "質問回避で本音を隠す",
    description: "問われたことに答えず、話題をずらすことで、答えたくない理由を浮かび上がらせます。",
    principle: "答えないことは、答えそのものより多くを語ります。", why: "観客は回避の理由を推測し、人物の内面に踏み込めます。", genres: ["ドラマ", "ミステリー", "ロマンス"],
    original: (r, s) => `Scene ${s.slice(0, 3).join("・")} などで質問に直接答えない`, structural: "質問に答えず、話題を逸らす構造", abstract: "問いを回避させ、本音を答えの外側に置く",
    find: (o) => o.scenes.filter((s) => s.elements.filter((e) => e.type === "dialogue").length >= 4).map((s) => ({ scene: s, score: s.metrics.dialogueRatio + (s.techniques.includes("質問回避") ? -0.5 : 0.3), reason: "会話量が十分にあり、質問回避を入れる余地があります。" })),
    core: [(c) => `参考作品の会話のように、${c.other}の質問に${c.prot}が正面から答えず話題を逸らす`, (c) => `${c.other}の核心を突く質問に、${c.prot}は別の話題で応じる`, () => "核心の問いに答えさせず、話題を別へ移す"],
  }),
];

export const technique = (key: string) => DEFS.find((d) => d.key === key);
export const TECHNIQUE_DEFS = DEFS;

export function extractTechniques(a: ScriptAnalysis): Technique[] {
  const out: Technique[] = [];
  for (const d of DEFS) {
    const hit = d.detect(a);
    if (!hit) continue;
    out.push({
      id: d.key, key: d.key, name: d.name, description: d.description, sourceScenes: hit.scenes, principle: d.principle, why: d.why, applicableGenres: d.genres,
      abstractionLevel: 2, strength: Math.round(hit.strength * 100) / 100, original: d.original(a, hit.scenes), structural: d.structural, abstract: d.abstract,
    });
  }
  return out.sort((x, y) => y.strength - x.strength);
}

// ---------- 自作への応用 ----------
export function findCandidates(def: Def, own: ScriptAnalysis, project: ScreenplayProject): Candidate[] {
  const ranked = def.find(own, project).sort((a, b) => b.score - a.score).slice(0, 5);
  return ranked.map((x, i) => ({ sceneId: x.scene.id, sceneNumber: x.scene.sceneNumber, fit: i < 2 ? "高" : i < 4 ? "中" : "低", reason: x.reason }));
}

export function makeCtx(ref: ScriptAnalysis, own: ScriptAnalysis, scene: ScreenplayScene, project: ScreenplayProject): Ctx {
  const p = prot(own);
  const other = scene.characters.map((id) => project.characters.find((c) => c.id === id)?.name).find((n) => n && n !== p) ?? "相手役";
  return { refTitle: ref.title, refProt: prot(ref), refOpp: opp(ref), prot: p, other, scene };
}

export function buildSuggestion(def: Def, ctx: Ctx, level: 1 | 2 | 3, referenceId: string, reason: string): ApplicationSuggestion {
  const core = def.core[level - 1](ctx);
  const patch: ApplicationPatch = { fieldUpdates: def.fields?.(ctx.scene) ?? {}, insert: [{ type: "action", text: `（案）${core}。` }] };
  return {
    id: nanoid(), referenceId, referenceTechnique: def.name, techniqueKey: def.key, targetScene: ctx.scene.id, reason,
    suggestion: `一案として、${core}という方向も考えられます。`, patch, level, similarityScore: 0,
    similarity: { setting: 0, structure: 0, dialogue: 0, relation: 0 }, status: "proposed", createdAt: Date.now(),
  };
}

// ---------- 会話テンプレートの適用 ----------
const LINES: Record<string, string[]> = {
  "質問する": ["{topic}について、はっきり聞いておきたい。", "ひとつ確かめたいことがある。"],
  "問い返す": ["どうしてそんなことを聞くの？", "それを聞くってことは、何か知っているの？"],
  "質問を言い換える": ["言い方を変えるよ。本当はどうしたいの？", "もう一度聞く。あなたは何を望んでいる？"],
  "回避する": ["今はその話をしたくない。", "それより先に、片づけることがある。"],
  "拒否する": ["それには答えられない。", "できない。わかってほしい。"],
  "命令する": ["こっちを見て。", "今、決めて。"],
  "感情を表明する": ["正直に言うと、こたえている。"],
  "謝罪する": ["悪かった。"], "脅す": ["このままでは済まなくなる。"], "答える": ["……そうだ。"],
  "情報・意見を述べる": ["私はこう考えている。"],
};

export function applyDialoguePattern(pattern: DialoguePattern, aName: string, bName: string, scene: ScreenplayScene, referenceId: string, refTitle: string): ApplicationSuggestion {
  const topic = scene.purpose || scene.logline || "その件";
  const insert: ApplicationPatch["insert"] = [];
  const used = new Map<string, number>();
  let lastSpeaker = "";
  for (const m of pattern.structure) {
    const name = m.speaker === "A" ? aName : bName;
    if (m.move === "沈黙する") { insert.push({ type: "parenthetical", text: "（間）" }); continue; }
    const variants = LINES[m.move] ?? LINES["情報・意見を述べる"];
    const n = used.get(m.move) ?? 0; used.set(m.move, n + 1);
    if (name !== lastSpeaker) insert.push({ type: "character", text: name });
    lastSpeaker = name;
    insert.push({ type: "dialogue", text: variants[n % variants.length].replace("{topic}", topic) });
  }
  return {
    id: nanoid(), referenceId, referenceTechnique: `会話テンプレート（${refTitle} Scene ${pattern.sourceScene}）`, techniqueKey: `dialogue:${pattern.id}`, targetScene: scene.id,
    reason: `会話の力学「${pattern.subtextPattern}」だけを用い、セリフ自体は参考作品から使っていません。`,
    suggestion: `一案として、${aName}と${bName}の会話を「${pattern.description.replace(/A:/g, "A=").replace(/B:/g, "B=")}」の流れで組み立てる方向も考えられます。セリフは仮置きなので、人物の口調に合わせて書き換えてください。`,
    patch: { fieldUpdates: {}, insert }, level: 3, similarityScore: 0, similarity: { setting: 0, structure: 0, dialogue: 0, relation: 0 }, status: "proposed", createdAt: Date.now(),
  };
}

// ---------- 類似度チェック ----------
const latinGrams = (s: string, n = 4) => { const t = s.toLowerCase().match(/[a-z']+/g) ?? []; const g = new Set<string>(); for (let i = 0; i + n <= t.length; i++) g.add(t.slice(i, i + n).join(" ")); return g; };

export function checkSimilarity(text: string, ref: ScriptAnalysis, level: number) {
  const lower = text.toLowerCase();
  const locs = [...new Set(ref.scenes.map((s) => s.location.toLowerCase()))].filter((l) => l.length >= 4);
  const locHits = locs.filter((l) => lower.includes(l)).length;
  const setting = Math.min(1, locHits * 0.7);
  const refGrams = new Set<string>();
  ref.scenes.forEach((s) => s.elements.filter((e) => e.type === "dialogue").forEach((e) => latinGrams(e.text).forEach((g) => refGrams.add(g))));
  const mine = latinGrams(text);
  let overlap = 0; mine.forEach((g) => { if (refGrams.has(g)) overlap++; });
  const dialogue = Math.min(1, overlap * 0.5);
  const names = ref.characters.map((c) => c.name.toLowerCase()).filter((n) => n.length >= 3);
  const nameHits = names.filter((n) => lower.includes(n)).length;
  const refTitleHit = ref.title && lower.includes(ref.title.toLowerCase()) ? 0.2 : 0;
  const relation = Math.min(1, nameHits * 0.8);
  const structure = Math.min(1, ({ 1: 0.55, 2: 0.35, 3: 0.15 } as Record<number, number>)[level] + refTitleHit + (/参考作品/.test(text) ? 0.05 : 0));
  const score = Math.max(setting, dialogue, relation, structure);
  return { similarity: { setting, structure, dialogue, relation }, score };
}

export const simLabel = (v: number) => (v >= 0.6 ? "高類似" : v >= 0.3 ? "中類似" : "低類似");
export const simClass = (v: number) => (v >= 0.6 ? "high" : v >= 0.3 ? "mid" : "low");

export function suggestionText(s: ApplicationSuggestion) { return [s.suggestion, ...s.patch.insert.map((i) => i.text)].join("\n"); }
export function evaluate(s: ApplicationSuggestion, ref: ScriptAnalysis): ApplicationSuggestion {
  const { similarity, score } = checkSimilarity(suggestionText(s), ref, s.level);
  return { ...s, similarity, similarityScore: Math.round(score * 100) / 100 };
}
