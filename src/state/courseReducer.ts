// 单门课的状态与修改动作（方案 §6：useReducer + Context）。纯函数，可单测。
// 阶段 2 只有一门课、不保存；阶段 4 再把课程数组同步到 localStorage。
// 阶段 3：子项面板的编辑由 lib/advanced.ts 算出新的 advanced，再走 updateItem；等级表走 setScale。
import type { BonusItem, Course, GradeItem, GradeScaleId, ScaleEntry } from '../types';
import { sampleCourse } from '../data/sampleCourse';

export type CourseAction =
  | { type: 'setTarget'; value: number }
  /** 换等级表；customScale 给了就一并保存（自定义编辑器），不给则保留原有的自定义表 */
  | { type: 'setScale'; gradeScale: GradeScaleId; customScale?: ScaleEntry[] }
  | { type: 'updateItem'; id: string; patch: Partial<Omit<GradeItem, 'id'>> }
  | { type: 'addItem' }
  | { type: 'removeItem'; id: string }
  | { type: 'assume'; id: string; value: number }
  | { type: 'clearAssumption'; id: string }
  | { type: 'clearAllAssumptions' }
  | { type: 'addBonus' }
  | { type: 'updateBonus'; patch: Partial<BonusItem> }
  | { type: 'removeBonus' }
  | { type: 'reset' };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function newItemId(items: GradeItem[]): string {
  const taken = new Set(items.map((i) => i.id));
  let id: string;
  do id = 'i_' + Math.random().toString(36).slice(2, 8);
  while (taken.has(id));
  return id;
}

function mapItem(course: Course, id: string, f: (i: GradeItem) => GradeItem): GradeItem[] {
  return course.items.map((i) => (i.id === id ? f(i) : i));
}

function apply(course: Course, action: CourseAction): Course {
  switch (action.type) {
    case 'setTarget':
      return { ...course, target: clamp(action.value, 0, 100) };

    case 'setScale': {
      const customScale = action.customScale ?? course.customScale;
      // 选「自定义」但还没有自定义表时不切换（界面会先打开编辑器）
      if (action.gradeScale === 'custom' && !customScale?.length) return course;
      return { ...course, gradeScale: action.gradeScale, customScale };
    }

    case 'updateItem':
      return { ...course, items: mapItem(course, action.id, (i) => ({ ...i, ...action.patch })) };

    case 'addItem': {
      const item: GradeItem = { id: newItemId(course.items), name: '新评分项', weight: 0, max: 100, score: null };
      return { ...course, items: [...course.items, item] };
    }

    case 'removeItem':
      return {
        ...course,
        // 删掉的项若被期末替代引用，一并清掉引用
        items: course.items
          .filter((i) => i.id !== action.id)
          .map((i) => (i.replaces === action.id ? { ...i, replaces: null } : i)),
      };

    case 'assume':
      return { ...course, items: mapItem(course, action.id, (i) => ({ ...i, assumed: clamp(action.value, 0, 100) })) };

    case 'clearAssumption':
      return { ...course, items: mapItem(course, action.id, (i) => ({ ...i, assumed: null })) };

    case 'clearAllAssumptions':
      return {
        ...course,
        items: course.items.map((i) => ({
          ...i,
          assumed: null,
          ...(i.advanced ? { advanced: { ...i.advanced, assumed: i.advanced.assumed.map(() => null) } } : {}),
        })),
      };

    case 'addBonus':
      return course.bonus ? course : { ...course, bonus: { name: 'Bonus', max: 5, score: null } };

    case 'updateBonus':
      return course.bonus ? { ...course, bonus: { ...course.bonus, ...action.patch } } : course;

    case 'removeBonus':
      return { ...course, bonus: null };

    case 'reset':
      return sampleCourse();
  }
}

export function courseReducer(course: Course, action: CourseAction): Course {
  const next = apply(course, action);
  if (next === course || action.type === 'reset') return next;
  return { ...next, updatedAt: new Date().toISOString() };
}
