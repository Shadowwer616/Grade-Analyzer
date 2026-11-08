// 本地保存（阶段 4，方案 §5「本地保存」）：localStorage 里存一个 SavedData 对象。
// 读的时候逐字段兜底：坏字段换成默认值，坏课程丢掉，什么都读不出来就退回示例课程，永远不抛错。
// 同一套 sanitizeCourse 也用于分享链接导入（lib/share.ts）。
import type {
  AdvancedConfig, BonusItem, Course, GradeItem, GradeScaleId, MyScale, SavedData, ScaleEntry,
} from '../types';
import { sampleCourse } from '../data/sampleCourse';
import { checkScale } from './scales';

export const STORAGE_KEY = 'grade-calculator:v1';
/** 读到坏数据时，原文先备份到这里再被新数据覆盖，方便手动找回 */
export const BACKUP_KEY = 'grade-calculator:v1:corrupt';

/** 只用到 localStorage 的这三个方法；测试里传一个假的 */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// ───────────────────────── id ─────────────────────────

const rand = () => Math.random().toString(36).slice(2, 8);
export const newCourseId = (taken: Iterable<string> = []) => uniqueId('c_', taken);
export const newScaleId = (taken: Iterable<string> = []) => uniqueId('s_', taken);

function uniqueId(prefix: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  let id: string;
  do id = prefix + rand();
  while (set.has(id));
  return id;
}

// ───────────────────────── 字段兜底 ─────────────────────────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** 有限数或 null；其他（字符串、NaN、undefined）一律当 null */
const numOrNull = (v: unknown): number | null => num(v);

const SCALE_IDS: GradeScaleId[] = ['us-10', 'us-letter', 'cn-100', 'custom'];

/** 等级表：每档 [非空名字, 0–100 的数]，名字和下限都不重复；不合格返回 null */
export function sanitizeScale(v: unknown): ScaleEntry[] | null {
  if (!Array.isArray(v)) return null;
  const entries: ScaleEntry[] = [];
  for (const e of v) {
    if (!Array.isArray(e) || e.length < 2) return null;
    const label = str(e[0]);
    const min = num(e[1]);
    if (label === null || min === null) return null;
    entries.push([label, min]);
  }
  const { entries: sorted, errors } = checkScale(entries);
  return errors.length ? null : sorted;
}

const MAX_SUB = 200;

function sanitizeAdvanced(v: unknown): AdvancedConfig | null {
  if (!isObj(v)) return null;
  const count = num(v.count);
  if (count === null || count < 0) return null;
  const n = Math.min(MAX_SUB, Math.floor(count));
  const fit = (arr: unknown, f: (x: unknown) => number | null) =>
    Array.from({ length: n }, (_, k) => (Array.isArray(arr) ? f(arr[k]) : null));

  let maxEach: number | number[];
  if (Array.isArray(v.maxEach)) {
    maxEach = fit(v.maxEach, (x) => {
      const m = num(x);
      return m !== null && m > 0 ? m : null;
    }).map((m) => m ?? 10);
  } else {
    const m = num(v.maxEach);
    maxEach = m !== null && m > 0 ? m : 10;
  }
  const drop = num(v.dropLowest);
  const nonNeg = (x: unknown) => {
    const s = num(x);
    return s !== null && s >= 0 ? s : null;
  };
  return {
    count: n,
    maxEach,
    dropLowest: drop === null ? 0 : clamp(Math.floor(drop), 0, Math.max(0, n - 1)),
    scores: fit(v.scores, nonNeg),
    assumed: fit(v.assumed, nonNeg),
  };
}

function sanitizeItem(v: unknown, taken: Set<string>): GradeItem | null {
  if (!isObj(v)) return null;
  let id = str(v.id)?.trim() || '';
  if (!id || taken.has(id)) id = uniqueId('i_', taken);
  taken.add(id);
  const weight = num(v.weight);
  const max = num(v.max);
  const score = numOrNull(v.score);
  const assumed = numOrNull(v.assumed);
  const item: GradeItem = {
    id,
    name: str(v.name) ?? '',
    weight: weight !== null && weight >= 0 ? weight : 0,
    max: max !== null && max > 0 ? max : 100,
    score: score !== null && score >= 0 ? score : null,
  };
  if (assumed !== null) item.assumed = clamp(assumed, 0, 100);
  const adv = sanitizeAdvanced(v.advanced);
  if (adv) item.advanced = adv;
  const replaces = str(v.replaces);
  if (replaces) item.replaces = replaces;
  return item;
}

function sanitizeBonus(v: unknown): BonusItem | null {
  if (!isObj(v)) return null;
  const max = num(v.max);
  const score = numOrNull(v.score);
  return {
    name: str(v.name) ?? 'Bonus',
    max: max !== null && max >= 0 ? max : 5,
    score: score !== null && score >= 0 ? score : null,
  };
}

/**
 * 把任意 JSON 值整理成合法的 Course；连对象都不是时返回 null。
 * 能保留的字段都原样保留（advanced、replaces、gradeScale、customScale 一个不丢）。
 */
export function sanitizeCourse(v: unknown): Course | null {
  if (!isObj(v)) return null;
  const taken = new Set<string>();
  const items = (Array.isArray(v.items) ? v.items : [])
    .map((i) => sanitizeItem(i, taken))
    .filter((i): i is GradeItem => i !== null);
  // 期末替代引用了不存在的项（又不是「最低期中」）时清掉
  for (const i of items) {
    if (i.replaces && i.replaces !== 'lowest-midterm' && (i.replaces === i.id || !taken.has(i.replaces))) delete i.replaces;
  }
  const customScale = sanitizeScale(v.customScale);
  let gradeScale = SCALE_IDS.includes(v.gradeScale as GradeScaleId) ? (v.gradeScale as GradeScaleId) : 'us-10';
  if (gradeScale === 'custom' && !customScale) gradeScale = 'us-10';
  const target = num(v.target);
  const name = str(v.name)?.trim();
  return {
    id: str(v.id)?.trim() || newCourseId(),
    name: name || '未命名课程',
    target: target === null ? 85 : clamp(target, 0, 100),
    gradeScale,
    customScale,
    items,
    bonus: sanitizeBonus(v.bonus),
    updatedAt: str(v.updatedAt) ?? new Date().toISOString(),
  };
}

function sanitizeMyScale(v: unknown): MyScale | null {
  if (!isObj(v)) return null;
  const entries = sanitizeScale(v.entries);
  const name = str(v.name)?.trim();
  if (!entries || !name) return null;
  return { id: str(v.id) || newScaleId(), name, entries };
}

/** 一份全新的数据：只有示例课程 */
export function freshData(): SavedData {
  const c = sampleCourse();
  return { version: 1, currentId: c.id, courses: [c], myScales: [] };
}

/**
 * 整理整个存储对象。recovered = 有东西被丢掉或改掉（用来决定要不要备份原文、提示用户）。
 * 课程 id 重复时后来的换新 id；一门课都没有时补示例课程。
 */
export function sanitizeData(v: unknown): { data: SavedData; recovered: boolean } {
  if (!isObj(v) || !Array.isArray(v.courses)) return { data: freshData(), recovered: true };
  let recovered = v.version !== 1;
  const ids = new Set<string>();
  const courses: Course[] = [];
  for (const raw of v.courses) {
    const c = sanitizeCourse(raw);
    if (!c) {
      recovered = true;
      continue;
    }
    if (ids.has(c.id)) c.id = newCourseId(ids);
    ids.add(c.id);
    courses.push(c);
  }
  if (courses.length === 0) return { data: freshData(), recovered: true };

  const scaleIds = new Set<string>();
  const myScales: MyScale[] = [];
  for (const raw of Array.isArray(v.myScales) ? v.myScales : []) {
    const s = sanitizeMyScale(raw);
    if (!s) {
      recovered = true;
      continue;
    }
    if (scaleIds.has(s.id)) s.id = newScaleId(scaleIds);
    scaleIds.add(s.id);
    myScales.push(s);
  }

  const cur = str(v.currentId);
  const currentId = cur && ids.has(cur) ? cur : courses[0].id;
  return { data: { version: 1, currentId, courses, myScales }, recovered };
}

// ───────────────────────── 读写 ─────────────────────────

export type LoadStatus =
  /** 第一次打开，建了示例课程 */
  | 'empty'
  | 'ok'
  /** 读到坏数据，已兜底（原文备份在 BACKUP_KEY） */
  | 'recovered'
  /** 浏览器不让用 localStorage（隐私模式、禁用存储等），本次不保存 */
  | 'unavailable';

/** 取 window.localStorage；拿不到（或访问就抛错）时返回 null */
export function browserStorage(): KeyValueStore | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = STORAGE_KEY + ':probe';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function loadData(store: KeyValueStore | null): { data: SavedData; status: LoadStatus } {
  if (!store) return { data: freshData(), status: 'unavailable' };
  let raw: string | null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return { data: freshData(), status: 'unavailable' };
  }
  if (raw === null || raw === '') return { data: freshData(), status: 'empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  const { data, recovered } = sanitizeData(parsed);
  if (recovered) {
    try {
      store.setItem(BACKUP_KEY, raw);
    } catch {
      /* 备份失败也不影响使用 */
    }
  }
  return { data, status: recovered ? 'recovered' : 'ok' };
}

/** 写入；失败（存储满、被禁用）返回 false */
export function saveData(store: KeyValueStore | null, data: SavedData): boolean {
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
