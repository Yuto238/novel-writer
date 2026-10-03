import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { nanoid } from "nanoid";
import type { RefElement, ScriptElementType } from "../../types";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type StoryDnaErrorCode = "encrypted" | "scanned" | "empty" | "too-large" | "read";
export class StoryDnaError extends Error {
  code: StoryDnaErrorCode;
  constructor(code: StoryDnaErrorCode, message: string) { super(message); this.code = code; }
}

export interface ParsedScene { heading: string; page: number; endPage: number; elements: RefElement[]; pages?: number; cast?: string[] }
export interface ExtractResult { pageCount: number; scenes: ParsedScene[]; warnings: string[]; language: string }

interface Line { text: string; x: number; y: number; page: number; gap: boolean }

export const MAX_PAGES = 600;
export const WARN_PAGES = 300;

const HEADING_RE = /^(?:\d+[A-Z]{0,2}[.)]?\s+)?(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\.?|EXT\.?|I\/E\.?|EST\.?)\s+(.*)$/;
const TRANSITION_RE = /^(FADE (IN|OUT|TO BLACK)|CUT (TO|BACK)|SMASH CUT|MATCH CUT|DISSOLVE TO|JUMP CUT|WIPE TO|INTERCUT|BACK TO|THE END|CUT TO BLACK)/;
const PAGE_NOISE_RE = /^(\d{1,3}[.)]?|\(?CONTINUED:?\)?(\s*\(\d+\))?|\d+\s+CONTINUED:?|CONTINUED:?\s+\(\d+\)|\(MORE\)|MORE)$/i;

export const isUpper = (s: string) => /[A-Z]/.test(s) && s === s.toUpperCase();

async function readLines(data: Uint8Array, onPage: (n: number, total: number) => void) {
  let doc: pdfjs.PDFDocumentProxy;
  try {
    doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === "PasswordException") throw new StoryDnaError("encrypted", "暗号化（パスワード保護）されたPDFです。保護を解除したPDFをアップロードしてください。");
    throw new StoryDnaError("read", `PDFを読み込めませんでした（${(e as Error)?.message ?? "不明なエラー"}）。`);
  }
  const pageCount = doc.numPages;
  if (pageCount > MAX_PAGES) throw new StoryDnaError("too-large", `ページ数が非常に多いため（${pageCount}ページ）解析できません。上限は${MAX_PAGES}ページです。`);
  const lines: Line[] = [];
  for (let p = 1; p <= pageCount; p++) {
    const page = await doc.getPage(p);
    const height = page.getViewport({ scale: 1 }).height;
    const content = await page.getTextContent();
    type Item = { str: string; x: number; y: number; w: number };
    const items: Item[] = [];
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim() && !it.str.includes(" ")) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width });
    }
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: Item[][] = [];
    for (const it of items) {
      const row = rows[rows.length - 1];
      if (row && Math.abs(row[0].y - it.y) <= 2.5) row.push(it); else rows.push([it]);
    }
    for (const row of rows) {
      row.sort((a, b) => a.x - b.x);
      let text = "";
      let end = row[0].x;
      for (const it of row) {
        if (text && it.x - end > 1.5 && !text.endsWith(" ") && !it.str.startsWith(" ")) text += " ";
        text += it.str; end = it.x + it.w;
      }
      const clean = text.replace(/\s+/g, " ").trim();
      if (!clean) continue;
      const y = row[0].y;
      const edge = y > height - 52 || y < 38;
      if (edge && PAGE_NOISE_RE.test(clean)) continue;
      lines.push({ text: clean, x: row[0].x, y, page: p, gap: false });
    }
    page.cleanup();
    onPage(p, pageCount);
  }
  // 行間の中央値より大きく空いた箇所を「空行あり」として記録
  const diffs: number[] = [];
  for (let i = 1; i < lines.length; i++) if (lines[i].page === lines[i - 1].page) diffs.push(lines[i - 1].y - lines[i].y);
  diffs.sort((a, b) => a - b);
  const pitch = diffs[Math.floor(diffs.length / 2)] || 12;
  for (let i = 0; i < lines.length; i++) {
    const prev = lines[i - 1];
    lines[i].gap = !prev || prev.page !== lines[i].page || prev.y - lines[i].y > pitch * 1.6;
  }
  return { lines, pageCount };
}

function mode(values: number[]) {
  const map = new Map<number, number>();
  for (const v of values) { const b = Math.round(v / 8) * 8; map.set(b, (map.get(b) ?? 0) + 1); }
  let best = NaN, bc = 0;
  for (const [k, c] of map) if (c > bc) { best = k; bc = c; }
  return { value: best, count: bc };
}

function classify(lines: Line[]): { line: Line; type: ScriptElementType }[] {
  const body = lines.filter((l) => l.text.length > 1);
  const actionX = mode(body.map((l) => l.x)).value;
  const upperX = body.filter((l) => isUpper(l.text) && l.text.length <= 40 && l.x > actionX + 60 && !TRANSITION_RE.test(l.text)).map((l) => l.x);
  const charMode = mode(upperX);
  const hasIndent = Number.isFinite(actionX) && upperX.length >= 20 && charMode.count >= 10;
  const characterX = charMode.value;
  const dialogueMode = hasIndent ? mode(body.filter((l) => l.x > actionX + 20 && l.x < characterX - 20 && !l.text.startsWith("(")).map((l) => l.x)) : { value: NaN, count: 0 };
  const dialogueX = dialogueMode.value;
  const indent = hasIndent && Number.isFinite(dialogueX);

  const out: { line: Line; type: ScriptElementType }[] = [];
  let inDialogue = false;
  for (const line of lines) {
    const t = line.text;
    let type: ScriptElementType;
    if (HEADING_RE.test(t) && isUpper(t.split(" - ")[0] ?? t) ) { type = "heading"; inDialogue = false; }
    else if (TRANSITION_RE.test(t) && isUpper(t.replace(/[.:]/g, "")) || (indent && isUpper(t) && /[:.]$/.test(t) && line.x > characterX + 50)) { type = "transition"; inDialogue = false; }
    else if (indent) {
      if (Math.abs(line.x - characterX) <= 18 && isUpper(t.replace(/\(.*?\)/g, "")) && t.length <= 45) { type = "character"; inDialogue = true; }
      else if (line.x >= dialogueX - 40 && line.x < characterX - 14 && inDialogue) type = t.startsWith("(") && t.endsWith(")") ? "parenthetical" : "dialogue";
      else { type = "action"; inDialogue = false; }
    } else {
      if (line.gap) inDialogue = false;
      const core = t.replace(/\(.*?\)/g, "").trim();
      if (!inDialogue && line.gap && isUpper(core) && core.length <= 34 && core.split(" ").length <= 4 && !/[.!?]$/.test(core)) { type = "character"; inDialogue = true; }
      else if (inDialogue) type = t.startsWith("(") && t.endsWith(")") ? "parenthetical" : "dialogue";
      else type = "action";
    }
    out.push({ line, type });
  }
  return out;
}

export function normalizeName(raw: string) {
  return raw.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

function buildScenes(classified: { line: Line; type: ScriptElementType }[], pageCount: number, warnings: string[]): ParsedScene[] {
  const elements: RefElement[] = [];
  let currentSpeaker = "";
  let prev: { type: ScriptElementType; gap: boolean } | undefined;
  for (const { line, type } of classified) {
    const last = elements[elements.length - 1];
    if (type === "character") { currentSpeaker = normalizeName(line.text); elements.push({ id: nanoid(), type, text: line.text, page: line.page, speaker: currentSpeaker }); }
    else if (type === "dialogue") {
      if (last && last.type === "dialogue" && !line.gap && last.speaker === currentSpeaker) last.text += " " + line.text;
      else elements.push({ id: nanoid(), type, text: line.text, page: line.page, speaker: currentSpeaker });
    } else if (type === "action") {
      if (last && last.type === "action" && !line.gap && prev?.type === "action") last.text += " " + line.text;
      else elements.push({ id: nanoid(), type, text: line.text, page: line.page });
    } else if (type === "heading") {
      currentSpeaker = "";
      const m = HEADING_RE.exec(line.text);
      elements.push({ id: nanoid(), type, text: m ? `${m[1]} ${m[2]}`.replace(/\s+\d+[A-Z]?$/, "") : line.text, page: line.page });
    } else elements.push({ id: nanoid(), type, text: line.text, page: line.page, speaker: type === "parenthetical" ? currentSpeaker : undefined });
    prev = { type, gap: line.gap };
  }
  const scenes: ParsedScene[] = [];
  for (const el of elements) {
    if (el.type === "heading") scenes.push({ heading: el.text, page: el.page, endPage: el.page, elements: [el] });
    else if (scenes.length) { const s = scenes[scenes.length - 1]; s.elements.push(el); s.endPage = el.page; }
  }
  if (scenes.length >= 3) return scenes;

  warnings.push("Scene Headingを十分に判別できませんでした。ページ単位の仮シーンに分割しています。");
  const chunks: ParsedScene[] = [];
  const per = Math.max(1, Math.ceil(pageCount / Math.max(8, Math.min(40, pageCount))));
  for (const el of elements) {
    if (el.type === "heading" && !chunks.length) { /* 見出しは本文としても保持 */ }
    const idx = Math.floor((el.page - 1) / per);
    let chunk = chunks.find((c) => c.page === idx * per + 1);
    if (!chunk) { chunk = { heading: `(見出し不明) p.${idx * per + 1}`, page: idx * per + 1, endPage: el.page, elements: [] }; chunks.push(chunk); }
    chunk.elements.push(el); chunk.endPage = el.page;
  }
  return chunks;
}

export async function extractScript(file: Blob, onStage?: (stage: number) => void): Promise<ExtractResult> {
  onStage?.(0);
  const data = new Uint8Array(await file.arrayBuffer());
  onStage?.(1);
  const { lines, pageCount } = await readLines(data, () => undefined);
  const chars = lines.reduce((s, l) => s + l.text.length, 0);
  if (chars < 200 || chars / pageCount < 120) {
    throw new StoryDnaError(chars === 0 ? "scanned" : "empty", chars === 0
      ? "テキストを取得できませんでした。スキャン画像のPDFの可能性があります。OCR済みのPDFをご利用ください。"
      : "PDFから十分なテキストを取得できませんでした。OCR済みのテキストPDFをご利用ください。");
  }
  onStage?.(2);
  const warnings: string[] = [];
  const jp = lines.filter((l) => /[\u3040-\u30ff\u4e00-\u9fff]/.test(l.text)).length / lines.length;
  const classified = classify(lines);
  const scenes = buildScenes(classified, pageCount, warnings);
  if (!scenes.length) throw new StoryDnaError("empty", "シーンを構成できるテキストが見つかりませんでした。");
  if (!classified.some((c) => c.type === "dialogue")) warnings.push("セリフを判別できませんでした。脚本フォーマットでないPDFの可能性があります。");
  return { pageCount, scenes, warnings, language: jp > 0.3 ? "ja" : "en" };
}
