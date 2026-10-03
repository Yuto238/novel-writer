// 英語・日本語の簡易辞書。ローカル解析（ヒューリスティック）で共用する。

export const countHits = (text: string, words: readonly string[]) => {
  const t = text.toLowerCase();
  let n = 0;
  for (const w of words) {
    let i = t.indexOf(w);
    while (i !== -1) { n++; i = t.indexOf(w, i + w.length); }
  }
  return n;
};

export const CONFLICT_WORDS = ["kill", "gun", "shoot", "fight", "hit ", "punch", "shut up", "get out", "liar", "hate", "stop", "no!", "damn", "fuck", "bastard", "bleed", "blood", "scream", "yell", "threat", "arrest", "run!", "die", "dead", "attack", "slam", "furious", "angry",
  "殺", "銃", "撃", "殴", "出て行", "嘘つき", "嫌い", "やめ", "黙れ", "叫", "怒", "憎", "裏切", "逮捕", "死", "血", "許さ", "ふざけ"] as const;
export const WARM_WORDS = ["thank", "love", "friend", "sorry", "please", "together", "smile", "hug", "kiss", "trust", "proud", "forgive", "miss you", "ありがとう", "愛", "友", "ごめん", "お願い", "一緒", "信じ", "笑顔", "抱", "許す"] as const;
export const HUMOR_WORDS = ["laugh", "joke", "funny", "haha", "giggle", "grin", "chuckle", "smirk", "笑", "冗談", "ふざけ", "おかしい"] as const;
export const TIME_LIMIT_WORDS = ["minutes", "hours", "deadline", "countdown", "clock", "running out", "before midnight", "tonight", "by morning", "last chance", "期限", "時間がない", "あと", "締め切り", "タイムリミット", "夜明けまで"] as const;
export const POWER_WORDS = ["sir", "ma'am", "boss", "fired", "that's an order", "i'm in charge", "professor", "captain", "chairman", "your honor", "上司", "社長", "命令", "クビ", "先生", "部長", "先輩"] as const;
export const SILENCE_WORDS = ["beat", "pause", "silence", "silent", "stares", "says nothing", "...", "…", "沈黙", "間", "無言", "黙"] as const;
export const SECRET_WORDS = ["secret", "don't tell", "lie", "lying", "hide", "hiding", "whisper", "conceal", "pretend", "秘密", "隠", "嘘", "内緒", "ささやく"] as const;
export const IRONY_WORDS = ["unaware", "doesn't know", "without realizing", "watches from", "oblivious", "ironic", "of all people", "気づかず", "知らず", "皮肉"] as const;
export const VISUAL_WORDS = ["photo", "sign", "screen", "letter", "note", "picture", "mirror", "window", "looks at", "stares at", "empty", "写真", "看板", "画面", "手紙", "鏡", "窓", "見つめ"] as const;
export const SURPRISE_WORDS = ["suddenly", "but then", "twist", "reveal", "turns out", "shock", "gasp", "突然", "実は", "驚", "思わぬ"] as const;
export const DIRECT_EMOTION = ["i'm sad", "i am sad", "i feel", "i'm angry", "i'm scared", "i love you", "i hate you", "i'm afraid", "i'm so happy", "i'm jealous", "i'm lonely", "悲しい", "嬉しい", "怖い", "愛してる", "つらい", "腹が立つ", "寂しい", "不安だ", "好きだ"] as const;
export const DEFLECT_WORDS = ["never mind", "forget it", "whatever", "anyway", "it's nothing", "i'm fine", "doesn't matter", "not now", "let's not", "別に", "なんでもない", "大丈夫", "いいから", "それより", "まあいい"] as const;
export const GOAL_WORDS = ["wants to", "want to", "needs to", "must", "has to", "trying to", "tries to", "determined", "i will", "i need", "i want", "have to", "したい", "なければ", "必ず", "目指", "求め", "手に入れ"] as const;
export const DESIRE_WORDS = ["i want", "i need", "i wish", "dream", "best", "greatest", "prove", "deserve", "したい", "欲し", "夢", "認めさせ"] as const;
export const FEAR_WORDS = ["afraid", "scared", "fear", "terrified", "can't lose", "nightmare", "panic", "怖", "恐", "失いたくない", "不安"] as const;
export const WEAK_WORDS = ["can't", "failed", "sorry", "alone", "mistake", "weak", "my fault", "couldn't", "できない", "失敗", "孤独", "弱", "間違"] as const;
export const DECISION_WORDS = ["i will", "i'll", "i choose", "i decide", "i'm going", "enough", "決め", "選ぶ", "選択", "行く", "やる"] as const;
export const QUESTION_EVADE = ["yes", "no", "yeah", "yep", "nope", "sure", "okay", "ok", "i do", "i don't", "i did", "i didn't", "i am", "i'm not", "はい", "いいえ", "うん", "ええ"] as const;
export const IMPERATIVE_START = ["go", "stop", "get", "come", "look", "listen", "give", "tell", "let", "don't", "please", "take", "leave", "wait", "shut", "sit", "do", "行", "やめ", "聞", "見", "待", "座", "出て"] as const;
export const APOLOGY = ["sorry", "apologize", "forgive me", "ごめん", "すみません", "申し訳"] as const;
export const THREAT = ["i'll kill", "you'll regret", "or else", "i swear", "you're dead", "後悔", "ただじゃ", "許さない"] as const;

export const EMOTIONS: { label: string; value: number; words: readonly string[] }[] = [
  { label: "怒り", value: -0.6, words: ["angry", "furious", "hate", "damn", "fuck", "bastard", "shut up", "get out", "怒", "憎", "ふざけ", "黙れ"] },
  { label: "恐怖", value: -0.7, words: ["afraid", "scared", "terrified", "scream", "panic", "run", "gasp", "怖", "恐", "悲鳴", "逃げ"] },
  { label: "悲しみ", value: -0.5, words: ["cry", "tears", "sad", "sorry", "alone", "lost", "funeral", "泣", "涙", "悲", "寂し", "失っ"] },
  { label: "焦り", value: -0.3, words: ["hurry", "quick", "now!", "late", "deadline", "clock", "急", "早く", "間に合"] },
  { label: "不安", value: -0.2, words: ["nervous", "worry", "uneasy", "doubt", "wait", "不安", "心配", "迷"] },
  { label: "喜び", value: 0.7, words: ["happy", "joy", "smile", "laugh", "celebrate", "win", "won", "嬉", "笑", "喜", "勝"] },
  { label: "愛情", value: 0.6, words: ["love", "kiss", "hug", "thank", "proud", "愛", "抱", "感謝"] },
  { label: "決意", value: 0.3, words: ["i will", "i'll", "determined", "decide", "enough", "決", "誓"] },
];

export const GENRES: { label: string; words: readonly string[] }[] = [
  { label: "クライム／スリラー", words: ["gun", "kill", "police", "detective", "murder", "cop", "arrest", "銃", "警察", "殺"] },
  { label: "ロマンス", words: ["love", "kiss", "date", "wedding", "girlfriend", "boyfriend", "恋", "結婚", "デート"] },
  { label: "ホラー", words: ["blood", "scream", "monster", "dark", "ghost", "demon", "血", "悲鳴", "幽霊"] },
  { label: "SF", words: ["ship", "space", "robot", "alien", "planet", "future", "宇宙", "ロボット", "未来"] },
  { label: "コメディ", words: ["laugh", "joke", "funny", "haha", "笑", "冗談"] },
  { label: "音楽・スポーツ", words: ["band", "drum", "stage", "coach", "game", "team", "practice", "練習", "試合", "ステージ"] },
  { label: "戦争・歴史", words: ["soldier", "war", "army", "general", "battle", "兵", "戦争", "将軍"] },
  { label: "ビジネス・社会ドラマ", words: ["company", "office", "lawyer", "court", "money", "deal", "会社", "弁護士", "金"] },
];

export const TECH_TAGS = ["サブテキスト", "情報隠し", "反復", "コールバック", "伏線", "ミスリード", "セットアップ", "ペイオフ", "逆転", "タイムリミット", "権力差", "沈黙", "質問回避", "期待と裏切り", "状況アイロニー", "ドラマティックアイロニー", "対比", "エスカレーション", "視覚的説明"] as const;

// ---- 翻訳（ローカル簡易辞書） ----
export const LOCATION_JA: Record<string, string> = {
  house: "家", apartment: "アパート", office: "オフィス", street: "通り", road: "道路", car: "車", kitchen: "キッチン", bedroom: "寝室", "living room": "リビング", bathroom: "バスルーム", restaurant: "レストラン", bar: "バー", cafe: "カフェ", "coffee shop": "喫茶店", school: "学校", classroom: "教室", hospital: "病院", "police station": "警察署", courtroom: "法廷", park: "公園", beach: "海岸", forest: "森", city: "街", rooftop: "屋上", hallway: "廊下", corridor: "廊下", stairs: "階段", elevator: "エレベーター", room: "部屋", garage: "ガレージ", church: "教会", airport: "空港", train: "電車", bus: "バス", stage: "ステージ", studio: "スタジオ", store: "店", shop: "店", market: "市場", warehouse: "倉庫", bridge: "橋", dorm: "寮", campus: "キャンパス", basement: "地下室", garden: "庭", yard: "庭", lobby: "ロビー", hotel: "ホテル", jail: "刑務所", prison: "刑務所", "conference room": "会議室", club: "クラブ", pool: "プール", field: "野原", mountain: "山", river: "川", lake: "湖", ship: "船", space: "宇宙", base: "基地",
};
export const TIME_JA: Record<string, string> = { day: "昼", night: "夜", morning: "朝", evening: "夕方", afternoon: "午後", dawn: "夜明け", dusk: "夕暮れ", later: "後", continuous: "連続", "moments later": "少し後", sunset: "夕暮れ", sunrise: "日の出", noon: "正午", midnight: "真夜中" };
export const TRANSITION_JA: Record<string, string> = { "FADE IN:": "フェードイン", "FADE OUT.": "フェードアウト", "FADE OUT:": "フェードアウト", "CUT TO:": "カット", "SMASH CUT TO:": "スマッシュカット", "DISSOLVE TO:": "ディゾルブ", "MATCH CUT TO:": "マッチカット", "FADE TO BLACK.": "暗転", "CUT TO BLACK.": "暗転", "BACK TO SCENE": "場面に戻る", "THE END": "終" };

export const WORD_JA: Record<string, string> = {
  i: "私", you: "あなた", he: "彼", she: "彼女", we: "私たち", they: "彼ら", it: "それ", me: "私を", him: "彼を", her: "彼女の", my: "私の", your: "あなたの", his: "彼の", our: "私たちの", their: "彼らの",
  is: "だ", are: "だ", was: "だった", were: "だった", am: "だ", be: "ある", been: "あった", do: "する", does: "する", did: "した", have: "持つ", has: "持つ", had: "持っていた", will: "だろう", would: "だろう", can: "できる", could: "できた", should: "べき", must: "しなければ",
  not: "ない", no: "いいえ", yes: "はい", yeah: "ああ", okay: "オーケー", ok: "オーケー", please: "お願い", sorry: "ごめん", thanks: "ありがとう", thank: "感謝", hello: "やあ", hi: "やあ", goodbye: "さよなら", sir: "サー", mr: "ミスター", mrs: "ミセス", ms: "ミズ",
  what: "何", why: "なぜ", how: "どう", when: "いつ", where: "どこ", who: "誰", which: "どれ", the: "", a: "", an: "", and: "そして", or: "または", but: "しかし", because: "なぜなら", if: "もし", then: "それから", so: "だから", just: "ただ", only: "だけ", also: "また", very: "とても", really: "本当に", still: "まだ", already: "もう", again: "再び", never: "決して", always: "いつも", maybe: "たぶん", now: "今", here: "ここ", there: "そこ", up: "上", down: "下", out: "外", in: "中", on: "上", off: "離れて", with: "と", without: "なしで", for: "のために", to: "へ", of: "の", at: "で", from: "から", about: "について", into: "の中へ", over: "越しに", back: "戻る", away: "去る",
  go: "行く", going: "行く", went: "行った", come: "来る", came: "来た", get: "得る", got: "得た", make: "作る", take: "取る", took: "取った", give: "与える", gave: "与えた", know: "知っている", think: "思う", want: "欲しい", need: "必要", see: "見る", saw: "見た", look: "見る", looks: "見る", looking: "見ている", watch: "見守る", watches: "見守る", say: "言う", says: "言う", said: "言った", tell: "伝える", told: "伝えた", ask: "尋ねる", asks: "尋ねる", asked: "尋ねた", try: "試す", tries: "試す", turn: "振り向く", turns: "振り向く", walk: "歩く", walks: "歩く", run: "走る", runs: "走る", stand: "立つ", stands: "立つ", sit: "座る", sits: "座る", open: "開く", opens: "開く", close: "閉じる", closes: "閉じる", enters: "入る", enter: "入る", leaves: "去る", leave: "去る", stops: "止まる", stop: "止まる", wait: "待つ", listen: "聞く", love: "愛", hate: "憎しみ", kill: "殺す", die: "死ぬ", dead: "死んだ", live: "生きる", help: "助ける", find: "見つける", found: "見つけた", pick: "拾う", picks: "拾う", hold: "持つ", holds: "持つ", pulls: "引く", pushes: "押す", grabs: "つかむ", smiles: "微笑む", laughs: "笑う", cries: "泣く", nods: "うなずく", shakes: "揺らす", sighs: "ため息をつく", beat: "（間）", pause: "（間）", silence: "沈黙", stares: "見つめる",
  man: "男", woman: "女", boy: "少年", girl: "少女", father: "父", mother: "母", dad: "父", mom: "母", brother: "兄弟", sister: "姉妹", friend: "友人", boss: "上司", teacher: "教師", doctor: "医者", police: "警察", cop: "警官", people: "人々", everyone: "みんな", nobody: "誰も", something: "何か", nothing: "何も", everything: "すべて", anything: "何か", time: "時間", day: "日", night: "夜", life: "人生", world: "世界", home: "家", door: "ドア", hand: "手", hands: "手", eyes: "目", face: "顔", head: "頭", phone: "電話", money: "金", name: "名前", work: "仕事", job: "仕事", way: "道", thing: "こと", things: "こと", good: "良い", bad: "悪い", great: "素晴らしい", best: "最高の", right: "正しい", wrong: "間違い", better: "より良い", real: "本物の", new: "新しい", old: "古い", little: "小さな", big: "大きな", long: "長い", young: "若い", alone: "ひとり", together: "一緒に", late: "遅い", sure: "確か", fine: "元気", okay_: "",
  ...LOCATION_JA,
};

export const STOP_NAMES = new Set(["CONTINUED", "MORE", "CONT'D", "FADE", "CUT", "INT", "EXT", "THE", "END", "TITLE", "SUPER", "ANGLE", "CLOSE", "INSERT", "BACK", "LATER", "DAY", "NIGHT", "OMITTED"]);
