// 多课程状态（阶段 4）：整个 SavedData 一个 reducer，纯函数可单测。
// 单门课的修改仍由 courseReducer 负责，这里只把它套在「当前课程」上。
import type { Course, MyScale, SavedData, ScaleEntry } from '../types';
import { courseFromTemplate, type TemplateId } from '../data/templates';
import { sampleCourse } from '../data/sampleCourse';
import { freshData, loadData, newCourseId, newScaleId, type KeyValueStore, type LoadStatus } from '../lib/storage';
import { readShareHash } from '../lib/share';
import { courseReducer, type CourseAction } from './courseReducer';

export type ImportMode =
  /** 没有同名课程，直接新增 */
  | 'new'
  /** 同名时另存为，名字自动加后缀 */
  | 'saveAs'
  /** 同名时覆盖那门课 */
  | 'overwrite';

export type AppAction =
  | { type: 'course'; action: CourseAction }
  | { type: 'switchCourse'; id: string }
  | { type: 'createCourse'; name: string; template: TemplateId }
  | { type: 'renameCourse'; id: string; name: string }
  | { type: 'deleteCourse'; id: string }
  | { type: 'importCourse'; course: Course; mode: ImportMode }
  /** 「存为我的预设」：同名预设会被覆盖 */
  | { type: 'saveMyScale'; name: string; entries: ScaleEntry[] }
  | { type: 'deleteMyScale'; id: string }
  /** 阶段 5：改预设名；空名或和其他预设重名时不改 */
  | { type: 'renameMyScale'; id: string; name: string };

export function currentCourse(data: SavedData): Course {
  return data.courses.find((c) => c.id === data.currentId) ?? data.courses[0];
}

/** 名字相同（去掉首尾空格后完全一致）的课程 */
export function findSameName(data: SavedData, name: string): Course | undefined {
  const n = name.trim();
  return data.courses.find((c) => c.name.trim() === n);
}

/** 「微积分 I」已存在 → 「微积分 I（2）」；「（2）」也有 → 「（3）」… */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const set = new Set([...taken].map((t) => t.trim()));
  const base = name.trim() || '未命名课程';
  if (!set.has(base)) return base;
  const stem = base.replace(/（\d+）$/, '');
  for (let k = 2; ; k++) {
    const candidate = `${stem}（${k}）`;
    if (!set.has(candidate)) return candidate;
  }
}

const now = () => new Date().toISOString();

function replaceCourse(data: SavedData, id: string, f: (c: Course) => Course): SavedData {
  let changed = false;
  const courses = data.courses.map((c) => {
    if (c.id !== id) return c;
    const next = f(c);
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...data, courses } : data;
}

export function appReducer(data: SavedData, action: AppAction): SavedData {
  switch (action.type) {
    case 'course': {
      const cur = currentCourse(data);
      return replaceCourse(data, cur.id, (c) => {
        const next = courseReducer(c, action.action);
        // reset 回到示例课程时保留这门课的 id 和名字，免得和其他课程撞 id
        return action.action.type === 'reset' && next !== c ? { ...next, id: c.id, name: c.name } : next;
      });
    }

    case 'switchCourse':
      return data.courses.some((c) => c.id === action.id) && action.id !== data.currentId
        ? { ...data, currentId: action.id }
        : data;

    case 'createCourse': {
      const id = newCourseId(data.courses.map((c) => c.id));
      const course = courseFromTemplate(id, action.name, action.template);
      return { ...data, courses: [...data.courses, course], currentId: id };
    }

    case 'renameCourse': {
      const name = action.name.trim();
      if (!name) return data;
      return replaceCourse(data, action.id, (c) => (c.name === name ? c : { ...c, name, updatedAt: now() }));
    }

    case 'deleteCourse': {
      const idx = data.courses.findIndex((c) => c.id === action.id);
      if (idx < 0) return data;
      const courses = data.courses.filter((c) => c.id !== action.id);
      // 删到一门不剩：自动建一门示例课程
      if (courses.length === 0) {
        const sample = sampleCourse();
        return { ...data, courses: [sample], currentId: sample.id };
      }
      const currentId =
        data.currentId === action.id ? courses[Math.min(idx, courses.length - 1)].id : data.currentId;
      return { ...data, courses, currentId };
    }

    case 'importCourse': {
      const taken = data.courses.map((c) => c.id);
      const same = findSameName(data, action.course.name);
      if (action.mode === 'overwrite' && same) {
        // 覆盖：放在原来的位置，换一个新 id，让界面（高级面板展开状态等）整体重建
        const id = newCourseId(taken);
        const imported = { ...action.course, id, name: same.name, updatedAt: now() };
        return {
          ...data,
          courses: data.courses.map((c) => (c.id === same.id ? imported : c)),
          currentId: id,
        };
      }
      const id = newCourseId(taken);
      const name =
        action.mode === 'saveAs' || same ? uniqueName(action.course.name, data.courses.map((c) => c.name)) : action.course.name;
      const imported = { ...action.course, id, name, updatedAt: now() };
      return { ...data, courses: [...data.courses, imported], currentId: id };
    }

    case 'saveMyScale': {
      const name = action.name.trim();
      if (!name || action.entries.length === 0) return data;
      const entries = action.entries.map(([l, m]) => [l, m] as ScaleEntry);
      const existing = data.myScales.find((s) => s.name === name);
      const myScales: MyScale[] = existing
        ? data.myScales.map((s) => (s.id === existing.id ? { ...s, entries } : s))
        : [...data.myScales, { id: newScaleId(data.myScales.map((s) => s.id)), name, entries }];
      return { ...data, myScales };
    }

    case 'deleteMyScale':
      return data.myScales.some((s) => s.id === action.id)
        ? { ...data, myScales: data.myScales.filter((s) => s.id !== action.id) }
        : data;

    case 'renameMyScale': {
      const name = action.name.trim();
      const target = data.myScales.find((s) => s.id === action.id);
      if (!target || !name || target.name === name) return data;
      if (data.myScales.some((s) => s.id !== action.id && s.name === name)) return data;
      return { ...data, myScales: data.myScales.map((s) => (s.id === action.id ? { ...s, name } : s)) };
    }
  }
}

/** 两张等级表是否一样（顺序无关），用来在下拉里认出「这门课正在用我的某个预设」 */
export function sameScale(a: ScaleEntry[] | null, b: ScaleEntry[] | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  const key = (s: ScaleEntry[]) => [...s].sort((x, y) => y[1] - x[1]).map(([l, m]) => `${l}\u0000${m}`).join('\u0001');
  return key(a) === key(b);
}

export { freshData };

// ───────────────────────── 打开页面 ─────────────────────────

export interface Boot {
  data: SavedData;
  status: LoadStatus;
  /** 分享链接里的课程和已有课程同名：等用户选「另存为」或「覆盖」 */
  conflict: Course | null;
  /** 分享链接已直接导入（没有同名）时的课程名 */
  imported: string | null;
  /** 分享链接解不开的原因 */
  shareError: string | null;
}

/**
 * 打开页面时：读 localStorage（空就建示例课程），再看地址里有没有分享链接。
 * 不同名的直接导入并切过去；同名的交给弹窗。纯函数（除了读 store），StrictMode 调两次也没关系。
 */
export function bootstrap(store: KeyValueStore | null, hash: string): Boot {
  const { data, status } = loadData(store);
  return { status, ...applyShareHash(data, hash) };
}

export function applyShareHash(data: SavedData, hash: string): Omit<Boot, 'status'> {
  const share = readShareHash(hash);
  if (!share) return { data, conflict: null, imported: null, shareError: null };
  if (!share.ok) return { data, conflict: null, imported: null, shareError: share.error };
  if (findSameName(data, share.course.name)) return { data, conflict: share.course, imported: null, shareError: null };
  const next = appReducer(data, { type: 'importCourse', course: share.course, mode: 'new' });
  return { data: next, conflict: null, imported: currentCourse(next).name, shareError: null };
}
