// 单门课的状态与修改动作（方案 §6：useReducer + Context）。纯函数，可单测。
// 阶段 2 只有一门课、不保存；阶段 4 再把课程数组同步到 localStorage。
import type { BonusItem, Course, GradeItem } from '../types';
import { sampleCourse } from '../data/sampleCourse';

export type CourseAction =
  | { type: 'setTarget'; value: number }
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
