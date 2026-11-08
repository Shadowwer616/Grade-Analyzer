// 阶段 6：syllabus 导入的后半段（纯函数）。
// - 预览表：权重合计、一键归一化、校验
// - 预览表 → 课程对象（方案 §5）
// - AI 兜底（不连 API）：拼提示词让用户自己复制给 Claude / ChatGPT；从 AI 回复里抠出 JSON、校验、填回预览表
import type { AdvancedConfig, Course, GradeItem } from '../types';
import { normalizeWeights } from './grade';
import type { ItemKind, SyllabusItem } from './syllabusParser';

// ───────────────────────── 预览表 ─────────────────────────

/** 普通项（不含 Bonus）的权重合计 */
export function weightTotal(items: SyllabusItem[]): number {
  return Math.round(items.filter((i) => !i.bonus).reduce((s, i) => s + (Number.isFinite(i.weight) ? Math.max(0, i.weight) : 0), 0) * 10) / 10;
}

export const weightsOk = (items: SyllabusItem[]) => Math.abs(weightTotal(items) - 100) < 0.05;

/** 按比例把普通项权重改成合计 100（和评分表的「按比例归一化」同一套规则：1 位小数、差额补到最大项）；Bonus 不动 */
export function normalizeItems<T extends SyllabusItem>(items: T[]): T[] {
  const regular = items.filter((i) => !i.bonus);
  const fake = { items: regular.map((i, k) => ({ id: String(k), name: i.name, weight: i.weight, max: 100, score: null })) } as unknown as Course;
  const normalized = normalizeWeights(fake).items;
  let k = 0;
  return items.map((i) => (i.bonus ? i : { ...i, weight: normalized[k++].weight }));
}

/** 预览表里每行的问题；key 是行下标。全部为空才能导入 */
export function validateItems(items: SyllabusItem[]): { rows: Record<number, string[]>; errors: string[] } {
  const rows: Record<number, string[]> = {};
  const add = (k: number, msg: string) => (rows[k] ??= []).push(msg);
  items.forEach((it, k) => {
    if (!it.name.trim()) add(k, '名称不能为空');
    if (!Number.isFinite(it.weight) || it.weight < 0) add(k, it.bonus ? '最多加分要 ≥ 0' : '权重要 ≥ 0');
    if (!it.bonus) {
      if (!Number.isFinite(it.max) || it.max <= 0) add(k, '满分要 > 0');
      if (it.count !== null && (!Number.isInteger(it.count) || it.count < 1 || it.count > 200)) add(k, '次数要是 1–200 的整数');
      if (!Number.isInteger(it.drop) || it.drop < 0) add(k, '去掉最低要是 ≥ 0 的整数');
      else if (it.count !== null && it.drop > 0 && it.drop >= it.count) add(k, '去掉的次数要少于总次数');
    }
  });
  const errors: string[] = [];
  if (!items.some((i) => !i.bonus)) errors.push('至少要有一个评分项（Bonus 不算）');
  if (items.filter((i) => !i.bonus).length > 0 && weightTotal(items) <= 0) errors.push('权重合计是 0，先填权重');
  return { rows, errors };
}

const SLUG: Record<ItemKind, string> = {
  homework: 'hw', quiz: 'quiz', lab: 'lab', midterm: 'mid', exam: 'exam', final: 'final', participation: 'part',
  project: 'proj', paper: 'paper', presentation: 'pres', bonus: 'bonus', other: 'item',
};

/**
 * 预览表 → 课程对象。期末行 id 为 final（「可替代」下拉才会出现）；有次数的项开子项面板，
 * 分数都留空（未完成）；多条 Bonus 合并成一行（上限相加）。
 */
export function itemsToCourse(items: SyllabusItem[], opts: { id: string; name: string; target?: number }): Course {
  const taken = new Set<string>();
  const nextId = (base: string) => {
    let id = base;
    for (let k = 2; taken.has(id); k++) id = `${base}${k}`;
    taken.add(id);
    return id;
  };
  // 期末先占 final
  const finalIdx = items.findIndex((i) => i.final && !i.bonus);
  if (finalIdx >= 0) taken.add('final');

  const gradeItems: GradeItem[] = [];
  items.forEach((it, k) => {
    if (it.bonus) return;
    const id = k === finalIdx ? 'final' : nextId(SLUG[it.kind] ?? 'item');
    const item: GradeItem = { id, name: it.name.trim(), weight: it.weight, max: 100, score: null };
    if (it.count !== null && it.count >= 1) {
      const n = Math.floor(it.count);
      const adv: AdvancedConfig = {
        count: n,
        maxEach: it.max > 0 ? it.max : 100,
        dropLowest: Math.max(0, Math.min(Math.floor(it.drop), n - 1)),
        scores: Array(n).fill(null),
        assumed: Array(n).fill(null),
      };
      item.advanced = adv;
    } else {
      item.max = it.max > 0 ? it.max : 100;
    }
    gradeItems.push(item);
  });

  const bonuses = items.filter((i) => i.bonus);
  return {
    id: opts.id,
    name: opts.name.trim() || '新课程',
    target: opts.target ?? 85,
    gradeScale: 'us-10',
    customScale: null,
    items: gradeItems,
    bonus: bonuses.length
      ? {
          name: bonuses[0].name.trim() || 'Bonus',
          max: Math.round(bonuses.reduce((s, b) => s + Math.max(0, b.weight), 0) * 100) / 100,
          score: null,
        }
      : null,
    updatedAt: new Date().toISOString(),
  };
}

/** 空白行（预览表「加一行」） */
export function blankItem(): SyllabusItem {
  return { name: '', kind: 'other', weight: 0, max: 100, count: null, drop: 0, bonus: false, final: false, source: '' };
}

// ───────────────────────── AI 兜底：提示词 ─────────────────────────

const EXAMPLE = `{
  "name": "MATH 221 Calculus I",
  "items": [
    { "id": "hw", "name": "作业", "weight": 20, "max": 100, "score": null,
      "advanced": { "count": 10, "maxEach": 10, "dropLowest": 1 } },
    { "id": "mid1", "name": "期中一", "weight": 20, "max": 100, "score": null, "advanced": null },
    { "id": "mid2", "name": "期中二", "weight": 20, "max": 100, "score": null, "advanced": null },
    { "id": "final", "name": "期末", "weight": 40, "max": 100, "score": null, "advanced": null }
  ],
  "bonus": { "name": "Extra credit", "max": 3, "score": null }
}`;

/** 拼给 Claude / ChatGPT 的提示词：说明要求 + 输出格式 + syllabus 原文 */
export function buildAiPrompt(syllabus: string): string {
  return `请从下面这份课程 syllabus 里找出成绩的评分构成，只输出一个 JSON 对象，不要其他解释。

格式（字段和成绩计算器的课程对象一致）：
${EXAMPLE}

要求：
1. name：课程名（找不到就写 "新课程"）。
2. items：每个计入总评的评分项一行。
   - weight 是占总评的百分比数字（20 表示 20%），所有 items 的 weight 加起来应为 100；如果 syllabus 按分数（points）计分，请按各项分数占总分的比例换算成百分比。
   - max 是这一项的满分，没写就填 100。
   - 有多次（如 10 次作业、12 次小测）时填 advanced：count = 次数，maxEach = 每次满分（没写填 100），dropLowest = 去掉最低几次（"best 8 of 10" 表示 count 10、dropLowest 2；没写 drop 填 0）。只有一次的项 advanced 填 null。
   - 期末考试那一项的 id 必须是 "final"；其他 id 用简短英文，不要重复。
   - score 一律填 null。
   - 名称用中文：作业、测验、实验、期中（多次就写 期中一、期中二）、期末、出勤、项目 等；认不出的保留原名。
3. bonus：extra credit / bonus / 加分 不计入 100%，放在 bonus；max 是最多能给总评加几分（百分制）。没有就填 null。
4. 如果有两套评分方案（Option A / Option B），取第一套。迟交扣分、出勤政策等不是评分项，不要放进来。

syllabus 原文：
"""
${syllabus.trim()}
"""`;
}

// ───────────────────────── AI 兜底：解析回复 ─────────────────────────

export type AiParseResult =
  | { ok: true; items: SyllabusItem[]; courseName: string | null; warnings: string[] }
  | { ok: false; errors: string[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 「20」「"20%"」「20.5」→ 数字；其他 → null */
function numLike(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*%?\s*$/.exec(v);
    if (m) return Number(m[1]);
  }
  return null;
}

/** 轻度修复：中文 / 弯引号、结尾多余逗号、// 注释 */
function repairJson(s: string): string {
  return s
    .replace(/[“”″]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1');
}

function tryParse(s: string): unknown | undefined {
  for (const t of [s, repairJson(s)]) {
    try {
      return JSON.parse(t);
    } catch {
      /* 继续 */
    }
  }
  return undefined;
}

/** 从一段文字里抠出所有括号配平的 {...} / [...] 片段（跳过字符串里的括号） */
function balancedChunks(text: string): string[] {
  const out: string[] = [];
  for (let start = 0; start < text.length; start++) {
    const open = text[start];
    if (open !== '{' && open !== '[') continue;
    const stack: string[] = [];
    let inStr: string | null = null;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (ch === '\\') i++;
        else if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"') inStr = '"';
      else if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' || ch === ']') {
        const top = stack.pop();
        if ((ch === '}' && top !== '{') || (ch === ']' && top !== '[')) break;
        if (stack.length === 0) {
          out.push(text.slice(start, i + 1));
          start = i;
          break;
        }
      }
    }
  }
  return out;
}

/**
 * 从 AI 回复里找 JSON：先找 ```json 围栏，再找括号配平的片段，取第一个能解析的。
 * 返回解析结果；一个都解析不了返回 { error }。
 */
export function extractJson(reply: string): { value: unknown } | { error: string } {
  const text = reply.trim();
  if (!text) return { error: '粘贴框是空的' };
  const fences = [...text.matchAll(/```[a-zA-Z]*\s*\n?([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = [...fences, text, ...balancedChunks(text)];
  const sawBrace = /[{[]/.test(text);
  let first: unknown;
  for (const c of candidates) {
    const v = tryParse(c.trim());
    if (v === undefined || !(isObj(v) || Array.isArray(v))) continue;
    // 优先「像课程」的：有 items / course，或直接是数组
    if (Array.isArray(v) || 'items' in v || 'course' in v) return { value: v };
    first ??= v;
  }
  // 只解析出了里面的小片段（外层被截断）：算格式错误
  if (first !== undefined && !/"items"/.test(text)) return { value: first };
  return {
    error: sawBrace
      ? '找到了像 JSON 的内容，但格式不对（可能被截断了，或括号、引号不配对）。请让 AI 只输出完整的 JSON 再粘一次。'
      : '回复里没找到 JSON。请让 AI 按提示词里的格式只输出一个 JSON 对象。',
  };
}

const guessKind = (name: string, id: string): ItemKind => {
  const s = `${id} ${name}`.toLowerCase();
  if (id === 'final' || /期末|\bfinal\b/.test(s)) return 'final';
  if (/期中|mid/.test(s)) return 'midterm';
  if (/作业|homework|\bhw|assign/.test(s)) return 'homework';
  if (/测验|quiz/.test(s)) return 'quiz';
  if (/实验|\blab/.test(s)) return 'lab';
  if (/出勤|participation|attendance/.test(s)) return 'participation';
  if (/项目|project/.test(s)) return 'project';
  if (/考试|exam|test/.test(s)) return 'exam';
  return 'other';
};

/** 把 AI 回复解析成预览表的行；校验失败时说明哪里不对 */
export function parseAiReply(reply: string): AiParseResult {
  const ex = extractJson(reply);
  if ('error' in ex) return { ok: false, errors: [ex.error] };
  let root: unknown = ex.value;
  // 容忍外面再包一层：{ "course": {...} } 或直接给了 items 数组
  if (isObj(root) && isObj(root.course)) root = root.course;
  if (Array.isArray(root)) root = { items: root };
  if (!isObj(root)) return { ok: false, errors: ['JSON 最外层应该是一个对象 { "name", "items", "bonus" }'] };

  const errors: string[] = [];
  const warnings: string[] = [];
  if (!Array.isArray(root.items)) return { ok: false, errors: ['缺少 items 数组（评分项列表）'] };
  if (root.items.length === 0) return { ok: false, errors: ['items 是空的，AI 没给出任何评分项'] };

  const items: SyllabusItem[] = [];
  root.items.forEach((raw, k) => {
    const at = `items[${k}]`;
    if (!isObj(raw)) {
      errors.push(`${at} 不是对象`);
      return;
    }
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) errors.push(`${at}.name 缺失或不是文字`);
    const weight = numLike(raw.weight);
    if (weight === null) errors.push(`${at}.weight（${name || '这一项'}）不是数字`);
    else if (weight < 0) errors.push(`${at}.weight（${name}）不能是负数`);
    let max = numLike(raw.max);
    if (max === null || max <= 0) {
      if (raw.max !== undefined && raw.max !== null) warnings.push(`「${name}」的 max 不对，按 100 计`);
      max = 100;
    }
    const id = typeof raw.id === 'string' ? raw.id : '';
    let count: number | null = null;
    let drop = 0;
    const adv = raw.advanced;
    if (isObj(adv)) {
      const c = numLike(adv.count);
      if (c === null || !Number.isInteger(c) || c < 1 || c > 200) errors.push(`${at}.advanced.count（${name}）要是 1–200 的整数`);
      else count = c;
      const me = Array.isArray(adv.maxEach) ? numLike(adv.maxEach[0]) : numLike(adv.maxEach);
      if (me !== null && me > 0) max = me;
      else if (count !== null) max = 100;
      if (Array.isArray(adv.maxEach)) warnings.push(`「${name}」每次满分不同，先统一按第一次的 ${max} 计，导入后可在「高级」里逐次改`);
      const d = numLike(adv.dropLowest);
      if (d !== null && d > 0) {
        if (!Number.isInteger(d)) errors.push(`${at}.advanced.dropLowest（${name}）要是整数`);
        else if (count !== null && d >= count) errors.push(`${at}.advanced.dropLowest（${name}）要少于次数 ${count}`);
        else drop = d;
      }
    } else if (adv !== undefined && adv !== null) errors.push(`${at}.advanced 应为对象或 null`);
    const kind = guessKind(name, id);
    items.push({
      name,
      kind,
      weight: weight ?? 0,
      max,
      count,
      drop,
      bonus: false,
      final: false,
      source: 'AI 回复',
    });
  });

  // 期末：优先 id = final，其次名字像期末的第一项
  const fi = root.items.findIndex((r) => isObj(r) && r.id === 'final');
  const finalIdx = fi >= 0 ? fi : items.findIndex((i) => i.kind === 'final');
  if (finalIdx >= 0 && items[finalIdx]) items[finalIdx].final = true;

  // 权重写成 0.2 这种小数
  const reg = items.filter((i) => !i.bonus);
  const sum = reg.reduce((s, i) => s + i.weight, 0);
  if (reg.length && reg.every((i) => i.weight <= 1) && Math.abs(sum - 1) < 0.02) {
    reg.forEach((i) => (i.weight = Math.round(i.weight * 1000) / 10));
    warnings.push('权重是小数（0.2 这种），已乘以 100');
  }

  const b = root.bonus;
  if (isObj(b)) {
    const bmax = numLike(b.max);
    if (bmax === null || bmax < 0) errors.push('bonus.max 不是 ≥ 0 的数字');
    else
      items.push({
        name: typeof b.name === 'string' && b.name.trim() ? b.name.trim() : 'Bonus',
        kind: 'bonus',
        weight: bmax,
        max: 100,
        count: null,
        drop: 0,
        bonus: true,
        final: false,
        source: 'AI 回复',
      });
  } else if (b !== undefined && b !== null) errors.push('bonus 应为对象或 null');

  if (errors.length) return { ok: false, errors };
  const courseName = typeof root.name === 'string' && root.name.trim() && root.name.trim() !== '新课程' ? root.name.trim().slice(0, 60) : null;
  return { ok: true, items, courseName, warnings };
}
