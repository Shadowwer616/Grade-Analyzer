// 阶段 5：评分项排序、空状态模板入口、「我的预设」改名 / 删除、有无假设的判断。
import { describe, expect, it } from 'vitest';
import type { Course, SavedData } from '../types';
import { sampleCourse } from '../data/sampleCourse';
import { courseFromTemplate, templateItems } from '../data/templates';
import { computeCourse } from './grade';
import { appReducer } from '../state/appStore';
import { courseReducer, hasAssumptions } from '../state/courseReducer';

const ids = (c: Course) => c.items.map((i) => i.id);

describe('moveItem 排序', () => {
  it('上移 / 下移：移到相邻项的位置', () => {
    let c = sampleCourse(); // hw, m1, m2, final
    c = courseReducer(c, { type: 'moveItem', id: 'm2', to: 1 });
    expect(ids(c)).toEqual(['hw', 'm2', 'm1', 'final']);
    c = courseReducer(c, { type: 'moveItem', id: 'hw', to: 1 });
    expect(ids(c)).toEqual(['m2', 'hw', 'm1', 'final']);
  });

  it('拖到两端；越界夹到两端；不动时返回原对象', () => {
    const c0 = sampleCourse();
    expect(ids(courseReducer(c0, { type: 'moveItem', id: 'final', to: 0 }))).toEqual(['final', 'hw', 'm1', 'm2']);
    expect(ids(courseReducer(c0, { type: 'moveItem', id: 'hw', to: 99 }))).toEqual(['m1', 'm2', 'final', 'hw']);
    expect(ids(courseReducer(c0, { type: 'moveItem', id: 'final', to: -3 }))).toEqual(['final', 'hw', 'm1', 'm2']);
    expect(courseReducer(c0, { type: 'moveItem', id: 'hw', to: 0 })).toBe(c0);
    expect(courseReducer(c0, { type: 'moveItem', id: 'nope', to: 1 })).toBe(c0);
  });

  it('排序不改变计算结果（含期末替代）', () => {
    const c0 = courseReducer(sampleCourse(), { type: 'updateItem', id: 'final', patch: { replaces: 'm1' } });
    const c1 = courseReducer(c0, { type: 'moveItem', id: 'final', to: 0 });
    const a = computeCourse(c0);
    const b = computeCourse(c1);
    expect(b.current).toBeCloseTo(a.current!, 9);
    expect(b.projected).toBeCloseTo(a.projected!, 9);
    expect(b.required).toBeCloseTo(80, 9);
    expect(b.conclusion).toBe(a.conclusion);
  });
});

describe('applyTemplate 空状态', () => {
  const empty = () => courseFromTemplate('c_x', '空课', 'blank');

  it('三段式模板填入三项，期末 id 为 final', () => {
    const c = courseReducer(empty(), { type: 'applyTemplate', template: 'hw-mid-final' });
    expect(c.items).toEqual(templateItems('hw-mid-final'));
    expect(c.items.map((i) => [i.name, i.weight])).toEqual([['作业', 20], ['期中', 30], ['期末', 50]]);
    expect(c.items[2].id).toBe('final');
    expect(computeCourse(c).weightsOk).toBe(true);
  });

  it('带实验的模板；空白模板加一行新评分项', () => {
    expect(courseReducer(empty(), { type: 'applyTemplate', template: 'hw-lab-final' }).items.map((i) => i.name)).toEqual([
      '作业', '实验', '期末',
    ]);
    const blank = courseReducer(empty(), { type: 'applyTemplate', template: 'blank' });
    expect(blank.items).toHaveLength(1);
    expect(blank.items[0]).toMatchObject({ name: '新评分项', weight: 0, max: 100, score: null });
  });

  it('已有评分项时不生效', () => {
    const c = sampleCourse();
    expect(courseReducer(c, { type: 'applyTemplate', template: 'hw-lab-final' })).toBe(c);
  });
});

describe('我的预设：改名 / 删除', () => {
  const data = (): SavedData => ({
    version: 1,
    currentId: 'c_sample',
    courses: [{ ...sampleCourse(), gradeScale: 'custom', customScale: [['A', 94], ['B', 80]] }],
    myScales: [
      { id: 's_1', name: '系里的表', entries: [['A', 94], ['B', 80]] },
      { id: 's_2', name: '宽松版', entries: [['A', 90], ['B', 75]] },
    ],
  });

  it('改名：去掉首尾空格；空名、重名不改', () => {
    const d = data();
    expect(appReducer(d, { type: 'renameMyScale', id: 's_1', name: '  数学系  ' }).myScales[0].name).toBe('数学系');
    expect(appReducer(d, { type: 'renameMyScale', id: 's_1', name: '   ' })).toBe(d);
    expect(appReducer(d, { type: 'renameMyScale', id: 's_1', name: '宽松版' })).toBe(d);
    expect(appReducer(d, { type: 'renameMyScale', id: 's_9', name: '新名' })).toBe(d);
  });

  it('删除预设不影响已经用它的课程（课程自带 customScale）', () => {
    const d = appReducer(data(), { type: 'deleteMyScale', id: 's_1' });
    expect(d.myScales.map((s) => s.id)).toEqual(['s_2']);
    expect(d.courses[0].customScale).toEqual([['A', 94], ['B', 80]]);
    expect(computeCourse(d.courses[0]).currentGrade).toBe('B');
  });
});

describe('hasAssumptions', () => {
  it('主表假设、子项假设都算；清除全部后为 false', () => {
    const c = sampleCourse();
    expect(hasAssumptions(c)).toBe(true);
    const cleared = courseReducer(c, { type: 'clearAllAssumptions' });
    expect(hasAssumptions(cleared)).toBe(false);
    const sub = courseReducer(cleared, {
      type: 'updateItem',
      id: 'hw',
      patch: { advanced: { count: 2, maxEach: 10, dropLowest: 0, scores: [9, null], assumed: [null, 8] } },
    });
    expect(hasAssumptions(sub)).toBe(true);
  });
});
