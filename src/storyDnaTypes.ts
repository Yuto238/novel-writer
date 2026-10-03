import type { ScreenplayScene, ScriptElementType } from "./types";

export type AnalysisStatus = "pending" | "analyzing" | "done" | "error";
export type TranslationMode = "literal" | "natural" | "screenplay";
export type StructureMethod = "three-act" | "save-the-cat" | "eight-sequence" | "kishotenketsu" | "jo-ha-kyu" | "scene-change" | "free";
export type SceneKind = "action" | "dialogue" | "exposition" | "conflict" | "quiet";

export interface RefElement {
  id: string;
  type: ScriptElementType;
  text: string;
  page: number;
  speaker?: string;
  /** 翻訳キャッシュ（モード別） */
  ja?: Partial<Record<TranslationMode, string>>;
}

export interface SceneMetrics {
  tension: number;
  intensity: number;
  advantage: number;
  dialogueRatio: number;
  duration: number;
  kind: SceneKind;
  startTension?: number;
  endTension?: number;
  startAdv?: number;
  endAdv?: number;
}

export interface ReferenceScene {
  id: string;
  sceneNumber: number;
  heading: string;
  page: number;
  endPage: number;
  location: string;
  time: string;
  characters: string[];
  originalText: string;
  translation: string;
  elements: RefElement[];
  logline: string;
  purpose: string;
  protagonistGoal: string;
  obstacle: string;
  conflict: string;
  startState: string;
  endState: string;
  emotionalChange: string;
  storyRole: string;
  surfaceEvent: string;
  emotionalRole: string;
  relationChange: string;
  information: string;
  foreshadow: string;
  subtext: string;
  audienceEffect: string;
  techniques: string[];
  metrics: SceneMetrics;
}

export interface RefCharacter {
  name: string;
  role: string;
  sceneNumbers: number[];
  pages: number[];
  lineCount: number;
  screenTime: number;
  goal: string;
  desire: string;
  weakness: string;
  fear: string;
  opponent: string;
  change: string;
  function: string;
  arc: { sceneNumber: number; emotion: string; value: number }[];
}

export interface RefRelationship {
  a: string;
  b: string;
  aToB: string;
  bToA: string;
  timeline: { sceneNumber: number; score: number; label: string }[];
}

export interface StructurePoint {
  name: string;
  matched: boolean;
  sceneNumber?: number;
  page?: number;
  summary: string;
  reason: string;
}

export interface StructureAnalysis {
  method: StructureMethod;
  fit: "clear" | "partial" | "none";
  note: string;
  acts: { name: string; fromScene: number; toScene: number; fromPage: number; toPage: number }[];
  points: StructurePoint[];
}

export interface Technique {
  id: string;
  key: string;
  name: string;
  description: string;
  sourceScenes: number[];
  principle: string;
  why: string;
  applicableGenres: string[];
  abstractionLevel: 1 | 2 | 3;
  strength: number;
  original: string;
  structural: string;
  abstract: string;
}

export interface DialoguePattern {
  id: string;
  structure: { speaker: "A" | "B"; move: string }[];
  description: string;
  sourceScene: number;
  characters: string[];
  subtextPattern: string;
  saved: boolean;
}

export interface DialogueAnalysis {
  id: string;
  elementId: string;
  sceneNumber: number;
  speaker: string;
  addressee: string;
  original: string;
  surface: string;
  hidden: string;
  hiddenInfo: string;
  impression: string;
  emotion: string;
  goal: string;
  subtext: string;
  role: string;
}

export interface DialogueTendency { label: string; evidence: string; strength: number }

export interface ScriptDNA {
  desire: number;
  conflict: number;
  explanation: number;
  subtext: number;
  pace: number;
  foreshadow: number;
  emotionChange: number;
  humor: number;
}

export interface ScriptOverview {
  protagonist: string;
  goal: string;
  obstacle: string;
  conflict: string;
  genre: string;
  climaxPage: number;
  actCount: number;
  runtime: number;
  mainLocations: string[];
  summary: string;
}

export interface ReferenceScript {
  id: string;
  title: string;
  file: { name: string; size: number };
  pageCount: number;
  language: string;
  createdAt: number;
  analysisStatus: AnalysisStatus;
  progress: number;
  errorMessage?: string;
  warnings: string[];
  tags: string[];
  overview?: ScriptOverview;
  scenes: ReferenceScene[];
  characters: RefCharacter[];
  relationships: RefRelationship[];
  structure: Partial<Record<StructureMethod, StructureAnalysis>>;
  techniques: Technique[];
  dialoguePatterns: DialoguePattern[];
  dialogues: DialogueAnalysis[];
  dialogueTendencies: DialogueTendency[];
  scriptDNA?: ScriptDNA;
}

export interface ApplicationPatch {
  fieldUpdates: Partial<Pick<ScreenplayScene, "purpose" | "obstacle" | "endState" | "notes">>;
  insert: { type: ScriptElementType; text: string }[];
}

export interface ApplicationSuggestion {
  id: string;
  referenceId: string;
  referenceTechnique: string;
  techniqueKey: string;
  targetScene: string;
  reason: string;
  suggestion: string;
  patch: ApplicationPatch;
  level: 1 | 2 | 3;
  similarityScore: number;
  similarity: { setting: number; structure: number; dialogue: number; relation: number };
  status: "proposed" | "edited" | "adopted" | "rejected";
  createdAt: number;
}
