export type StructureType = "kishotenketsu" | "three-act";

export interface Novel {
  id: string;
  title: string;
  text: string;
  totalPages: number;
  structureType: StructureType;
  mode?: "novel" | "screenplay";
  screenplay?: ScreenplayProject;
  createdAt: number;
  updatedAt: number;
}

export type ScreenplayTemplate =
  | "three-act"
  | "kishotenketsu"
  | "jo-ha-kyu"
  | "eight-sequence"
  | "save-the-cat"
  | "free";

export type ScriptElementType =
  | "heading"
  | "action"
  | "character"
  | "dialogue"
  | "parenthetical"
  | "transition";

export interface Beat {
  id: string;
  text: string;
  order: number;
}

export interface ScriptElement {
  id: string;
  type: ScriptElementType;
  text: string;
}

export interface ScreenplayScene {
  id: string;
  sceneNumber: number;
  title: string;
  logline: string;
  act: string;
  location: string;
  time: string;
  characters: string[];
  purpose: string;
  obstacle: string;
  startState: string;
  endState: string;
  tags: string[];
  color: string;
  estimatedDuration: number;
  beats: Beat[];
  script: ScriptElement[];
  notes: string;
  pages: number;
  foreshadowingIds: string[];
}

export interface ScreenplayCharacter {
  id: string;
  name: string;
  reading: string;
  age: string;
  gender: string;
  role: string;
  profile: string;
  personality: string;
  goal: string;
  weakness: string;
  past: string;
  background: string;
  notes: string;
}

export interface Foreshadowing {
  id: string;
  title: string;
  description: string;
  firstScene: string;
  returnScenes: string[];
  payoffScene: string;
  status: "未回収" | "進行中" | "回収済み";
}

export interface ScreenplayPageSettings {
  paperSize: "A4" | "Letter";
  margin: number;
  font: string;
  fontSize: number;
  lineSpacing: number;
  pageNumbers: boolean;
}

export interface ScreenplayProject {
  structureTemplate: ScreenplayTemplate;
  customActs?: string[];
  scenes: ScreenplayScene[];
  characters: ScreenplayCharacter[];
  foreshadowing: Foreshadowing[];
  pageSettings: ScreenplayPageSettings;
  stage: string;
  materials: string;
}

export interface NovelsState {
  novels: Novel[];
  activeId: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: number;
}
