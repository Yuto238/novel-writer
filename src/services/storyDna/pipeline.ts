import type { ReferenceScript, ScreenplayProject } from "../../types";
import { analyzeCharacters, analyzeDialogue, buildOverview, buildScenes, computeDNA } from "./analyze";
import { analyzeOwn, compareScripts } from "./compare";
import { extractScript } from "./pdf";
import { analyzeStructure } from "./structure";
import { extractTechniques, toAnalysis } from "./techniques";

export const STAGES = ["PDF読み込み", "テキスト抽出", "シーン解析", "登場人物解析", "構成分析", "セリフ分析", "技法抽出", "自作との比較"] as const;
const tick = () => new Promise<void>((r) => setTimeout(r, 40));

export const titleFromFile = (name: string) => name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();

export function newReference(file: File): ReferenceScript {
  return {
    id: crypto.randomUUID(), title: titleFromFile(file.name) || "無題の脚本", file: { name: file.name, size: file.size }, pageCount: 0, language: "en", createdAt: Date.now(),
    analysisStatus: "analyzing", progress: 0, warnings: [], tags: [], scenes: [], characters: [], relationships: [], structure: {}, techniques: [], dialoguePatterns: [], dialogues: [], dialogueTendencies: [],
  };
}

// 失敗しても、そこまでに得られたデータは onUpdate 経由で保持される
export async function analyzeReference(base: ReferenceScript, blob: Blob, project: ScreenplayProject | undefined, onUpdate: (r: ReferenceScript) => void): Promise<ReferenceScript> {
  let cur: ReferenceScript = { ...base, analysisStatus: "analyzing", progress: 0, errorMessage: undefined, warnings: [] };
  const push = async (patch: Partial<ReferenceScript>) => { cur = { ...cur, ...patch }; onUpdate(cur); await tick(); };
  await push({});
  try {
    const ex = await extractScript(blob, (stage) => { cur = { ...cur, progress: stage }; onUpdate(cur); });
    await push({ progress: 2, pageCount: ex.pageCount, language: ex.language, warnings: ex.warnings });
    const { scenes, protagonist } = buildScenes(ex.scenes, { lang: ex.language, pageCount: ex.pageCount });
    await push({ progress: 3, scenes, tags: [`${ex.pageCount}ページ`] });
    void protagonist;
    const { characters, relationships } = analyzeCharacters(scenes, ex.language);
    await push({ progress: 4, characters, relationships });
    const structure = analyzeStructure(scenes);
    await push({ progress: 5, structure });
    const d = analyzeDialogue(scenes, ex.language, ex.pageCount);
    await push({ progress: 6, dialogues: d.dialogues, dialogueTendencies: d.tendencies, dialoguePatterns: d.patterns });
    const overview = buildOverview(cur.title, scenes, characters, structure["three-act"], ex.pageCount, ex.language);
    const analysis = { ...toAnalysis(cur), scenes, characters, structure };
    const techniques = extractTechniques(analysis);
    const scriptDNA = computeDNA(scenes, characters, d.tendencies, ex.pageCount);
    await push({ progress: 7, techniques, overview, scriptDNA, tags: [overview.genre, `${ex.pageCount}ページ`] });
    if (project) compareScripts(toAnalysis(cur), analyzeOwn(project, "自作"), project);
    await push({ progress: STAGES.length, analysisStatus: "done" });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const msg = err.code ? err.message! : `AI解析に失敗しました（${err.message ?? "不明なエラー"}）。読み込み済みのデータは保持されています。「再解析」でやり直せます。`;
    await push({ analysisStatus: "error", errorMessage: msg });
  }
  return cur;
}
