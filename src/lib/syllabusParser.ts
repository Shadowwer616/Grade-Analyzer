// 阶段 6：syllabus 规则识别（纯函数，无 React、不连网）。
// 输入 syllabus 的纯文字，输出评分构成的候选项（名称、权重、满分、次数、去掉最低 K 次、Bonus、期末）
// + 认不出的片段 + 给用户看的提示。识别不了的交给预览表手改或 AI 兜底（lib/syllabusImport.ts）。
//
// 大致流程：
//   1. 逐行 NFKC 规范化（全角 → 半角），表格行按 | 或制表符拆格，去掉含 late / 迟交 / policy 的格或行
//   2. 一行里有多个「评分项 + 权重」时按逗号 / 分号拆段；否则整行一段，多个百分比取最后一个
//   3. 每段：先抽掉 best N of M、drop 的 K、10 × 15 pts、each、out of 这类结构，再找权重（% 或 pts）和次数
//   4. 只有名称没有权重的行，和紧跟的「只有数字」的行合并（PDF 表格常被拆成两行）
//   5. 评分项下面的说明行、全文里只提到一种评分项的句子，用来补次数 / drop / 满分
//   6. 有百分比就按百分比；全文只有 points 时按各项总分换算成百分比
//   7. 「两次期中各 20%」拆成两行；同名同权重去重；多个期中编号「期中一」「期中二」

export type ItemKind =
  | 'homework' | 'quiz' | 'lab' | 'midterm' | 'exam' | 'final' | 'participation'
  | 'project' | 'paper' | 'presentation' | 'bonus' | 'other';

/** 识别出的一个候选评分项（也是预览表的一行） */
export interface SyllabusItem {
  name: string;
  kind: ItemKind;
  /** 权重 %；Bonus 行时是「最多加分」（百分制的分数点） */
  weight: number;
  /** 满分；有次数时是每次满分 */
  max: number;
  /** 次数；null = 普通行（不开子项面板） */
  count: number | null;
  /** 去掉最低 K 次；只在有次数时生效 */
  drop: number;
  bonus: boolean;
  /** 期末行：导入后 id 为 final，可以「替代期中」 */
  final: boolean;
  /** 识别来源的原文片段（预览表每行下面灰字显示） */
  source: string;
}

export interface ParseResult {
  items: SyllabusItem[];
  /** 看起来像评分项（带百分比或分数）但没认出来的原文行 */
  unrecognized: string[];
  /** 给用户的提示：按 points 换算、只取了第一套方案、有重复项…… */
  notes: string[];
  /** percent = 按百分比；points = 全文只有分数，已换算；none = 一项都没认出来 */
  mode: 'percent' | 'points' | 'none';
  /** 从开头几行猜的课程名（如「MATH 221 Calculus I」）；猜不出为 null */
  courseName: string | null;
}

// ───────────────────────── 词表 ─────────────────────────

interface KindDef {
  kind: ItemKind;
  name: string;
  re: RegExp;
}

// 顺序不重要：一段里取「最早出现」的关键词，同位置取更长的（final project 胜过 final）
const KIND_DEFS: KindDef[] = [
  { kind: 'bonus', name: 'Bonus', re: /extra[\s-]*credits?|\bbonus(?:\s+points?)?|加分|附加分/ },
  {
    kind: 'project', name: '项目',
    re: /\b(?:final|term|group|course|class|semester|capstone)\s+projects?\b|\bprojects?\b|大作业|课程设计|项目/,
  },
  {
    kind: 'paper', name: '论文',
    re: /\b(?:final|term|research)\s+(?:papers?|essays?|reports?)\b|\bpapers?\b|\bessays?\b|论文/,
  },
  { kind: 'presentation', name: '展示', re: /\b(?:final\s+)?presentations?\b|展示|汇报/ },
  { kind: 'final', name: '期末', re: /\bfinal\b(?:\s+exam(?:ination)?s?\b)?|期末(?:考试|考核)?/ },
  { kind: 'midterm', name: '期中', re: /\bmid[\s-]?terms?\b(?:\s+exam(?:ination)?s?\b)?|期中(?:考试|考核)?/ },
  { kind: 'exam', name: '考试', re: /\b(?:exam(?:ination)?s?|tests?)\b|考试/ },
  { kind: 'quiz', name: '测验', re: /\bquiz(?:zes)?\b|测验|小测/ },
  { kind: 'lab', name: '实验', re: /\blab(?:s|oratory|oratories)?\b(?:\s+reports?\b)?|实验(?:报告)?/ },
  {
    kind: 'homework', name: '作业',
    re: /\bhome\s*works?\b|\bassignments?\b|\bhws?\b|\bproblem\s*sets?\b|\bp-?sets?\b|平时作业|课后作业|作业|习题/,
  },
  { kind: 'participation', name: '出勤', re: /\bparticipation\b|\battendance\b|出勤|考勤|平时(?:成绩|表现)?|课堂(?:参与|表现)/ },
];

const KIND_NAME: Record<ItemKind, string> = Object.fromEntries(KIND_DEFS.map((d) => [d.kind, d.name])) as Record<
  ItemKind,
  string
>;
KIND_NAME.other = '';

/** 这些行整行跳过（迟交扣分、各种 policy） */
const IGNORE_RE = /\blate\b|\blateness\b|迟交|晚交|逾期|补交|\bpolic(?:y|ies)\b/i;
/** 「没有加分」这类否定句 */
const NO_BONUS_RE = /\bno\s+(?:extra[\s-]*credit|bonus)|\bnot\s+(?:offer|give|provide)\w*\s+(?:any\s+)?(?:extra[\s-]*credit|bonus)|没有加分|不设加分|无加分|不加分/;
/** 「总评成绩」「final grade」这类词不算评分项，匹配前先抹掉 */
const GRADE_WORDS_RE =
  /\b(?:final|overall|total|course|semester|your)\s+(?:course\s+)?(?:grades?|scores?|marks?|averages?)\b|总评(?:成绩)?|总成绩|最终成绩|课程成绩|最终得分/g;
/** 合计行 */
const TOTAL_RE = /\btotal\b|合计|总计|总分|共计/;

const EN_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, twenty: 20,
  single: 1, i: 1, ii: 2, iii: 3, iv: 4, first: 1, second: 2, third: 3, fourth: 4,
};
const CN_DIGIT: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const CN_NUMERAL = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

const NUM = '(\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|twenty|[一二两三四五六七八九十]{1,3})';

/** 「8」「eight」「八」「十二」→ 数字；认不出返回 null */
export function toNumber(token: string | undefined): number | null {
  if (!token) return null;
  const t = token.trim().toLowerCase();
  if (/^\d+(?:\.\d+)?$/.test(t)) return Number(t);
  if (t in EN_NUM) return EN_NUM[t];
  if (/^[一二两三四五六七八九十]+$/.test(t)) {
    if (t === '十') return 10;
    const i = t.indexOf('十');
    if (i < 0) return t.length === 1 ? CN_DIGIT[t] : null;
    const tens = i === 0 ? 1 : CN_DIGIT[t[0]];
    const ones = i === t.length - 1 ? 0 : CN_DIGIT[t[i + 1]];
    return tens && ones !== undefined ? tens * 10 + ones : null;
  }
  return null;
}

const cnOrdinal = (n: number) => (n >= 1 && n <= 10 ? CN_NUMERAL[n] : String(n));
const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

// ───────────────────────── 文本工具 ─────────────────────────

/** 把 [start, end) 抹成空格（长度不变，后面的正则就看不到这段了） */
function mask(s: string, start: number, end: number): string {
  return s.slice(0, start) + ' '.repeat(Math.max(0, end - start)) + s.slice(end);
}

/** 用正则找第一个匹配，抹掉并返回匹配；没有返回 null */
function take(s: { v: string }, re: RegExp): RegExpExecArray | null {
  const m = re.exec(s.v);
  if (m) s.v = mask(s.v, m.index, m.index + m[0].length);
  return m;
}

/** 按分隔符拆，但不拆括号里面的 */
function splitTop(line: string, seps: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of line) {
    if (ch === '(' || ch === '[') depth++;
    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
    if (depth === 0 && seps.includes(ch)) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** 一行规范化：NFKC、引导点 / 破折号变空格、表格格子里含 late / policy 的格子去掉 */
function normalizeLine(raw: string): string {
  let s = raw.normalize('NFKC').replace(/[–—―]/g, '-').replace(/[·•●▪◦]/g, ' ');
  if (/[|\t]/.test(s)) {
    const cells = s.split(/\s*[|\t]+\s*/).map((c) => c.trim()).filter(Boolean);
    s = cells.filter((c) => !IGNORE_RE.test(c)).join('  ');
  }
  return s.replace(/\.{3,}|_{3,}|-{3,}|…+/g, ' ').replace(/\s+/g, ' ').trim();
}

// ───────────────────────── 识别一段 ─────────────────────────

interface Seg {
  /** 规范化后的原大小写文字（用来取未知项的名字） */
  text: string;
  kind: ItemKind | null;
  /** 关键词出现的位置 */
  kindAt: number;
  /** 期中 / 考试的编号（Midterm 2 → 2） */
  number: number | null;
  /** 一段里提到了几种评分项 */
  kindCount: number;
  /** 原文里的关键词（hw / assignments / 平时作业），去重时用 */
  label: string;
  pct: number | null;
  pctEach: number | null;
  pts: number | null;
  ptsEach: number | null;
  max: number | null;
  count: number | null;
  /** 有 drop 字样时的 K；没有为 null */
  drop: number | null;
  /** 有「90–100%」这类区间或等级字母：等级表行 */
  scale: boolean;
  /** 第一个权重数字的位置（取未知项名字用） */
  weightAt: number;
  /** 权重数字后面的文字结束位置 */
  weightEnd: number;
}

function findKind(lower: string): { kind: ItemKind | null; at: number; count: number; end: number; label: string } {
  let best: { kind: ItemKind; at: number; len: number } | null = null;
  const kinds = new Set<ItemKind>();
  for (const d of KIND_DEFS) {
    const m = d.re.exec(lower);
    if (!m) continue;
    kinds.add(d.kind);
    if (!best || m.index < best.at || (m.index === best.at && m[0].length > best.len)) {
      best = { kind: d.kind, at: m.index, len: m[0].length };
    }
  }
  return best
    ? { kind: best.kind, at: best.at, count: kinds.size, end: best.at + best.len, label: lower.slice(best.at, best.at + best.len) }
    : { kind: null, at: -1, count: 0, end: -1, label: '' };
}

/** 期中 / 考试的编号：Midterm 2、Midterm II、second midterm、期中考试二、第二次期中 */
function itemNumber(lower: string, kind: ItemKind, kindEnd: number): number | null {
  if (kind !== 'midterm' && kind !== 'exam') return null;
  const after = lower.slice(kindEnd);
  const m1 = /^\s*(?:exam\s*)?(?:#|no\.?\s*)?(\d|iv|i{1,3}|one|two|three|four|[一二三四])(?![a-z\d%.])/.exec(after);
  if (m1) {
    const n = toNumber(m1[1]);
    // 「Midterm 1 20%」里的 1 是编号；「Midterm 20%」不会走到这里（20 后面是 %）
    if (n && n <= 4) return n;
  }
  const m2 = /(first|second|third|fourth)\s+(?:mid[\s-]?term|exam|test)/.exec(lower);
  if (m2) return toNumber(m2[1]);
  const m3 = /第\s*([一二三四\d])\s*次\s*(?:期中|考试)/.exec(lower);
  if (m3) return toNumber(m3[1]);
  return null;
}

const COUNT_NOUNS =
  '(?:home\\s*works?|assignments?|problem\\s*sets?|p-?sets?|quiz(?:zes)?|labs?|lab\\s+reports?|mid[\\s-]?terms?|exams?|tests?|projects?|papers?|essays?|presentations?|reports?|worksheets?|activities|exercises?|responses?|reflections?|discussions?|posts?|journals?|homeworks?)';

function readSeg(text: string): Seg {
  const lower = text.toLowerCase().replace(GRADE_WORDS_RE, (m) => ' '.repeat(m.length));
  const found = findKind(lower);
  const s = { v: lower };
  const seg: Seg = {
    text,
    kind: found.kind,
    kindAt: found.at,
    number: found.kind ? itemNumber(lower, found.kind, found.end) : null,
    kindCount: found.count,
    label: found.label.replace(/\s+/g, ' ').replace(/(?:es|s)$/, ''),
    pct: null, pctEach: null, pts: null, ptsEach: null, max: null, count: null, drop: null,
    scale: false,
    weightAt: -1,
    weightEnd: -1,
  };
  // 编号抹掉，免得「Midterm 2」的 2 被当成次数
  if (seg.number !== null) {
    const m = /^\s*(?:exam\s*)?(?:#|no\.?\s*)?(?:\d|iv|i{1,3}|one|two|three|four|[一二三四])(?![a-z\d%.])/.exec(lower.slice(found.end));
    if (m) s.v = mask(s.v, found.end, found.end + m[0].length);
  }

  // 1. best 8 of 10 / 10 次取最好 8 次 / 8 of 10 quizzes count
  let m =
    take(s, new RegExp(`\\b(?:best|top|highest)\\s+${NUM}\\b(?:\\s+[a-z]+){0,2}?\\s+(?:of|out\\s+of)\\s+(?:the\\s+|your\\s+|all\\s+)?${NUM}\\b`)) ??
    null;
  let kept: number | null = null;
  let total: number | null = null;
  if (m) {
    kept = toNumber(m[1]);
    total = toNumber(m[2]);
  } else if ((m = take(s, new RegExp(`\\b${NUM}\\s+(?:out\\s+)?of\\s+(?:the\\s+|your\\s+)?${NUM}\\b(?=[^.;]*\\bcount)`)))) {
    kept = toNumber(m[1]);
    total = toNumber(m[2]);
  } else if ((m = take(s, new RegExp(`${NUM}\\s*次[^。;]*?(?:取|算|计)(?:其中)?(?:最好|最高|最佳|前)(?:的)?\\s*${NUM}\\s*次`)))) {
    total = toNumber(m[1]);
    kept = toNumber(m[2]);
  }
  if (kept !== null && total !== null && total > kept && total >= 2) {
    seg.count = total;
    seg.drop = total - kept;
  }

  // 2. drop the lowest K / 去掉最低 K 次
  const enDrop = /\b(?:drop(?:s|ped|ping)?|discard(?:s|ed)?|thrown\s+out|throw\s+out|not\s+(?:be\s+)?counted|excluded|ignored|removed|omitted)\b/.test(s.v) &&
    /\b(?:lowest|worst)\b/.test(s.v);
  const cnDrop = /(去掉|去除|舍去|删去|删除|不计|不算|剔除|丢弃|舍弃)/.test(s.v) && /最低/.test(s.v);
  if (seg.drop === null && (enDrop || cnDrop)) {
    const k =
      take(s, new RegExp(`\\b(?:lowest|worst)\\s+${NUM}\\b`)) ??
      take(s, new RegExp(`\\b${NUM}\\s+(?:lowest|worst)\\b`)) ??
      take(s, new RegExp(`最低(?:的)?\\s*${NUM}\\s*(?:次|个|份|篇)`)) ??
      take(s, new RegExp(`${NUM}\\s*(?:次|个|份|篇)\\s*(?:的)?最低`));
    seg.drop = (k && toNumber(k[1])) || 1;
  }

  // 3. 10 × 15 pts / 10 x 2%
  if ((m = take(s, /\b(\d{1,3})\s*(?:x|×|\*)\s*(\d+(?:\.\d+)?)\s*(%|pts?\b|points?\b|分)?/))) {
    const n = Number(m[1]);
    if (n >= 2 && seg.count === null) seg.count = n;
    if (m[3] === '%') seg.pctEach = Number(m[2]);
    else seg.ptsEach = Number(m[2]);
  }

  // 4. each：2% each / each worth 10 points / 每次 2% / 各 20%
  if ((m = take(s, /(?:\beach\s+(?:worth\s+|counts?\s+(?:for\s+)?|is\s+worth\s+)?|每次|每个|每份|每篇|各占?|分别占?)\s*(\d+(?:\.\d+)?)\s*%/)))
    seg.pctEach ??= Number(m[1]);
  else if ((m = take(s, /(\d+(?:\.\d+)?)\s*%\s*(?:each|apiece)\b/))) seg.pctEach ??= Number(m[1]);
  if ((m = take(s, /(?:\beach\s+(?:worth\s+|is\s+worth\s+|graded\s+out\s+of\s+|out\s+of\s+)?|每次\s*)(\d+(?:\.\d+)?)\s*(?:pts?\b|points?\b|分)/)))
    seg.ptsEach ??= Number(m[1]);
  else if ((m = take(s, /(\d+(?:\.\d+)?)\s*(?:pts?|points?)\s*(?:each|apiece)\b/))) seg.ptsEach ??= Number(m[1]);

  // 5. 满分：out of 100 / /50 / 满分 50 / 10-point scale
  if (
    (m = take(s, /\bout\s+of\s+(\d+(?:\.\d+)?)(?:\s*(?:pts?|points?)\b)?(?!\s*%)/)) ??
    (m = take(s, /满分\s*(?:为|是|:)?\s*(\d+(?:\.\d+)?)\s*分?/)) ??
    (m = take(s, /(?:^|[\s(])\/\s*(\d+(?:\.\d+)?)(?![\d/%])(?:\s*(?:pts?|points?)\b)?/)) ??
    (m = take(s, /(\d+)[\s-]*point\s+scale/))
  ) {
    const v = Number(m[1]);
    if (v > 0) seg.max = v;
  }

  // 6. 区间（等级表）：90-100%、90% - 100%、93 至 100
  if (/\d+(?:\.\d+)?\s*%?\s*(?:-|~|to|至|到)\s*\d+(?:\.\d+)?\s*%/.test(s.v)) seg.scale = true;

  // 7. 百分比：取最后一个（「Midterm 1 …… 20%」）
  const pcts = [...s.v.matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
  if (pcts.length) {
    const last = pcts[pcts.length - 1];
    const v = Number(last[1]);
    if (v > 0 && v <= 100) {
      seg.pct = v;
      seg.weightAt = pcts[0].index!;
      seg.weightEnd = last.index! + last[0].length;
    }
  }

  // 8. 分数：150 pts / 15 points / 40 分
  const pts = [
    ...s.v.matchAll(/(\d+(?:\.\d+)?)\s*(?:pts?|points?)\b/g),
    ...[...s.v.matchAll(/(\d+(?:\.\d+)?)\s*分(?![钟之制数])/g)].filter((x) => {
      const before = s.v.slice(Math.max(0, x.index! - 4), x.index);
      return !/(满分|扣|得|及格|最低|以上)\s*(?:为|是)?\s*$/.test(before) && !/^\s*(以上|以下)/.test(s.v.slice(x.index! + x[0].length));
    }),
  ].sort((a, b) => a.index! - b.index!);
  if (pts.length) {
    const last = pts[pts.length - 1];
    const v = Number(last[1]);
    if (v > 0) {
      seg.pts = v;
      if (seg.weightAt < 0) {
        seg.weightAt = pts[0].index!;
        seg.weightEnd = last.index! + last[0].length;
      }
    }
  }
  // 「Final exam (200 points) 40%」：有百分比时，分数当满分
  if (seg.pct !== null && seg.pts !== null && seg.max === null) seg.max = seg.pts;

  // 9. 次数：10 assignments / 11 weekly problem sets / Quizzes (10) / 10 次
  if (seg.count === null) {
    const c =
      new RegExp(`\\b${NUM}\\s+(?:\\(\\d+\\)\\s+)?(?:(?!lowest|highest|worst|best|of\\b|out\\b|points?\\b|pts\\b)[a-z-]+\\s+){0,2}?${COUNT_NOUNS}\\b`).exec(s.v) ??
      new RegExp(`${COUNT_NOUNS}\\s*\\((\\d{1,3})(?:\\s*total)?\\)`).exec(s.v) ??
      new RegExp(`(?<!(?:第|每周|每月|每天|每日)\\s*)${NUM}\\s*(?:次|个|份|篇|回)(?!\\s*(?:的)?最低)`).exec(s.v);
    const n = c ? toNumber(c[1]) : null;
    if (n !== null && n >= 2 && n <= 200) seg.count = n;
  }

  // 等级表行：名字是 A / B+ / 优 / 良 这种，或「90% and above」
  const head = seg.weightAt >= 0 ? text.slice(0, seg.weightAt) : text;
  if (
    !seg.kind &&
    (/^\s*(?:[a-f][+-]?|优秀?|良好?|中等?|及格|不及格)\s*[:=]?\s*$/i.test(head.replace(/[()]/g, '')) ||
      /\b(?:and|or)\s+(?:above|higher|better|below)\b|以上|以下|≥|>=/.test(lower))
  )
    seg.scale = true;
  return seg;
}

const hasWeight = (g: Seg) => g.pct !== null || g.pts !== null || g.pctEach !== null || g.ptsEach !== null;
/** 除了数字、%、pts 之外几乎没有字：「20%」「150 pts」这种单独一行 */
const weightOnly = (line: string) =>
  line.replace(/\d+(?:\.\d+)?|%|\bpts?\b|\bpoints?\b|\beach\b|分|[()（）:：.\s*x×/-]/gi, '').length === 0 && /\d/.test(line);

// ───────────────────────── 候选项 ─────────────────────────

interface Raw {
  kind: ItemKind;
  name: string;
  /** 期中 / 考试编号 */
  number: number | null;
  pct: number | null;
  pts: number | null;
  pctEach: number | null;
  ptsEach: number | null;
  max: number | null;
  count: number | null;
  drop: number | null;
  source: string;
  label: string;
}

/** 说明行里的次数 / drop / 满分补到候选项上（已有的不覆盖） */
function applyContext(r: Raw, g: Seg) {
  if (r.count === null && g.count !== null) r.count = g.count;
  if ((r.drop === null || r.drop === 0) && g.drop !== null) r.drop = g.drop;
  if (r.max === null && g.max !== null) r.max = g.max;
  if (r.ptsEach === null && g.ptsEach !== null) r.ptsEach = g.ptsEach;
}

const STOP_START = /^(?:the|your|you|students?|each|all|this|if|any|a|an|it|we|there|grades?|note|please|for|in|of|on|to|and|or|but|with|by|at|as|is|are|will)\b/i;
const PROSE = /\b(?:will|must|should|may|can|is|are|be|been|was|were|have|has|receive|earn|counts?|worth|of\s+the)\b|的|将|会|如果|需要|可以|应|请/i;

/** 没有关键词的段：取 % 前面（或后面）的文字当名字；太像句子、太长的不要 */
function unknownName(g: Seg): string | null {
  let name = g.weightAt >= 0 ? g.text.slice(0, g.weightAt) : '';
  if (!/[a-z一-鿿]/i.test(name)) name = g.weightEnd >= 0 ? g.text.slice(g.weightEnd) : '';
  name = name
    .replace(/\([^)]*\)?|\[[^\]]*\]?/g, ' ')
    .replace(/\b(?:worth|weight(?:ed)?|counts?(?:\s+for)?|accounts?\s+for|is|are|of)\b\s*$/i, ' ')
    .replace(/[:=：]|占|\s-\s|^\s*[-*•\d.)]+\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,.;]+$/, '');
  if (!name || !/[a-z一-鿿]/i.test(name)) return null;
  if (/^[a-f][+-]?$/i.test(name)) return null;
  const cjk = /[一-鿿]/.test(name);
  if (cjk ? name.length > 10 : name.length > 40 || name.split(' ').length > 6) return null;
  if (STOP_START.test(name) || PROSE.test(name)) return null;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function baseName(kind: ItemKind, number: number | null): string {
  if ((kind === 'midterm' || kind === 'exam') && number !== null) return KIND_NAME[kind] + cnOrdinal(number);
  return KIND_NAME[kind];
}

// ───────────────────────── 方案 A / B、课程名 ─────────────────────────

const OPTION_RE = /\b(?:option|plan|scheme|method|grading\s+(?:option|scheme))\s*[#:]?\s*([a-d1-4]|i{1,3}|one|two)\b|方案\s*([一二三abAB12])/gi;

/** 有两套以上方案时，从第二套开始的文字截掉 */
function cutSecondOption(lines: string[]): { lines: string[]; labels: string[] } {
  const seen: { label: string; line: number; at: number }[] = [];
  lines.forEach((l, i) => {
    for (const m of l.normalize('NFKC').matchAll(OPTION_RE)) {
      const label = (m[1] ?? m[2]).toLowerCase();
      seen.push({ label, line: i, at: m.index! });
    }
  });
  const labels = [...new Set(seen.map((x) => x.label))];
  if (labels.length < 2) return { lines, labels: [] };
  const second = seen.find((x) => x.label !== seen[0].label)!;
  const kept = lines.slice(0, second.line + 1);
  kept[second.line] = kept[second.line].normalize('NFKC').slice(0, second.at);
  return { lines: kept, labels: [seen[0].label, second.label] };
}

function guessCourseName(lines: string[]): string | null {
  for (const raw of lines.slice(0, 8)) {
    const l = raw.normalize('NFKC').trim();
    if (!l) continue;
    const cn = /课程名称\s*[:：]\s*(.+)/.exec(l) ?? /《([^》]{2,30})》/.exec(l);
    if (cn) return cn[1].trim().slice(0, 40);
    if (/\b[A-Z]{2,5}\s?-?\d{2,4}[A-Z]?\b/.test(l) && !/%/.test(l)) {
      const name = l
        .replace(/\b(?:course\s+)?syllabus\b|课程大纲|教学大纲/gi, '')
        .replace(/[\s:：\-–—|]+$/g, '')
        .replace(/^[\s:：\-–—|]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (name) return name.slice(0, 40);
    }
  }
  return null;
}

// ───────────────────────── 主函数 ─────────────────────────

export function parseSyllabus(input: string): ParseResult {
  const notes: string[] = [];
  const unrecognized: string[] = [];
  const allLines = input.replace(/\r\n?/g, '\n').split('\n');
  const courseName = guessCourseName(allLines);
  const { lines: rawLines, labels } = cutSecondOption(allLines);
  if (labels.length) {
    notes.push(
      `检测到两套评分方案（${labels.map((l) => l.toUpperCase()).join(' / ')}），只取了第一套。如果你按另一套算，请在预览表里改，或让 AI 帮忙。`,
    );
  }

  const lines = rawLines.map((raw) => ({ raw: raw.trim(), text: normalizeLine(raw) }));
  const raws: Raw[] = [];
  /** 每行用掉了没有；没用掉的、带 drop / 次数的行最后再当全文上下文用一次 */
  const used = new Array(lines.length).fill(false);
  let bonusMentionedNoNumber = false;
  let statedTotal: number | null = null;

  const push = (g: Seg, source: string): Raw | null => {
    const kind = g.kind!;
    const r: Raw = {
      kind,
      name: kind === 'other' ? '' : baseName(kind, g.number),
      number: g.number,
      pct: g.pct,
      pts: g.pts,
      pctEach: g.pctEach,
      ptsEach: g.ptsEach,
      max: g.max,
      count: g.count,
      drop: g.drop,
      source,
      label: g.label,
    };
    raws.push(r);
    return r;
  };

  for (let i = 0; i < lines.length; i++) {
    const { raw, text } = lines[i];
    if (!text) continue;
    if (IGNORE_RE.test(text)) {
      used[i] = true;
      continue;
    }
    const lower = text.toLowerCase();

    // 合计行：只记一下总分，用来对账
    if (TOTAL_RE.test(lower) && findKind(lower.replace(GRADE_WORDS_RE, ' ')).kind === null) {
      const t = readSeg(text);
      if (t.pts !== null) statedTotal = t.pts;
      used[i] = true;
      continue;
    }

    // 一行多个「评分项 + 权重」：按逗号 / 分号拆开
    const parts = splitTop(text, ',;，；、');
    const partSegs = parts.map((p) => readSeg(p.trim()));
    let segs: Seg[];
    if (partSegs.filter((g) => g.kind && hasWeight(g)).length >= 2) segs = partSegs.filter((g) => g.kind || hasWeight(g));
    else segs = [readSeg(text)];

    let lastRaw: Raw | null = null;
    for (const g0 of segs) {
      let g = g0;
      let source = segs.length > 1 ? g.text : raw;

      if (g.kind === 'bonus' && NO_BONUS_RE.test(g.text.toLowerCase())) {
        used[i] = true;
        continue;
      }

      // 名称一行、权重在下一两行（PDF 表格常见）
      if (g.kind && !hasWeight(g) && segs.length === 1) {
        for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
          const next = lines[j].text;
          if (!next) continue;
          if (weightOnly(next)) {
            const merged = readSeg(`${text} ${next}`);
            if (hasWeight(merged)) {
              // 中间夹着的说明行也算这一项的
              for (let k = i + 1; k < j; k++) {
                const mid = readSeg(lines[k].text);
                if (mid.count !== null && merged.count === null) merged.count = mid.count;
                if (mid.drop !== null && merged.drop === null) merged.drop = mid.drop;
                if (mid.max !== null && merged.max === null) merged.max = mid.max;
                used[k] = true;
              }
              g = merged;
              used[j] = true;
              source = `${raw} / ${lines[j].raw}`;
              lines[j] = { raw: lines[j].raw, text: '' };
            }
            break;
          }
          const nk = findKind(next.toLowerCase()).kind;
          if ((nk && nk !== g.kind) || hasWeight(readSeg(next))) break;
        }
      }

      if (!hasWeight(g)) continue;
      if (g.scale && !g.kind) {
        used[i] = true;
        continue;
      }

      if (g.kind) {
        lastRaw = push(g, source);
        used[i] = true;
        continue;
      }
      // 没有关键词：像个短名字就收，否则算没认出来
      const name = unknownName(g);
      if (name && !g.scale) {
        const r = push({ ...g, kind: 'other' }, source);
        if (r) r.name = name;
        lastRaw = r;
        used[i] = true;
      }
    }

    if (bonusMentioned(lower) && !segs.some((g) => g.kind === 'bonus' && hasWeight(g)) && !NO_BONUS_RE.test(lower)) {
      bonusMentionedNoNumber = true;
    }

    // 紧跟的说明行（没有权重、没有别的评分项），补次数 / drop / 满分
    if (lastRaw && segs.length === 1) {
      for (let j = i + 1, n = 0; j < lines.length && n < 3; j++, n++) {
        const next = lines[j].text;
        if (!next) break;
        if (IGNORE_RE.test(next)) break;
        const g = readSeg(next);
        if (hasWeight(g) && !(g.ptsEach !== null && g.pct === null && g.pts === null)) break;
        if (g.kind && g.kind !== lastRaw.kind) break;
        applyContext(lastRaw, g);
        used[j] = true;
      }
    }
  }

  // 全文里只提到一种评分项的句子：「Your two lowest quiz scores will be dropped.」
  lines.forEach(({ text }, i) => {
    if (used[i] || !text || IGNORE_RE.test(text)) return;
    const g = readSeg(text);
    if (!g.kind || g.kindCount !== 1 || hasWeight(g) && !(g.ptsEach !== null && g.pct === null && g.pts === null)) return;
    if (g.count === null && g.drop === null && g.max === null && g.ptsEach === null) return;
    const same = raws.filter((r) => r.kind === g.kind);
    if (same.length === 1) {
      applyContext(same[0], g);
      used[i] = true;
    }
  });

  // ── 按百分比还是按分数 ──
  const nonBonus = raws.filter((r) => r.kind !== 'bonus');
  const pctOf = (r: Raw) => r.pct ?? (r.pctEach !== null ? r.pctEach * (r.count ?? 1) : null);
  const ptsOf = (r: Raw) => r.pts ?? (r.ptsEach !== null ? r.ptsEach * (r.count ?? 1) : null);
  const percentMode = nonBonus.some((r) => pctOf(r) !== null);
  let mode: ParseResult['mode'] = 'none';
  let items: SyllabusItem[] = [];

  if (percentMode) {
    mode = 'percent';
    for (const r of raws) {
      const w = r.kind === 'bonus' ? pctOf(r) ?? r.pts : pctOf(r);
      if (w === null) {
        // 百分比 syllabus 里只写了分数的行：同类有百分比项时当补充说明，否则算没认出来
        const peer = raws.find((x) => x !== r && x.kind === r.kind && pctOf(x) !== null);
        if (peer) {
          if (peer.max === null && r.pts !== null && r.count === null) peer.max = r.pts;
          applyContext(peer, { ...emptySeg(), count: r.count, drop: r.drop, max: r.max, ptsEach: r.ptsEach });
        } else unrecognized.push(r.source);
        continue;
      }
      items.push(toItem(r, w, r.max));
    }
  } else if (nonBonus.some((r) => ptsOf(r) !== null)) {
    mode = 'points';
    const total = nonBonus.reduce((s, r) => s + (ptsOf(r) ?? 0), 0);
    for (const r of raws) {
      const p = ptsOf(r);
      if (p === null) continue;
      const w = (p / total) * 100;
      // 按分数算时，该项的总分就是它的满分；有次数时每次满分 = 总分 / 次数
      const max = r.count !== null && r.kind !== 'bonus' ? r.ptsEach ?? r.max ?? round2(p / r.count) : r.max ?? p;
      items.push(toItem(r, r.kind === 'bonus' ? round2(w) : w, max));
    }
    fixRounding(items);
    notes.push(
      `syllabus 按分数计分，已按各项合计 ${trimNum(total)} 分换算成百分比${
        statedTotal !== null && Math.abs(statedTotal - total) > 0.01
          ? `（syllabus 写的总分是 ${trimNum(statedTotal)}，和各项相加不一致，请核对）`
          : ''
      }。`,
    );
  }

  items = splitExams(items);
  items = dedupe(items, notes);
  numberDuplicates(items);
  markFinal(items);
  mergeBonus(items, notes);

  if (bonusMentionedNoNumber && !items.some((x) => x.bonus)) {
    notes.push('syllabus 提到了加分（extra credit / bonus），但没写最多加多少；需要的话在预览表里加一行 Bonus。');
  }
  if (items.some((x) => x.count === null && x.drop > 0)) {
    notes.push('有的项写了「去掉最低」但没写次数，填上次数后 drop 才会生效。');
  }

  // 没用上的、带百分比或分数的行 → 未识别
  lines.forEach(({ raw, text }, i) => {
    if (used[i] || !text || unrecognized.includes(raw)) return;
    const g = readSeg(text);
    if ((g.pct !== null || g.pts !== null) && !g.scale) unrecognized.push(raw);
  });

  if (items.length === 0) mode = 'none';
  return { items, unrecognized, notes, mode, courseName };
}

function bonusMentioned(lower: string) {
  return KIND_DEFS[0].re.test(lower);
}

function emptySeg(): Seg {
  return {
    text: '', kind: null, kindAt: -1, number: null, kindCount: 0, label: '', pct: null, pctEach: null, pts: null, ptsEach: null,
    max: null, count: null, drop: null, scale: false, weightAt: -1, weightEnd: -1,
  };
}

const trimNum = (v: number) => String(round2(v));

/** 每个候选项原文里的关键词（不放进 SyllabusItem，只给去重用） */
const LABEL = new WeakMap<SyllabusItem, string>();

function toItem(r: Raw, weight: number, max: number | null): SyllabusItem {
  const bonus = r.kind === 'bonus';
  const count = !bonus && r.kind !== 'final' && r.count !== null && r.count >= 2 ? r.count : null;
  const maxEach = count !== null ? r.ptsEach ?? max : max;
  const item: SyllabusItem = {
    name: r.name,
    kind: r.kind,
    weight: bonus ? round2(weight) : weight,
    max: maxEach !== null && maxEach > 0 ? maxEach : 100,
    count,
    drop: count !== null ? Math.min(r.drop ?? 0, count - 1) : r.drop ?? 0,
    bonus,
    final: false,
    source: r.source,
  };
  LABEL.set(item, r.label || r.name);
  return item;
}

/** 换算后的权重保留 1 位小数，差额补到最大的那项上，保证合计 100 */
function fixRounding(items: SyllabusItem[]) {
  const reg = items.filter((x) => !x.bonus);
  reg.forEach((x) => (x.weight = round1(x.weight)));
  const diff = round1(100 - reg.reduce((s, x) => s + x.weight, 0));
  if (diff !== 0 && reg.length) {
    const big = reg.reduce((a, b) => (b.weight > a.weight ? b : a));
    big.weight = round1(big.weight + diff);
  }
}

/** 「两次期中，各 20%」「Midterms (2) 40%」：期中 / 考试有 2–4 次且不 drop 时拆成几行 */
function splitExams(items: SyllabusItem[]): SyllabusItem[] {
  const out: SyllabusItem[] = [];
  for (const it of items) {
    if ((it.kind === 'midterm' || it.kind === 'exam') && it.count !== null && it.count <= 4 && it.drop === 0) {
      const n = it.count;
      const each = round1(it.weight / n);
      for (let k = 1; k <= n; k++) {
        const part: SyllabusItem = {
          ...it,
          name: KIND_NAME[it.kind] + cnOrdinal(k),
          count: null,
          // 最后一份补差，免得 3 × 33.3 ≠ 100
          weight: k === n ? round1(it.weight - each * (n - 1)) : each,
          max: 100,
        };
        LABEL.set(part, `${LABEL.get(it)}#${k}`);
        out.push(part);
      }
    } else out.push(it);
  }
  return out;
}

/** 同名同权重的去重（syllabus 常在表格和正文里各写一遍）；同名不同权重都留着并提示 */
function dedupe(items: SyllabusItem[], notes: string[]): SyllabusItem[] {
  const out: SyllabusItem[] = [];
  const warned = new Set<string>();
  for (const it of items) {
    const same = out.find((x) => x.name === it.name && x.kind === it.kind && x.bonus === it.bonus);
    // 同名同权重、而且原文写法也一样（都是 Homework）才当重复；HW 10% 和 Assignments 10% 是两项
    if (same && Math.abs(same.weight - it.weight) < 0.01 && LABEL.get(same) === LABEL.get(it)) {
      if (same.count === null && it.count !== null) {
        same.count = it.count;
        same.max = it.max;
      }
      if (same.drop === 0 && it.drop > 0) same.drop = it.count !== null || same.count !== null ? Math.min(it.drop, (same.count ?? it.count!) - 1) : it.drop;
      if (same.max === 100 && it.max !== 100 && same.count === it.count) same.max = it.max;
      continue;
    }
    if (same && Math.abs(same.weight - it.weight) >= 0.01 && it.name && !warned.has(it.name) && it.kind !== 'midterm' && it.kind !== 'exam') {
      warned.add(it.name);
      notes.push(`「${it.name}」出现了不止一次且权重不同，都列出来了，请删掉多余的那行。`);
    }
    out.push(it);
  }
  return out;
}

/** 名字相同的期中 / 考试按出现顺序编号：期中一、期中二 */
function numberDuplicates(items: SyllabusItem[]) {
  for (const kind of ['midterm', 'exam'] as const) {
    const group = items.filter((x) => x.kind === kind && x.name === KIND_NAME[kind]);
    const numbered = items.filter((x) => x.kind === kind && x.name !== KIND_NAME[kind]);
    if (group.length + numbered.length < 2 || group.length === 0) continue;
    let k = 1;
    const taken = new Set(numbered.map((x) => x.name));
    for (const it of group) {
      while (taken.has(KIND_NAME[kind] + cnOrdinal(k))) k++;
      it.name = KIND_NAME[kind] + cnOrdinal(k);
      taken.add(it.name);
    }
  }
}

/** 第一个期末类的项标为期末（导入后 id = final） */
function markFinal(items: SyllabusItem[]) {
  const f = items.find((x) => x.kind === 'final' && !x.bonus);
  if (f) f.final = true;
}

/** 课程只有一个 Bonus 行：多条加分合成一条，上限相加 */
function mergeBonus(items: SyllabusItem[], notes: string[]) {
  const bonuses = items.filter((x) => x.bonus);
  if (bonuses.length < 2) return;
  const first = bonuses[0];
  first.weight = round2(bonuses.reduce((s, b) => s + b.weight, 0));
  first.source = bonuses.map((b) => b.source).join(' / ');
  for (const b of bonuses.slice(1)) items.splice(items.indexOf(b), 1);
  notes.push(`有 ${bonuses.length} 条加分，课程只有一行 Bonus，已合并，上限相加为 ${trimNum(first.weight)}。`);
}
