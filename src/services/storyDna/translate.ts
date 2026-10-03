import type { RefElement, ReferenceScene, TranslationMode } from "../../types";
import { LOCATION_JA, TIME_JA, TRANSITION_JA, WORD_JA } from "./lexicon";

export interface LlmSettings { endpoint: string; apiKey: string; model: string }
const LLM_KEY = "storydna.llm";
export const loadLlm = (): LlmSettings => {
  try { return { endpoint: "https://api.openai.com/v1", apiKey: "", model: "gpt-4o-mini", ...JSON.parse(localStorage.getItem(LLM_KEY) ?? "{}") }; } catch { return { endpoint: "https://api.openai.com/v1", apiKey: "", model: "gpt-4o-mini" }; }
};
export const saveLlm = (s: LlmSettings) => localStorage.setItem(LLM_KEY, JSON.stringify(s));

export const MODE_LABELS: Record<TranslationMode, string> = { literal: "直訳", natural: "自然な日本語", screenplay: "脚本として自然な日本語" };
export type Provider = "llm" | "browser" | "glossary";
export const PROVIDER_LABELS: Record<Provider, string> = { llm: "AI翻訳", browser: "ブラウザ内蔵翻訳", glossary: "簡易辞書訳（粗訳）" };

const sortedPhrases = Object.keys(LOCATION_JA).sort((a, b) => b.length - a.length);

export function translateHeading(text: string) {
  const m = /^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\.?|EXT\.?|I\/E\.?|EST\.?)\s+(.*)$/i.exec(text);
  if (!m) return text;
  const parts = m[2].split(/\s+[-–—]\s+/);
  const loc = (s: string) => { let out = s.toLowerCase(); for (const p of sortedPhrases) out = out.replace(new RegExp(`\\b${p}\\b`, "g"), LOCATION_JA[p]); return /[a-z]/.test(out) ? `${s}` : out.toUpperCase() === out ? out : out; };
  const rendered = parts.map((p, i) => {
    const t = TIME_JA[p.trim().toLowerCase()];
    if (i > 0 && t) return `${p.trim()}（${t}）`;
    const jp = loc(p.trim());
    return jp === p.trim() ? p.trim() : `${p.trim()}（${jp}）`;
  });
  return `${m[1]} ${rendered.join(" - ")}`;
}

export function translateTransition(text: string) {
  const key = text.trim().toUpperCase();
  const gloss = TRANSITION_JA[key] ?? Object.entries(TRANSITION_JA).find(([k]) => key.startsWith(k.replace(/[:.]$/, "")))?.[1];
  return gloss ? `${text}（${gloss}）` : text;
}

export function glossTranslate(text: string) {
  const out: string[] = [];
  const isJa = (s: string) => /[^\x00-\x7f]/.test(s);
  for (const tok of text.replace(/[’‘]/g, "'").split(/([A-Za-z']+)/)) {
    if (!tok) continue;
    if (/^[A-Za-z']+$/.test(tok)) {
      const jp = WORD_JA[tok.toLowerCase().replace(/'s$/, "")];
      if (jp === "") continue;
      out.push(jp ?? tok);
    } else out.push(tok.replace(/\.{3}|…/g, "…").replace(/\?/g, "？").replace(/!/g, "！").replace(/,/g, "、").replace(/\./g, "。").replace(/--|—/g, "──").replace(/\s+/g, " "));
  }
  let res = "";
  for (const p of out) {
    const t = p.trim(); if (!t) continue;
    res += res && (!isJa(res.slice(-1)) && !isJa(t[0]) && /[A-Za-z]/.test(res.slice(-1)) && /[A-Za-z]/.test(t[0])) ? " " + t : t;
  }
  return res.trim();
}

interface BrowserTranslator { translate: (t: string) => Promise<string> }
let browserTranslator: BrowserTranslator | null | undefined;
async function getBrowserTranslator() {
  if (browserTranslator !== undefined) return browserTranslator;
  const probe = async () => {
    const T = (globalThis as unknown as { Translator?: { availability: (o: object) => Promise<string>; create: (o: object) => Promise<BrowserTranslator> } }).Translator;
    if (T && (await T.availability({ sourceLanguage: "en", targetLanguage: "ja" })) === "available") return await T.create({ sourceLanguage: "en", targetLanguage: "ja" });
    return null;
  };
  try { browserTranslator = await Promise.race([probe(), new Promise<null>((r) => setTimeout(() => r(null), 2000))]); } catch { browserTranslator = null; }
  return browserTranslator;
}

async function llmTranslate(lines: string[], mode: TranslationMode, s: LlmSettings): Promise<string[]> {
  const style = { literal: "Translate literally and faithfully, sentence by sentence.", natural: "Translate into natural Japanese.", screenplay: "Translate into natural Japanese suitable for a screenplay: concise action lines in present tense, spoken-style dialogue." }[mode];
  const res = await fetch(`${s.endpoint.replace(/\/$/, "")}/chat/completions`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.apiKey}` },
    body: JSON.stringify({ model: s.model, temperature: 0.2, messages: [
      { role: "system", content: `You translate screenplay text from English to Japanese. ${style} Keep screenplay notation (INT., EXT., DAY, NIGHT, CUT TO:, FADE IN:, FADE OUT:, O.S., V.O., CONT'D) unchanged. Do not translate character names. Reply ONLY with a JSON array of strings with exactly the same length and order as the input array.` },
      { role: "user", content: JSON.stringify(lines) },
    ] }),
  });
  if (!res.ok) throw new Error(`翻訳APIがエラーを返しました（HTTP ${res.status}）`);
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content ?? "";
  const arr = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")) as unknown;
  if (!Array.isArray(arr) || arr.length !== lines.length) throw new Error("翻訳APIの応答形式が不正です");
  return arr.map(String);
}

export async function translateScene(scene: ReferenceScene, mode: TranslationMode, force = false): Promise<{ elements: RefElement[]; provider: Provider }> {
  const llm = loadLlm();
  const useLlm = Boolean(llm.apiKey);
  const bt = useLlm ? null : await getBrowserTranslator();
  const provider: Provider = useLlm ? "llm" : bt ? "browser" : "glossary";
  const todo = scene.elements.filter((e) => (e.type === "action" || e.type === "dialogue") && (force || !e.ja?.[mode]));
  let results: string[] = [];
  if (todo.length) {
    try {
      if (useLlm) {
        for (let i = 0; i < todo.length; i += 40) results.push(...await llmTranslate(todo.slice(i, i + 40).map((e) => e.text), mode, llm));
      } else if (bt) results = await Promise.all(todo.map((e) => bt.translate(e.text)));
      else results = todo.map((e) => glossTranslate(e.text));
    } catch (e) {
      throw new Error(`翻訳に失敗しました: ${(e as Error).message}`);
    }
  }
  const map = new Map(todo.map((e, i) => [e.id, results[i]]));
  const elements = scene.elements.map((e) => {
    const cached = e.ja?.[mode];
    let ja = map.get(e.id) ?? cached;
    if (ja === undefined) {
      if (e.type === "heading") ja = translateHeading(e.text);
      else if (e.type === "transition") ja = translateTransition(e.text);
      else if (e.type === "character") ja = e.text;
      else if (e.type === "parenthetical") ja = `(${glossTranslate(e.text.replace(/^\(|\)$/g, ""))})`;
    }
    return ja === undefined ? e : { ...e, ja: { ...e.ja, [mode]: ja } };
  });
  return { elements, provider };
}

export const formatTranslated = (e: RefElement, mode: TranslationMode) => {
  const ja = e.ja?.[mode];
  if (!ja) return "";
  return mode === "screenplay" && e.type === "dialogue" ? `「${ja}」` : ja;
};
