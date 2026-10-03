import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import {
  BookOpen, Check, ChevronDown, Clock3, Copy, FileText,
  Dna, Film, Flag, Focus, GripVertical, Lightbulb, MessageSquare, Plus, Printer,
  Pencil, Search, Settings2, Trash2, Users, X,
} from "lucide-react";
import type {
  Beat, Foreshadowing, Novel, ScreenplayCharacter, ScreenplayPageSettings,
  ScreenplayProject, ScreenplayScene, ScreenplayTemplate, ScriptElement,
  ScriptElementType,
} from "../types";

import StoryDnaWorkspace from "./storydna/StoryDnaWorkspace";

interface ScreenplayWorkspaceProps {
  novel: Novel;
  onUpdate: (updates: Partial<Novel>) => void;
  onSwitchToNovel: () => void;
}

export const templateActs: Record<ScreenplayTemplate, string[]> = {
  "three-act": ["ACT 1", "ACT 2", "ACT 3"],
  kishotenketsu: ["起", "承", "転", "結"],
  "jo-ha-kyu": ["序", "破", "急"],
  "eight-sequence": Array.from({ length: 8 }, (_, i) => `SEQUENCE ${i + 1}`),
  "save-the-cat": ["Opening", "Set-up", "Catalyst", "Debate", "Break into 2", "Fun & Games", "Midpoint", "Bad Guys Close In", "All Is Lost", "Finale"],
  free: ["ACT 1", "ACT 2", "ACT 3"],
};

const templateNames: Record<ScreenplayTemplate, string> = {
  "three-act": "三幕構成", kishotenketsu: "起承転結", "jo-ha-kyu": "序破急",
  "eight-sequence": "8シークエンス", "save-the-cat": "Save the Cat", free: "自由構成",
};
const viewTabs = [
  { id: "cards", label: "カード", icon: GripVertical },
  { id: "timeline", label: "タイムライン", icon: Clock3 },
  { id: "script", label: "脚本", icon: FileText },
  { id: "dialogue", label: "セリフ", icon: MessageSquare },
  { id: "analysis", label: "分析", icon: Film },
] as const;
type ViewTab = (typeof viewTabs)[number]["id"];
type ProjectSection = "script" | "characters" | "stage" | "foreshadowing" | "materials" | "storydna";
const colorOptions = ["#c66a5b", "#6889a8", "#d4ad51", "#6d9474", "#8c78a6", "#c18453"];
const elementLabels: Record<ScriptElementType, string> = {
  heading: "Scene Heading", action: "Action", character: "Character",
  dialogue: "Dialogue", parenthetical: "Parenthetical", transition: "Transition",
};
const nextElement: Record<ScriptElementType, ScriptElementType> = {
  heading: "action", action: "character", character: "dialogue",
  dialogue: "character", parenthetical: "dialogue", transition: "heading",
};

function blankScene(act: string, number: number): ScreenplayScene {
  return {
    id: nanoid(), sceneNumber: number, title: "新しいシーン", logline: "", act,
    location: "", time: "昼", characters: [], purpose: "", obstacle: "",
    startState: "", endState: "", tags: [], color: colorOptions[0],
    estimatedDuration: 3, beats: [], script: [], notes: "", pages: 1,
    foreshadowingIds: [],
  };
}

export function createScreenplayProject(): ScreenplayProject {
  const acts = templateActs["three-act"];
  const sceneSeeds = [
    ["主人公の日常", "主人公の現在の暮らしと、満たされていない願いを見せる。"],
    ["事件が起きる", "日常を揺るがす出来事が起き、主人公に選択を迫る。"],
    ["行動を始める", "主人公が後戻りできない一歩を踏み出す。"],
    ["最初の失敗", "新しい状況に挑むが、予想外の障害にぶつかる。"],
    ["対立が深まる", "相手との衝突が強まり、主人公の弱点が表面化する。"],
    ["最大の危機", "大切なものを失いかけ、主人公が自分を見つめ直す。"],
    ["最後の決断", "主人公が変化を選び、最後の作戦を実行する。"],
    ["クライマックス", "積み重ねた対立に決着をつける。"],
    ["新しい日常", "決断の結果と、主人公の変化を描く。"],
  ];
  const scenes = sceneSeeds.map(([title, logline], index) => ({
    ...blankScene(index < 3 ? acts[0] : index < 6 ? acts[1] : acts[2], index + 1),
    title, logline,
  }));
  return {
    structureTemplate: "three-act", scenes, characters: [], foreshadowing: [],
    pageSettings: { paperSize: "A4", margin: 20, font: "Noto Serif JP", fontSize: 12, lineSpacing: 1.5, pageNumbers: true },
    stage: "", materials: "",
  };
}

function cloneProject(project: ScreenplayProject): ScreenplayProject {
  return JSON.parse(JSON.stringify(project)) as ScreenplayProject;
}

function newCharacter(): ScreenplayCharacter {
  return { id: nanoid(), name: "新しい人物", reading: "", age: "", gender: "", role: "", profile: "", personality: "", goal: "", weakness: "", past: "", background: "", notes: "" };
}

function newForeshadowing(): Foreshadowing {
  return { id: nanoid(), title: "新しい伏線", description: "", firstScene: "", returnScenes: [], payoffScene: "", status: "未回収" };
}

export default function ScreenplayWorkspace({ novel, onUpdate, onSwitchToNovel }: ScreenplayWorkspaceProps) {
  const project = novel.screenplay ?? createScreenplayProject();
  const [view, setView] = useState<ViewTab>("cards");
  const [section, setSection] = useState<ProjectSection>("script");
  const [selectedSceneId, setSelectedSceneId] = useState(project.scenes[0]?.id ?? "");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [filter, setFilter] = useState({ character: "", location: "", time: "", act: "", color: "", tag: "", foreshadow: "" });
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);
  const [showSceneInfo, setShowSceneInfo] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analysis, setAnalysis] = useState<string[]>([]);
  const [dragSceneId, setDragSceneId] = useState<string | null>(null);
  const [dragBeatId, setDragBeatId] = useState<string | null>(null);
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [dialogueCharacter, setDialogueCharacter] = useState("");
  const [toast, setToast] = useState("");
  const undoStack = useRef<ScreenplayProject[]>([]);
  const redoStack = useRef<ScreenplayProject[]>([]);
  const projectRef = useRef(project);
  projectRef.current = project;

  useEffect(() => {
    if (!novel.screenplay) onUpdate({ screenplay: project, mode: "screenplay" });
  }, []);

  useEffect(() => {
    if (!project.scenes.some((scene) => scene.id === selectedSceneId)) {
      setSelectedSceneId(project.scenes[0]?.id ?? "");
    }
  }, [project.scenes, selectedSceneId]);

  const commit = (next: ScreenplayProject, record = true) => {
    if (record) {
      undoStack.current = [...undoStack.current.slice(-79), cloneProject(projectRef.current)];
      redoStack.current = [];
    }
    projectRef.current = next;
    onUpdate({ screenplay: next, mode: "screenplay" });
  };
  const undo = () => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(cloneProject(projectRef.current));
    commit(previous, false);
  };
  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(cloneProject(projectRef.current));
    commit(next, false);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault(); redo();
      } else if (event.key === "Escape") setFocused(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const scenes = project.scenes;
  const selectedScene = scenes.find((scene) => scene.id === selectedSceneId) ?? scenes[0];
  const totalDuration = scenes.reduce((sum, scene) => sum + (Number(scene.estimatedDuration) || 0), 0);
  const totalPages = scenes.reduce((sum, scene) => sum + (Number(scene.pages) || 0), 0);
  const actNames = project.structureTemplate === "free" ? project.customActs ?? templateActs.free : templateActs[project.structureTemplate];
  const people = project.characters;
  const sceneName = (id: string) => `Scene ${scenes.find((scene) => scene.id === id)?.sceneNumber ?? "—"}`;
  const filteredScenes = useMemo(() => scenes.filter((scene) => {
    const scenePeople = scene.characters.map((id) => people.find((person) => person.id === id)).filter((person): person is ScreenplayCharacter => Boolean(person));
    const attachedClues = project.foreshadowing.filter((clue) => scene.foreshadowingIds.includes(clue.id));
    const haystack = [scene.title, scene.logline, scene.location, scene.time, scene.notes, ...scene.tags, ...scene.script.map((item) => item.text), ...scenePeople.flatMap((person) => [person.name, person.profile, person.personality, person.goal, person.notes]), ...attachedClues.flatMap((clue) => [clue.title, clue.description])].join(" ").toLowerCase();
    return (!search || haystack.includes(search.toLowerCase())) &&
      (!filter.character || scene.characters.includes(filter.character)) &&
      (!filter.location || scene.location === filter.location) &&
      (!filter.time || scene.time === filter.time) && (!filter.act || scene.act === filter.act) &&
      (!filter.color || scene.color === filter.color) && (!filter.tag || scene.tags.includes(filter.tag)) &&
      (!filter.foreshadow || scene.foreshadowingIds.includes(filter.foreshadow));
  }), [scenes, people, project.foreshadowing, search, filter]);

  const updateScene = (id: string, updates: Partial<ScreenplayScene>) => commit({ ...project, scenes: scenes.map((scene) => scene.id === id ? { ...scene, ...updates } : scene) });
  const renumber = (input: ScreenplayScene[]) => input.map((scene, index) => ({ ...scene, sceneNumber: index + 1 }));
  const addScene = (act: string) => {
    const scene = blankScene(act, scenes.length + 1);
    commit({ ...project, scenes: [...scenes, scene] });
    setSelectedSceneId(scene.id); setSection("script"); setView("cards");
  };
  const duplicateScene = (scene: ScreenplayScene) => {
    const copy = { ...cloneProject(project).scenes.find((item) => item.id === scene.id)!, id: nanoid(), title: `${scene.title}（コピー）`, sceneNumber: scenes.length + 1, beats: scene.beats.map((beat) => ({ ...beat, id: nanoid() })), script: scene.script.map((item) => ({ ...item, id: nanoid() })) };
    const index = scenes.findIndex((item) => item.id === scene.id);
    const next = [...scenes]; next.splice(index + 1, 0, copy);
    commit({ ...project, scenes: renumber(next) }); setSelectedSceneId(copy.id);
  };
  const deleteScene = (id: string) => {
    if (!window.confirm("このシーンを削除しますか？")) return;
    commit({ ...project, scenes: renumber(scenes.filter((scene) => scene.id !== id)) });
  };
  const moveScene = (id: string, targetId: string | null, targetAct?: string) => {
    const moving = scenes.find((scene) => scene.id === id);
    if (!moving) return;
    let next = scenes.filter((scene) => scene.id !== id);
    const updated = targetAct ? { ...moving, act: targetAct } : moving;
    if (targetId) {
      const index = next.findIndex((scene) => scene.id === targetId);
      next.splice(index < 0 ? next.length : index, 0, updated);
    } else next.push(updated);
    commit({ ...project, scenes: renumber(next) }); setDragSceneId(null);
  };
  const changeTemplate = (template: ScreenplayTemplate) => {
    const oldActs = project.structureTemplate === "free" ? project.customActs ?? templateActs.free : templateActs[project.structureTemplate]; const newActs = templateActs[template];
    const nextScenes = scenes.map((scene) => {
      const index = Math.max(0, oldActs.indexOf(scene.act));
      const mapped = Math.min(newActs.length - 1, Math.floor((index / Math.max(oldActs.length, 1)) * newActs.length));
      return { ...scene, act: newActs[mapped] };
    });
    commit({ ...project, structureTemplate: template, customActs: template === "free" ? (project.customActs ?? newActs) : project.customActs, scenes: nextScenes });
  };
  const renameAct = (oldName: string, newName: string) => {
    const name = newName.trim() || oldName;
    commit({ ...project, customActs: actNames.map((act) => act === oldName ? name : act), scenes: scenes.map((scene) => scene.act === oldName ? { ...scene, act: name } : scene) });
  };
  const addAct = () => commit({ ...project, customActs: [...actNames, `ACT ${actNames.length + 1}`] });
  const addBeat = (scene: ScreenplayScene) => updateScene(scene.id, { beats: [...scene.beats, { id: nanoid(), text: "新しいビート", order: scene.beats.length + 1 }] });
  const moveBeat = (scene: ScreenplayScene, beatId: string, targetId: string) => {
    const next = [...scene.beats]; const from = next.findIndex((beat) => beat.id === beatId); const to = next.findIndex((beat) => beat.id === targetId);
    if (from < 0 || to < 0) return; const [item] = next.splice(from, 1); next.splice(to, 0, item);
    updateScene(scene.id, { beats: next.map((beat, order) => ({ ...beat, order: order + 1 })) }); setDragBeatId(null);
  };
  const addScriptElement = (scene: ScreenplayScene, type: ScriptElementType = "heading", afterId?: string) => {
    const item: ScriptElement = { id: nanoid(), type, text: type === "heading" ? "INT. 場所 - 昼" : "" };
    const next = [...scene.script]; const afterIndex = afterId ? next.findIndex((element) => element.id === afterId) : next.length - 1;
    next.splice(afterIndex + 1, 0, item); updateScene(scene.id, { script: next });
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-script-id="${item.id}"]`)?.focus(), 0);
  };
  const addPerson = () => { const person = newCharacter(); commit({ ...project, characters: [...people, person] }); setSelectedCharacterId(person.id); };
  const updatePerson = (id: string, updates: Partial<ScreenplayCharacter>) => commit({ ...project, characters: people.map((person) => person.id === id ? { ...person, ...updates } : person) });
  const addClue = () => commit({ ...project, foreshadowing: [...project.foreshadowing, newForeshadowing()] });
  const updateClue = (id: string, updates: Partial<Foreshadowing>) => commit({ ...project, foreshadowing: project.foreshadowing.map((clue) => clue.id === id ? { ...clue, ...updates } : clue) });
  const runAnalysis = () => {
    const ideas: string[] = [];
    if (scenes.length < 8) ideas.push("シーン数が少なめです。主人公の変化を支える転換点が十分か見直してみましょう。");
    if (scenes.filter((scene) => !scene.logline.trim()).length) ideas.push(`${scenes.filter((scene) => !scene.logline.trim()).length}シーンにログラインがありません。シーンの役割を一文で定めると構成を見渡しやすくなります。`);
    if (people.length && people.some((person) => !scenes.some((scene) => scene.characters.includes(person.id)))) ideas.push("登場シーンがまだ設定されていない人物がいます。登場の必要性や配置を確認してください。");
    const idle = people.map((person) => ({ person, indexes: scenes.map((scene, index) => scene.characters.includes(person.id) ? index : -1).filter((index) => index >= 0) })).filter((item) => item.indexes.length > 1 && Math.max(...item.indexes.slice(1).map((index, i) => index - item.indexes[i])) >= 4);
    if (idle.length) ideas.push(`${idle.map((item) => item.person.name).join("・")}の登場間隔が空いています。意図した不在か、再登場のタイミングを確認しましょう。`);
    const unpaid = project.foreshadowing.filter((clue) => clue.status !== "回収済み");
    if (unpaid.length) ideas.push(`未回収・進行中の伏線が${unpaid.length}件あります。終盤までに回収するか、意図的に残すか確認してください。`);
    if (actNames.length > 1) {
      const counts = actNames.map((act) => scenes.filter((scene) => scene.act === act).length);
      const max = Math.max(...counts); const min = Math.min(...counts);
      if (max >= Math.max(5, min * 2)) ideas.push("構成区分ごとのシーン数に偏りがあります。各幕・区分の役割とペース配分を確認しましょう。");
    }
    if (!ideas.length) ideas.push("大きなチェック項目は見つかりませんでした。主人公の選択と、その結果が各シーンを通じて変化しているか、もう一度読んで確かめましょう。");
    setAnalysis(ideas);
  };

  const allTags = [...new Set(scenes.flatMap((scene) => scene.tags))];
  const locations = [...new Set(scenes.map((scene) => scene.location).filter(Boolean))];
  const dialogueEntries = scenes.flatMap((scene) => {
    let speakerId = "";
    return scene.script.flatMap((item) => {
      if (item.type === "character") {
        const speaker = item.text.trim().toLocaleLowerCase();
        speakerId = people.find((person) => person.name.trim().toLocaleLowerCase() === speaker)?.id ?? (scene.characters.length === 1 ? scene.characters[0] : "");
      }
      return item.type === "dialogue" ? [{ scene, item, speakerId }] : [];
    });
  });
  const scriptCharacterCounts = people.map((person) => ({ person, count: dialogueEntries.filter((entry) => entry.speakerId === person.id).reduce((sum, entry) => sum + entry.item.text.length, 0) }));
  const totalDialogue = scriptCharacterCounts.reduce((sum, item) => sum + item.count, 0);
  const scriptLines = dialogueEntries.filter((entry) => !dialogueCharacter || entry.speakerId === dialogueCharacter);
  const dialogueSpeakerName = (speakerId: string, scene: ScreenplayScene) => people.find((person) => person.id === speakerId)?.name ?? (scene.characters.length === 1 ? people.find((person) => person.id === scene.characters[0])?.name : undefined) ?? "人物未設定";
  const sidebarNav: { id: ProjectSection; label: string; icon: typeof FileText }[] = [
    { id: "script", label: "脚本", icon: FileText }, { id: "characters", label: "登場人物", icon: Users },
    { id: "stage", label: "舞台設定", icon: BookOpen }, { id: "foreshadowing", label: "伏線", icon: Lightbulb }, { id: "materials", label: "資料", icon: Flag },
    { id: "storydna", label: "換骨奪胎", icon: Dna },
  ];
  const sceneJump = (id: string) => { setSelectedSceneId(id); setSection("script"); setView("cards"); };
  const savePageSetting = (updates: Partial<ScreenplayPageSettings>) => commit({ ...project, pageSettings: { ...project.pageSettings, ...updates } });

  return (
    <div className={`screenplay-shell ${focused ? "is-focused" : ""}`}>
      {!focused && <aside className="script-sidebar">
        <div className="script-brand"><span>NOVEL WRITER</span><strong>物語を設計する</strong></div>
        <div className="script-project-label">PROJECT</div>
        <nav className="script-project-nav">
          {sidebarNav.map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? "active" : ""} onClick={() => { setSection(id); if (id === "script") setView("cards"); }}><Icon size={17} />{label}{id === "foreshadowing" && project.foreshadowing.length > 0 && <small>{project.foreshadowing.length}</small>}</button>)}
        </nav>
        <div className="script-sidebar-bottom"><button onClick={onSwitchToNovel}><BookOpen size={16} />小説モードへ</button><span>自動保存されています</span></div>
      </aside>}
      <main className="screenplay-main">
        <header className="screenplay-header">
          <div className="screenplay-heading">
            <button className="mode-switch" onClick={onSwitchToNovel}>小説</button><button className="mode-switch current">脚本</button>
            <span className="header-divider" />
            <div><small>SCREENPLAY PROJECT</small><h1>{novel.title}</h1></div>
          </div>
          <div className="screenplay-header-actions">
            <span className="save-status"><Check size={14} /> 保存済み</span>
            <button className="quiet-button" onClick={() => setFocused((value) => !value)} title="Focus Mode"><Focus size={16} />{focused ? "Focusを終了" : "Focus"}</button>
            <button className="quiet-button" onClick={() => window.print()}><Printer size={16} />PDF</button>
            <div className="script-settings-wrap"><button className="script-icon-button" onClick={() => setSettingsOpen((value) => !value)} aria-label="ページ設定"><Settings2 size={18} /></button>{settingsOpen && <div className="script-settings-popover">
              <strong>ページ設定</strong><label>用紙サイズ<select value={project.pageSettings.paperSize} onChange={(event) => savePageSetting({ paperSize: event.target.value as "A4" | "Letter" })}><option>A4</option><option>Letter</option></select></label>
              <label>余白（mm）<input type="number" min={5} max={50} value={project.pageSettings.margin} onChange={(event) => savePageSetting({ margin: Number(event.target.value) })} /></label>
              <label>フォント<select value={project.pageSettings.font} onChange={(event) => savePageSetting({ font: event.target.value })}><option>Noto Serif JP</option><option>Noto Sans JP</option><option>Yu Mincho</option></select></label>
              <label>文字サイズ<input type="number" min={8} max={24} value={project.pageSettings.fontSize} onChange={(event) => savePageSetting({ fontSize: Number(event.target.value) })} /></label>
              <label>行間<input type="number" min={1} max={3} step={0.1} value={project.pageSettings.lineSpacing} onChange={(event) => savePageSetting({ lineSpacing: Number(event.target.value) })} /></label>
              <label className="setting-check"><input type="checkbox" checked={project.pageSettings.pageNumbers} onChange={(event) => savePageSetting({ pageNumbers: event.target.checked })} />ページ番号</label>
              <p>脚本の目安：1ページ ≒ 約1分</p>
            </div>}</div>
          </div>
        </header>
        {!focused && <div className="screenplay-tabs-row">
          {section === "script" ? <div className="screenplay-tabs">{viewTabs.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon size={15} />{label}</button>)}</div> : <div className="section-title">{sidebarNav.find((item) => item.id === section)?.label}</div>}
          {section === "script" && <div className="tab-actions"><span><b>{scenes.length}</b> シーン</span><span><b>{totalDuration}</b> 分</span><select aria-label="構成テンプレート" value={project.structureTemplate} onChange={(event) => changeTemplate(event.target.value as ScreenplayTemplate)}>{Object.entries(templateNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
        </div>}
        <div className={`screenplay-work-area ${focused ? "focused-area" : ""}`}>
          <section className="screenplay-content">
            {section === "storydna" && <StoryDnaWorkspace novelId={novel.id} novelTitle={novel.title} project={project} onCommit={(next) => commit(next)} onOpenScene={sceneJump} />}
            {section === "script" && view === "cards" && <>
              <div className="board-toolbar">
                <div className="board-intro"><div className="eyebrow">STORY BOARD <span>·</span> {templateNames[project.structureTemplate]}</div><h2>物語を、並べて考える。</h2><p>カードをドラッグして順番を入れ替え、シーンの流れを組み立てます。</p></div>
                <div className="board-tools"><label className="board-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="作品内を検索" /></label><button className="scene-info-toggle" onClick={() => setShowSceneInfo((value) => !value)}>{showSceneInfo ? <X size={14} /> : <Settings2 size={14} />}Scene Info</button></div>
              </div>
              <div className="scene-filters">
                <select value={filter.character} onChange={(event) => setFilter({ ...filter, character: event.target.value })}><option value="">人物：すべて</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
                <select value={filter.location} onChange={(event) => setFilter({ ...filter, location: event.target.value })}><option value="">場所：すべて</option>{locations.map((location) => <option key={location}>{location}</option>)}</select>
                <select value={filter.time} onChange={(event) => setFilter({ ...filter, time: event.target.value })}><option value="">時間：すべて</option>{[...new Set(scenes.map((scene) => scene.time).filter(Boolean))].map((time) => <option key={time}>{time}</option>)}</select>
                <select value={filter.act} onChange={(event) => setFilter({ ...filter, act: event.target.value })}><option value="">構成：すべて</option>{actNames.map((act) => <option key={act}>{act}</option>)}</select>
                <select value={filter.color} onChange={(event) => setFilter({ ...filter, color: event.target.value })}><option value="">カラー：すべて</option>{colorOptions.map((color) => <option key={color} value={color}>● {colorOptions.indexOf(color) === 0 ? "主人公" : colorOptions.indexOf(color) === 1 ? "恋愛" : colorOptions.indexOf(color) === 2 ? "サブプロット" : colorOptions.indexOf(color) === 3 ? "コメディ" : colorOptions.indexOf(color) === 4 ? "伏線" : "その他"}</option>)}</select>
                <select value={filter.tag} onChange={(event) => setFilter({ ...filter, tag: event.target.value })}><option value="">タグ：すべて</option>{allTags.map((tag) => <option key={tag}>{tag}</option>)}</select>
                <select value={filter.foreshadow} onChange={(event) => setFilter({ ...filter, foreshadow: event.target.value })}><option value="">伏線：すべて</option>{project.foreshadowing.map((clue) => <option key={clue.id} value={clue.id}>{clue.title}</option>)}</select>
                {(search || Object.values(filter).some(Boolean)) && <button className="clear-filter" onClick={() => { setSearch(""); setFilter({ character: "", location: "", time: "", act: "", color: "", tag: "", foreshadow: "" }); }}>解除</button>}
              </div>
              <div className="act-board">{actNames.map((act, actIndex) => <section key={act} className="act-lane" onDragOver={(event) => event.preventDefault()} onDrop={() => dragSceneId && moveScene(dragSceneId, null, act)}>
                <header className="act-lane-heading"><div><span className="act-index">{String(actIndex + 1).padStart(2, "0")}</span><h3 title={project.structureTemplate === "free" ? "ダブルクリックで名称変更" : undefined} onDoubleClick={() => { if (project.structureTemplate === "free") { const name = window.prompt("構成区分名", act); if (name) renameAct(act, name); } }}>{act}</h3><span className="act-scene-count">{filteredScenes.filter((scene) => scene.act === act).length} scenes</span></div><button onClick={() => addScene(act)}><Plus size={15} /> Scene</button></header>
                <div className="scene-card-grid">{filteredScenes.filter((scene) => scene.act === act).map((scene) => <article key={scene.id} draggable className={`scene-card ${selectedSceneId === scene.id ? "selected" : ""}`} style={{ "--scene-color": scene.color } as React.CSSProperties} onDragStart={() => setDragSceneId(scene.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); if (dragSceneId && dragSceneId !== scene.id) moveScene(dragSceneId, scene.id, act); }} onClick={() => { setSelectedSceneId(scene.id); }} onDoubleClick={() => { setSelectedSceneId(scene.id); setInlineEditId(scene.id); }}>
                  <div className="scene-card-top"><span>SCENE {String(scene.sceneNumber).padStart(2, "0")}</span><span className="card-tools"><button title="編集" onClick={(event) => { event.stopPropagation(); setInlineEditId(scene.id); }}><Pencil size={14} /></button><button title="複製" onClick={(event) => { event.stopPropagation(); duplicateScene(scene); }}><Copy size={14} /></button><button title="削除" onClick={(event) => { event.stopPropagation(); deleteScene(scene.id); }}><Trash2 size={14} /></button></span></div>
                  {inlineEditId === scene.id ? <div className="card-inline-editor" onClick={(event) => event.stopPropagation()}><input autoFocus aria-label="シーンタイトル" value={scene.title} onChange={(event) => updateScene(scene.id, { title: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") setInlineEditId(null); }} /><textarea aria-label="ログライン" value={scene.logline} onChange={(event) => updateScene(scene.id, { logline: event.target.value })} onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node)) setInlineEditId(null); }} placeholder="このシーンで何が起こる？" /></div> : <><h4>{scene.title || "無題のシーン"}</h4><p className={`scene-logline ${scene.logline ? "" : "empty"}`}>{scene.logline || "クリックしてログラインを追加…"}</p></>}
                  <div className="scene-card-meta">{scene.characters.length > 0 && <span><Users size={12} />{scene.characters.map((id) => people.find((person) => person.id === id)?.name ?? "").filter(Boolean).join(" / ")}</span>}{scene.location && <span>{scene.location}</span>}{scene.time && <span>{scene.time}</span>}</div>
                  <div className="scene-card-footer">{scene.tags.length > 0 && <div className="scene-tags">{scene.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}<span className="duration-chip">{scene.estimatedDuration}分</span>{scene.foreshadowingIds.length > 0 && <span className="clue-icon" aria-label="伏線あり"><Lightbulb size={14} /></span>}</div>
                </article>)}</div>
                {filteredScenes.filter((scene) => scene.act === act).length === 0 && <div className="empty-lane">この構成区分にはまだシーンがありません。</div>}
                <button className="add-scene-ghost" onClick={() => addScene(act)}><Plus size={16} />シーンを追加</button>
              </section>)}{project.structureTemplate === "free" && <button className="add-scene-ghost" onClick={addAct}><Plus size={16} />構成区分を追加</button>}</div>
            </>}
            {section === "script" && view === "timeline" && <div className="timeline-view"><div className="view-heading"><div className="eyebrow">RUNTIME MAP</div><h2>物語の時間軸</h2><p>シーン尺を編集して、全体のテンポを確認します。</p></div><div className="timeline-stats"><div><small>総シーン数</small><strong>{scenes.length}<em> scenes</em></strong></div><div><small>推定上映時間</small><strong>{totalDuration}<em> min</em></strong></div><div><small>目安ページ数</small><strong>{totalPages}<em> pages</em></strong><p>1ページ ≒ 約1分</p></div></div><div className="timeline-ruler"><span>0分</span><span>{Math.round(totalDuration / 3)}分</span><span>{Math.round(totalDuration * 2 / 3)}分</span><span>{totalDuration}分</span></div><div className="timeline-list">{scenes.map((scene, index) => { const start = scenes.slice(0, index).reduce((sum, item) => sum + item.estimatedDuration, 0); return <button key={scene.id} className="timeline-scene" onClick={() => sceneJump(scene.id)}><span className="timeline-marker" style={{ "--scene-color": scene.color } as React.CSSProperties} /><span className="timeline-scene-num">{sceneName(scene.id)}</span><span className="timeline-scene-title">{scene.title}</span><span className="timeline-scene-time">{start}–{start + scene.estimatedDuration} min</span><input aria-label={`${scene.title}の想定尺（分）`} type="number" min={0} value={scene.estimatedDuration} onClick={(event) => event.stopPropagation()} onChange={(event) => updateScene(scene.id, { estimatedDuration: Math.max(0, Number(event.target.value)) })} /><small>分</small><span className="timeline-track"><i style={{ width: `${totalDuration ? scene.estimatedDuration / totalDuration * 100 : 0}%`, background: scene.color }} /></span></button>; })}</div></div>}
            {section === "script" && view === "script" && <div className="script-editor-view"><header className="script-editor-header"><div><div className="eyebrow">SCREENPLAY DRAFT</div><h2>脚本本文</h2><p>シーンを選び、脚本形式のブロックを重ねて書き進めます。</p></div><select value={selectedScene?.id ?? ""} onChange={(event) => setSelectedSceneId(event.target.value)}>{scenes.map((scene) => <option key={scene.id} value={scene.id}>{sceneName(scene.id)} — {scene.title}</option>)}</select></header>{selectedScene ? <div className="script-paper" style={{ fontFamily: `${project.pageSettings.font}, serif`, fontSize: `${project.pageSettings.fontSize}px`, lineHeight: project.pageSettings.lineSpacing }}><div className="script-paper-heading"><span>{sceneName(selectedScene.id)}</span><input value={selectedScene.title} onChange={(event) => updateScene(selectedScene.id, { title: event.target.value })} placeholder="シーンタイトル" /></div>{selectedScene.script.map((element, index) => <div className={`script-element script-${element.type}`} key={element.id}><label>{elementLabels[element.type]}</label><textarea data-script-id={element.id} value={element.text} rows={element.type === "action" || element.type === "dialogue" ? 2 : 1} placeholder={element.type === "heading" ? "INT. OFFICE - DAY" : element.type === "action" ? "佐藤が部屋に入る。" : element.type === "character" ? "佐藤" : element.type === "dialogue" ? "話があります。" : ""} onChange={(event) => updateScene(selectedScene.id, { script: selectedScene.script.map((item) => item.id === element.id ? { ...item, text: event.target.value } : item) })} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && element.type !== "dialogue" && element.type !== "action") { event.preventDefault(); addScriptElement(selectedScene, nextElement[element.type], element.id); } if (event.key === "Tab") { event.preventDefault(); addScriptElement(selectedScene, nextElement[element.type], element.id); } }} /><button title="ブロックを削除" onClick={() => updateScene(selectedScene.id, { script: selectedScene.script.filter((item) => item.id !== element.id) })}><X size={14} /></button>{index < selectedScene.script.length - 1 && <span className="script-flow">↓</span>}</div>)}<div className="script-add-row"><button onClick={() => addScriptElement(selectedScene, selectedScene.script.length ? nextElement[selectedScene.script[selectedScene.script.length - 1].type] : "heading")}><Plus size={16} />次のブロックを追加</button><div>{(["heading", "action", "character", "dialogue", "parenthetical", "transition"] as ScriptElementType[]).map((type) => <button key={type} onClick={() => addScriptElement(selectedScene, type)}>{elementLabels[type]}</button>)}</div></div><div className="beat-section"><header><div><h3>Scene Beats</h3><p>シーンを小さな変化の連なりに分解します。</p></div><button onClick={() => addBeat(selectedScene)}><Plus size={15} /> Beat</button></header>{selectedScene.beats.map((beat, index) => <div key={beat.id} draggable className="beat-row" onDragStart={() => setDragBeatId(beat.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dragBeatId && moveBeat(selectedScene, dragBeatId, beat.id)}><GripVertical size={15} /><span>BEAT {index + 1}</span><input value={beat.text} onChange={(event) => updateScene(selectedScene.id, { beats: selectedScene.beats.map((item) => item.id === beat.id ? { ...item, text: event.target.value } : item) })} /><button onClick={() => updateScene(selectedScene.id, { beats: selectedScene.beats.filter((item) => item.id !== beat.id).map((item, order) => ({ ...item, order: order + 1 })) })}><Trash2 size={14} /></button></div>)}</div></div> : <p className="empty-state">先にカードビューでシーンを作成してください。</p>}</div>}
            {section === "script" && view === "dialogue" && <div className="dialogue-view"><div className="view-heading"><div className="eyebrow">DIALOGUE TRACK</div><h2>セリフだけを読む</h2><p>会話のリズムと人物ごとの発話量を確認できます。</p></div><div className="dialogue-controls"><select value={dialogueCharacter} onChange={(event) => setDialogueCharacter(event.target.value)}><option value="">すべての人物</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><div className="dialogue-share-list">{scriptCharacterCounts.map(({ person, count }) => <div key={person.id}><span>{person.name || "未命名"}</span><b>{totalDialogue ? Math.round(count / totalDialogue * 100) : 0}%</b><i><em style={{ width: `${totalDialogue ? count / totalDialogue * 100 : 0}%` }} /></i></div>)}</div></div><div className="dialogue-lines">{scriptLines.map(({ scene, item, speakerId }) => <button key={item.id} onClick={() => { sceneJump(scene.id); setView("script"); }}><span>{dialogueSpeakerName(speakerId, scene)}</span><p>「{item.text}」</p><small>{sceneName(scene.id)} · {scene.title}</small></button>)}{!scriptLines.length && <div className="empty-state">脚本本文にセリフを追加すると、ここに表示されます。</div>}</div></div>}
            {section === "script" && view === "analysis" && <div className="analysis-view"><div className="view-heading"><div className="eyebrow">STORY HEALTH</div><h2>作品の現在地</h2><p>構成と登場人物の配置を俯瞰して、次の推敲ポイントを見つけます。</p></div><div className="analysis-metrics"><Metric label="総シーン数" value={scenes.length} unit="scenes"/><Metric label="総ページ数" value={totalPages} unit="pages"/><Metric label="推定上映時間" value={totalDuration} unit="min"/><Metric label="登場人物" value={people.length} unit="人"/></div><div className="analysis-columns"><section className="analysis-panel"><h3>構成区分ごとのシーン</h3>{actNames.map((act) => { const count = scenes.filter((scene) => scene.act === act).length; return <div className="bar-stat" key={act}><span>{act}</span><div><i style={{ width: `${scenes.length ? count / scenes.length * 100 : 0}%` }} /></div><b>{count}</b></div>; })}</section><section className="analysis-panel"><h3>人物の登場・セリフ</h3>{people.map((person) => { const count = scenes.filter((scene) => scene.characters.includes(person.id)).length; const lines = scriptCharacterCounts.find((item) => item.person.id === person.id)?.count ?? 0; return <button className="person-stat" key={person.id} onClick={() => { setSection("characters"); setSelectedCharacterId(person.id); }}><span>{person.name || "未命名"}</span><b>{count} scenes</b><small>{totalDialogue ? Math.round(lines / totalDialogue * 100) : 0}% dialogue</small></button>; })}{!people.length && <p className="muted">人物を登録すると登場頻度が表示されます。</p>}</section></div><div className="analysis-summary"><div><span>伏線</span><strong>{project.foreshadowing.length}</strong><small>未回収 {project.foreshadowing.filter((clue) => clue.status !== "回収済み").length}</small></div><div><span>各シーンの目的・障害</span><strong>{scenes.filter((scene) => scene.purpose && scene.obstacle).length}<small> / {scenes.length} scenes</small></strong></div></div><section className="ai-analysis-panel"><div><span className="ai-sparkle">✳</span><div><h3>AIに脚本を分析してもらう</h3><p>作品を変更せず、構成上の気づきを提案として表示します。</p></div></div><button onClick={runAnalysis}>構成を分析 <ChevronDown size={15} /></button>{analysis.length > 0 && <div className="analysis-suggestions"><strong>分析の提案 <small>ローカル構成チェック</small></strong>{analysis.map((idea, index) => <p key={index}><span>{String(index + 1).padStart(2, "0")}</span>{idea}</p>)}</div>}</section></div>}
            {section === "characters" && <div className="management-view"><header className="management-header"><div><div className="eyebrow">CHARACTER MAP</div><h2>登場人物</h2><p>人物を選ぶと、登場シーンの流れを追えます。</p></div><button className="primary-button" onClick={addPerson}><Plus size={16} />人物を追加</button></header><div className="character-layout"><div className="character-list">{people.map((person) => { const appearing = scenes.filter((scene) => scene.characters.includes(person.id)); return <button key={person.id} className={selectedCharacterId === person.id ? "active" : ""} onClick={() => setSelectedCharacterId(person.id)}><span className="avatar-mark">{person.name.slice(0, 1) || "人"}</span><span><b>{person.name || "新しい人物"}</b><small>{person.role || "役割未設定"} · {person.age || "年齢未設定"}</small><small>{appearing.length} scenes</small></span></button>; })}{!people.length && <div className="empty-state">まだ人物がいません。人物を追加して、シーンに割り当てましょう。</div>}</div>{people.filter((person) => person.id === selectedCharacterId).map((person) => <div className="character-detail" key={person.id}><div className="character-detail-head"><div><span className="eyebrow">CHARACTER PROFILE</span><h3>{person.name}</h3></div><button className="danger-icon" onClick={() => { commit({ ...project, characters: people.filter((item) => item.id !== person.id), scenes: scenes.map((scene) => ({ ...scene, characters: scene.characters.filter((id) => id !== person.id) })) }); setSelectedCharacterId(""); }} title="人物を削除"><Trash2 size={16} /></button></div><div className="character-fields">{([ ["名前", "name"], ["読み", "reading"], ["年齢", "age"], ["性別", "gender"], ["役割", "role"], ["プロフィール", "profile"], ["性格", "personality"], ["目的", "goal"], ["弱点", "weakness"], ["過去", "past"], ["人物背景", "background"], ["メモ", "notes"] ] as [string, keyof ScreenplayCharacter][]).map(([label, key]) => <label key={key}>{label}{["profile", "personality", "goal", "weakness", "past", "background", "notes"].includes(key) ? <textarea value={person[key] as string} onChange={(event) => updatePerson(person.id, { [key]: event.target.value })} /> : <input value={person[key] as string} onChange={(event) => updatePerson(person.id, { [key]: event.target.value })} />}</label>)}</div><div className="character-storyline"><h4>登場シーン · ストーリーライン</h4><div>{scenes.filter((scene) => scene.characters.includes(person.id)).map((scene, index) => <span key={scene.id}><button onClick={() => sceneJump(scene.id)}><b>{sceneName(scene.id)}</b><small>{scene.title}</small></button>{index < scenes.filter((item) => item.characters.includes(person.id)).length - 1 && <i>↓</i>}</span>)}</div>{!scenes.some((scene) => scene.characters.includes(person.id)) && <p>シーン詳細から人物を割り当てると、登場順にここへ表示されます。</p>}</div></div>)}</div></div>}
            {section === "stage" && <div className="writing-settings-view"><div className="view-heading"><div className="eyebrow">WORLD BUILDING</div><h2>舞台設定</h2><p>物語の世界、ルール、場所などの共通設定を記録します。</p></div><textarea value={project.stage} onChange={(event) => commit({ ...project, stage: event.target.value })} placeholder="時代、世界のルール、物語の舞台について…" /></div>}
            {section === "materials" && <div className="writing-settings-view"><div className="view-heading"><div className="eyebrow">RESEARCH NOTES</div><h2>資料</h2><p>リサーチや参考資料、執筆中に気づいたことを記録します。</p></div><textarea value={project.materials} onChange={(event) => commit({ ...project, materials: event.target.value })} placeholder="調べたこと、参考URL、メモ…" /></div>}
            {section === "foreshadowing" && <div className="management-view"><header className="management-header"><div><div className="eyebrow">FORESHADOWING TRACKER</div><h2>伏線</h2><p>初出から回収まで、物語の中での動きを見渡します。</p></div><button className="primary-button" onClick={addClue}><Plus size={16} />伏線を追加</button></header><div className="foreshadow-list">{project.foreshadowing.map((clue) => <article key={clue.id}><div className="foreshadow-title-row"><Lightbulb size={17} /><input value={clue.title} onChange={(event) => updateClue(clue.id, { title: event.target.value })} /><select value={clue.status} onChange={(event) => updateClue(clue.id, { status: event.target.value as Foreshadowing["status"] })}><option>未回収</option><option>進行中</option><option>回収済み</option></select><button className="danger-icon" onClick={() => commit({ ...project, foreshadowing: project.foreshadowing.filter((item) => item.id !== clue.id), scenes: scenes.map((scene) => ({ ...scene, foreshadowingIds: scene.foreshadowingIds.filter((id) => id !== clue.id) })) })}><Trash2 size={15} /></button></div><textarea value={clue.description} onChange={(event) => updateClue(clue.id, { description: event.target.value })} placeholder="伏線の内容・意図" /><div className="foreshadow-lifecycle"><label>初出<select value={clue.firstScene} onChange={(event) => updateClue(clue.id, { firstScene: event.target.value })}><option value="">未設定</option>{scenes.map((scene) => <option key={scene.id} value={scene.id}>{sceneName(scene.id)} · {scene.title}</option>)}</select></label><label>再登場<select multiple value={clue.returnScenes} onChange={(event) => updateClue(clue.id, { returnScenes: [...event.currentTarget.selectedOptions].map((option) => option.value) })}>{scenes.map((scene) => <option key={scene.id} value={scene.id}>{sceneName(scene.id)} · {scene.title}</option>)}</select></label><label>回収<select value={clue.payoffScene} onChange={(event) => updateClue(clue.id, { payoffScene: event.target.value, status: event.target.value ? "回収済み" : clue.status })}><option value="">未設定</option>{scenes.map((scene) => <option key={scene.id} value={scene.id}>{sceneName(scene.id)} · {scene.title}</option>)}</select></label></div><div className="foreshadow-attach">{scenes.map((scene) => <label key={scene.id}><input type="checkbox" checked={scene.foreshadowingIds.includes(clue.id)} onChange={(event) => updateScene(scene.id, { foreshadowingIds: event.target.checked ? [...scene.foreshadowingIds, clue.id] : scene.foreshadowingIds.filter((id) => id !== clue.id) })} />{sceneName(scene.id)}</label>)}</div></article>)}{!project.foreshadowing.length && <div className="empty-state">伏線を登録して、初出から回収までを管理しましょう。</div>}</div></div>}
          </section>
          {!focused && section === "script" && view === "cards" && showSceneInfo && <aside className="scene-info-panel"><header><div><span className="eyebrow">SCENE INFO</span><h2>シーン詳細</h2></div><button className="script-icon-button" onClick={() => setShowSceneInfo(false)} aria-label="シーン詳細を閉じる"><X size={16} /></button></header>{selectedScene ? <div className="scene-info-content"><div className="scene-number-field"><label>シーン番号</label><span>{String(selectedScene.sceneNumber).padStart(2, "0")}</span><small>カード順に自動更新</small></div><InfoField label="シーンタイトル" value={selectedScene.title} onChange={(value) => updateScene(selectedScene.id, { title: value })} /><InfoField label="ログライン" multiline value={selectedScene.logline} placeholder="このシーンで何が起こる？" onChange={(value) => updateScene(selectedScene.id, { logline: value })} /><div className="info-field-pair"><InfoField label="場所" value={selectedScene.location} placeholder="オフィス" onChange={(value) => updateScene(selectedScene.id, { location: value })} /><label className="info-field">時間帯<select value={selectedScene.time} onChange={(event) => updateScene(selectedScene.id, { time: event.target.value })}>{["朝", "昼", "夕", "夜", "深夜", "連続", "任意"].map((time) => <option key={time}>{time}</option>)}</select></label></div><label className="info-field">構成区分<select value={selectedScene.act} onChange={(event) => updateScene(selectedScene.id, { act: event.target.value })}>{actNames.map((act) => <option key={act}>{act}</option>)}</select></label><fieldset className="scene-character-picker"><legend>登場人物</legend>{people.length ? people.map((person) => <label key={person.id}><input type="checkbox" checked={selectedScene.characters.includes(person.id)} onChange={(event) => updateScene(selectedScene.id, { characters: event.target.checked ? [...selectedScene.characters, person.id] : selectedScene.characters.filter((id) => id !== person.id) })} />{person.name}</label>) : <button className="inline-add" onClick={() => { setSection("characters"); addPerson(); }}><Plus size={14} />人物を登録</button>}</fieldset>{([ ["シーンの目的", "purpose"], ["障害", "obstacle"], ["開始時の状態", "startState"], ["終了時の状態", "endState"] ] as [string, keyof ScreenplayScene][]).map(([label, key]) => <InfoField key={key} label={label} value={selectedScene[key] as string} onChange={(value) => updateScene(selectedScene.id, { [key]: value })} />)}<InfoField label="想定尺（分）" type="number" value={String(selectedScene.estimatedDuration)} onChange={(value) => updateScene(selectedScene.id, { estimatedDuration: Math.max(0, Number(value)) })} /><InfoField label="ページ数" type="number" value={String(selectedScene.pages)} onChange={(value) => updateScene(selectedScene.id, { pages: Math.max(0, Number(value)) })} /><label className="info-field">タグ（カンマ区切り）<input value={selectedScene.tags.join(", ")} onChange={(event) => updateScene(selectedScene.id, { tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} placeholder="対立, 転換点" /></label><div className="info-field"><span>シーンカラー</span><div className="color-picker">{colorOptions.map((color) => <button key={color} className={selectedScene.color === color ? "selected" : ""} style={{ background: color }} onClick={() => updateScene(selectedScene.id, { color })} aria-label={`カラー ${color}`} />)}<label title="カスタムカラー"><input type="color" value={selectedScene.color} onChange={(event) => updateScene(selectedScene.id, { color: event.target.value })} /><Plus size={14} /></label></div></div><InfoField label="メモ" multiline value={selectedScene.notes} onChange={(value) => updateScene(selectedScene.id, { notes: value })} /><div className="info-related"><b><Lightbulb size={14} />関連する伏線</b>{project.foreshadowing.map((clue) => <label key={clue.id}><input type="checkbox" checked={selectedScene.foreshadowingIds.includes(clue.id)} onChange={(event) => updateScene(selectedScene.id, { foreshadowingIds: event.target.checked ? [...selectedScene.foreshadowingIds, clue.id] : selectedScene.foreshadowingIds.filter((id) => id !== clue.id) })} />{clue.title}</label>)}{!project.foreshadowing.length && <button className="inline-add" onClick={() => setSection("foreshadowing")}><Plus size={14} />伏線を作成</button>}</div><button className="open-script-button" onClick={() => setView("script")}><FileText size={15} />このシーンの脚本を書く</button></div> : <div className="empty-state">カードを選択すると、シーン情報を編集できます。</div>}</aside>}
        </div>
      </main>
      {toast && <div className="script-toast" onAnimationEnd={() => setToast("")}>{toast}</div>}
      <div className="screenplay-print" aria-hidden="true"><h1>{novel.title}</h1>{scenes.map((scene) => <section key={scene.id}><h2>{sceneName(scene.id)}　{scene.title}</h2>{scene.script.map((item) => <p className={`print-${item.type}`} key={item.id}>{item.text}</p>)}</section>)}</div>
    </div>
  );
}

function InfoField({ label, value, onChange, placeholder, multiline = false, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean; type?: string }) {
  return <label className="info-field">{label}{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={label === "ログライン" ? 3 : 2} /> : <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />}</label>;
}
function Metric({ label, value, unit }: { label: string; value: number; unit: string }) { return <div className="metric-card"><small>{label}</small><strong>{value}<em>{unit}</em></strong></div>; }
