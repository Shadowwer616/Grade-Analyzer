// 阶段 3：期末替代（经 reducer 走界面的同一条路）、期末行判定、等级表边界与自定义、结论句目标格式
import { describe, expect, it } from 'vitest';
import type { Course, GradeScaleId, ScaleEntry } from '../types';
import { REPLACE_LOWEST_MIDTERM } from '../types';
import { computeCourse, formatTarget, isFinalItem, replaceOptions } from './grade';
import { checkScale, gradeFloor, letterGrade, resolveScale } from './scales';
import { sampleCourse } from '../data/sampleCourse';
import { courseReducer } from '../state/courseReducer';

const setReplaces = (c: Course, replaces: string | null) =>
  courseReducer(c, { type: 'updateItem', id: 'final', patch: { replaces } });

describe('期末替代期中（示例课程）', () => {
  it('开启「可替代 期中一」：期末需要 81.0 → 80.0，结论句说明替代', () => {
    const before = computeCourse(sampleCourse());
    expect(before.required).toBeCloseTo(81, 9);
    const r = computeCourse(setReplaces(sampleCourse(), 'm1'));
    expect(r.required).toBeCloseTo(80, 9);
    expect(r.replacement?.active).toBe(true);
    expect(r.replacement?.requiredWith).toBeCloseTo(80, 9);
    expect(r.replacement?.requiredWithout).toBeCloseTo(81, 9);
    expect(r.conclusion).toBe('期末考到 80.0 会替代期中一（78.0），所以只需 80.0 而不是 81.0');
    expect(r.items.find((i) => i.id === 'final')!.summary).toBe('可替代期中一');
  });

  it('「分数最低的那次期中」：期中一 78 < 期中二假设 90，替代期中一，同样是 80.0', () => {
    const r = computeCourse(setReplaces(sampleCourse(), REPLACE_LOWEST_MIDTERM));
    expect(r.required).toBeCloseTo(80, 9);
    expect(r.replacement?.targetId).toBe('m1');
  });

  it('替代作业（85）：x′ = (85 − 2 − 15.6 − 18) / 0.6 = 82.3 < 85，不生效，仍需 81.0', () => {
    const r = computeCourse(setReplaces(sampleCourse(), 'hw'));
    expect(r.replacement?.active).toBe(false);
    expect(r.required).toBeCloseTo(81, 9);
    expect(r.conclusion).toBe('期末至少需要 81.0%，总评才能达到 85（B）');
  });

  it('改回「不替代」恢复 81.0；删掉被替代项时一并清掉引用', () => {
    const c = setReplaces(setReplaces(sampleCourse(), 'm1'), null);
    expect(computeCourse(c).required).toBeCloseTo(81, 9);
    const removed = courseReducer(setReplaces(sampleCourse(), 'm1'), { type: 'removeItem', id: 'm1' });
    expect(removed.items.find((i) => i.id === 'final')!.replaces).toBeNull();
  });

  it('期末已出分 83 > 期中一 78：当前成绩按替代算，取更高的', () => {
    const c = courseReducer(setReplaces(sampleCourse(), 'm1'), { type: 'updateItem', id: 'final', patch: { score: 83 } });
    const r = computeCourse(c);
    // 不替代：(17 + 15.6 + 33.2) / 0.8 + 2 = 84.25；替代：(17 + 0.6 × 83) / 0.8 + 2 = 85.5
    expect(r.current).toBeCloseTo(85.5, 9);
    expect(r.items.find((i) => i.id === 'final')!.summary).toBe('已替代期中一');
  });
});

describe('期末行判定与「可替代」选项', () => {
  it('id 为 final，或名称含「期末」/ final（不分大小写）', () => {
    expect(isFinalItem({ id: 'final', name: '大作业' })).toBe(true);
    expect(isFinalItem({ id: 'x', name: '期末考试' })).toBe(true);
    expect(isFinalItem({ id: 'x', name: 'Final Exam' })).toBe(true);
    expect(isFinalItem({ id: 'x', name: 'FINAL' })).toBe(true);
    expect(isFinalItem({ id: 'x', name: '期中一' })).toBe(false);
  });

  it('选项：不替代 / 其他每一行 / 分数最低的那次期中', () => {
    const opts = replaceOptions(sampleCourse(), 'final');
    expect(opts.map((o) => o.value)).toEqual(['', 'hw', 'm1', 'm2', REPLACE_LOWEST_MIDTERM]);
    expect(opts[opts.length - 1].disabled).toBe(false);
  });

  it('没有名称含「期中」的项时「分数最低的那次期中」置灰', () => {
    const c = sampleCourse();
    c.items = c.items.filter((i) => !i.name.includes('期中'));
    const last = replaceOptions(c, 'final').at(-1)!;
    expect(last.disabled).toBe(true);
  });
});

describe('等级表边界（0.05 容差）', () => {
  const g = (v: number, id: GradeScaleId) => letterGrade(v, resolveScale(id, null));

  it('美式 10 分制：每档下限及容差', () => {
    const cases: [number, string][] = [
      [100, 'A'], [93, 'A'], [92.95, 'A'], [92.94, 'A-'], [90, 'A-'], [89.94, 'B+'],
      [87, 'B+'], [83, 'B'], [80, 'B-'], [79.96, 'B-'], [79.94, 'C+'], [77, 'C+'], [73, 'C'],
      [70, 'C-'], [67, 'D+'], [63, 'D'], [60, 'D-'], [59.9, 'F'], [0, 'F'],
    ];
    for (const [v, want] of cases) expect(g(v, 'us-10'), String(v)).toBe(want);
  });

  it('美式整十', () => {
    const cases: [number, string][] = [
      [90, 'A'], [89.96, 'A'], [89.94, 'B'], [80, 'B'], [79.9, 'C'], [70, 'C'], [60, 'D'], [59.94, 'F'], [0, 'F'],
    ];
    for (const [v, want] of cases) expect(g(v, 'us-letter'), String(v)).toBe(want);
  });

  it('中国百分制', () => {
    const cases: [number, string][] = [
      [90, '优'], [89.95, '优'], [89.9, '良'], [80, '良'], [70, '中'], [60, '及格'], [59.96, '及格'], [59.94, '不及格'], [0, '不及格'],
    ];
    for (const [v, want] of cases) expect(g(v, 'cn-100'), String(v)).toBe(want);
  });

  it('目标按等级取下限：三种预设各取一档', () => {
    expect(gradeFloor('A-', resolveScale('us-10', null))).toBe(90);
    expect(gradeFloor('C', resolveScale('us-letter', null))).toBe(70);
    expect(gradeFloor('良', resolveScale('cn-100', null))).toBe(80);
  });
});

describe('自定义等级表', () => {
  const custom: ScaleEntry[] = [['P', 50], ['HD', 85], ['D', 75], ['C', 65]];

  it('阈值乱序也按下限从高到低判定，含容差', () => {
    const s = resolveScale('custom', custom);
    expect(letterGrade(85, s)).toBe('HD');
    expect(letterGrade(84.96, s)).toBe('HD');
    expect(letterGrade(84.9, s)).toBe('D');
    expect(letterGrade(65, s)).toBe('C');
    expect(letterGrade(50, s)).toBe('P');
    expect(letterGrade(49.9, s)).toBeNull();
    expect(gradeFloor('D', s)).toBe(75);
  });

  it('checkScale：排序、去空格；空名、重名、越界、重复下限报错', () => {
    expect(checkScale([[' A ', 90], ['B', 95]])).toEqual({ entries: [['B', 95], ['A', 90]], errors: [] });
    expect(checkScale([])).toMatchObject({ errors: ['至少要有一档'] });
    expect(checkScale([['', 90]]).errors).toContain('等级名不能为空');
    expect(checkScale([['A', 90], ['A', 80]]).errors).toContain('等级名不能重复');
    expect(checkScale([['A', 120]]).errors).toContain('下限要在 0–100 之间');
    expect(checkScale([['A', NaN]]).errors).toContain('下限要在 0–100 之间');
    expect(checkScale([['A', 80], ['B', 80]]).errors).toContain('两档的下限不能相同');
  });

  it('setScale 保存自定义表后等级和结论句都用新表', () => {
    let c = courseReducer(sampleCourse(), { type: 'setScale', gradeScale: 'custom', customScale: checkScale(custom).entries });
    expect(c.gradeScale).toBe('custom');
    const r = computeCourse(c);
    expect(r.currentGrade).toBe('D'); // 83.5
    expect(r.targetGrade).toBe('HD'); // 85
    expect(r.conclusion).toBe('期末至少需要 81.0%，总评才能达到 85（HD）');
    // 切回预设时保留自定义表，再切回来不用重填
    c = courseReducer(c, { type: 'setScale', gradeScale: 'cn-100' });
    expect(c.customScale).not.toBeNull();
    expect(computeCourse(c).currentGrade).toBe('良');
    c = courseReducer(c, { type: 'setScale', gradeScale: 'custom' });
    expect(computeCourse(c).currentGrade).toBe('D');
  });

  it('还没有自定义表时选「自定义」不切换（界面先打开编辑器）', () => {
    const c = sampleCourse();
    expect(courseReducer(c, { type: 'setScale', gradeScale: 'custom' })).toBe(c);
  });
});

describe('结论句目标格式「85（B）」', () => {
  it('整数不带小数，非整数保留 1 位，没有等级只写数字', () => {
    expect(formatTarget(85, 'B')).toBe('85（B）');
    expect(formatTarget(87.5, 'B+')).toBe('87.5（B+）');
    expect(formatTarget(79.96, 'B-')).toBe('80（B-）');
    expect(formatTarget(40, null)).toBe('40');
  });

  it('换等级表时目标等级跟着变', () => {
    const c = courseReducer(sampleCourse(), { type: 'setScale', gradeScale: 'cn-100' });
    expect(computeCourse(c).conclusion).toBe('期末至少需要 81.0%，总评才能达到 85（良）');
  });

  it('按等级设目标：B+ → 87，期末需要 (87 − 50.6 − 2) / 0.4 = 86.0', () => {
    const floor = gradeFloor('B+', resolveScale('us-10', null))!;
    const r = computeCourse(courseReducer(sampleCourse(), { type: 'setTarget', value: floor }));
    expect(r.required).toBeCloseTo(86, 9);
    expect(r.conclusion).toBe('期末至少需要 86.0%，总评才能达到 87（B+）');
  });
});
