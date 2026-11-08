// 单门课的状态与修改动作（方案 §6：useReducer + Context）。纯函数，可单测。
// 阶段 2 只有一门课、不保存；阶段 4 再把课程数组同步到 localStorage。
// 阶段 3：子项面板的编辑由 lib/advanced.ts 算出新的 advanced，再走 updateItem；等级表走 setScale。
// 阶段 4：多课程在 state/appStore.ts，这里仍只管一门课；新增 clearScores、normalizeWeights，updateItem 加 commit。
// 阶段 5：新增 moveItem（上移 / 下移 / 拖动排序）、applyTemplate（空状态的模板入口）。
import type { BonusItem, Course, GradeItem, GradeScaleId, ScaleEntry } from '../types';
import { sampleCourse } from '../data/sampleCourse';
import { templateItems, type TemplateId } from '../data/templates';
import { isFinalItem, normalizeWeights } from '../lib/grade';

export type CourseAction =
  | { type: 'setTarget'; value: number }
  /** 换等级表；customScale 给了就一并保存（自定义编辑器），不给则保留原有的自定义表 */
  | { type: 'setScale'; gradeScale: GradeScaleId; customScale?: ScaleEntry[] }
  /**
   * 改一行。commit = 名称输入框失焦时传 true：这时才检查改名后是否还是期末行，
   * 不是的话清掉 replaces（输入过程中不判断，免得打字途中误清）。
   */
  | { type: 'updateItem'; id: string; patch: Partial<Omit<GradeItem, 'id'>>; commit?: boolean }
  | { type: 'addItem' }
  | { type: 'removeItem'; id: string }
  | { type: 'assume'; id: string; value: number }
  | { type: 'clearAssumption'; id: string }
  | { type: 'clearAllAssumptions' }
  | { type: 'addBonus' }
  | { type: 'updateBonus'; patch: Partial<BonusItem> }
  | { type: 'removeBonus' }
  /** 保留结构，清掉已得分、子项分、所有假设、Bonus 已得 */
  | { type: 'clearScores' }
  /** 权重按比例归一化到合计 100（grade.ts 的 normalizeWeights） */
  | { type: 'normalizeWeights' }
  /** 把一项移到第 to 位（0 起，按移动后的数组算）；越界时夹到两端 */
  | { type: 'moveItem'; id: string; to: number }
  /** 空状态的模板入口：只在没有评分项时生效，按模板填入评分项 */
  | { type: 'applyTemplate'; template: TemplateId }
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

    case 'updateItem': {
      const target = course.items.find((i) => i.id === action.id);
      if (!target) return course;
      let next: GradeItem = { ...target, ...action.patch };
      if (action.commit && next.replaces && !isFinalItem(next)) next = { ...next, replaces: null };
      if (Object.keys(action.patch).length === 0 && next.replaces === target.replaces) return course;
      return { ...course, items: mapItem(course, action.id, () => next) };
    }

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

    case 'clearScores':
      return {
        ...course,
        items: course.items.map((i) => ({
          ...i,
          score: null,
          assumed: null,
          ...(i.advanced
            ? { advanced: { ...i.advanced, scores: i.advanced.scores.map(() => null), assumed: i.advanced.assumed.map(() => null) } }
            : {}),
        })),
        bonus: course.bonus ? { ...course.bonus, score: null } : null,
      };

    case 'normalizeWeights': {
      const next = normalizeWeights(course);
      return next.items.every((i, k) => i.weight === course.items[k].weight) ? course : next;
    }

    case 'moveItem': {
      const from = course.items.findIndex((i) => i.id === action.id);
      if (from < 0) return course;
      const to = clamp(Math.round(action.to), 0, course.items.length - 1);
      if (to === from) return course;
      const items = course.items.filter((i) => i.id !== action.id);
      items.splice(to, 0, course.items[from]);
      return { ...course, items };
    }

    case 'applyTemplate': {
      if (course.items.length > 0) return course;
      const items = templateItems(action.template);
      // 空白模板：加一行新评分项，和「添加评分项」一样
      return items.length > 0 ? { ...course, items } : apply(course, { type: 'addItem' });
    }

    case 'reset':
      return sampleCourse();
  }
}

export function courseReducer(course: Course, action: CourseAction): Course {
  const next = apply(course, action);
  if (next === course || action.type === 'reset') return next;
  return { ...next, updatedAt: new Date().toISOString() };
}

/** 有没有任何假设（主表或子项）：「清除全部假设」「清空假设」按钮据此置灰 */
export function hasAssumptions(course: Course): boolean {
  return course.items.some(
    (i) => (i.assumed !== null && i.assumed !== undefined) || !!i.advanced?.assumed.some((a) => a !== null),
  );
}
