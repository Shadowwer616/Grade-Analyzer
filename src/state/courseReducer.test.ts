import { describe, expect, it } from 'vitest';
import { courseReducer } from './courseReducer';
import { sampleCourse } from '../data/sampleCourse';
import { computeCourse } from '../lib/grade';

const item = (c: ReturnType<typeof sampleCourse>, id: string) => c.items.find((i) => i.id === id)!;

describe('courseReducer', () => {
  it('目标限制在 0–100', () => {
    expect(courseReducer(sampleCourse(), { type: 'setTarget', value: 120 }).target).toBe(100);
    expect(courseReducer(sampleCourse(), { type: 'setTarget', value: -3 }).target).toBe(0);
  });

  it('假设 / 清除假设：期末假设 81 后 R = 0，结论变「最终…」', () => {
    let c = courseReducer(sampleCourse(), { type: 'assume', id: 'final', value: 81 });
    expect(item(c, 'final').assumed).toBe(81);
    const r = computeCourse(c);
    expect(r.remainingWeight).toBe(0);
    expect(r.status).toBe('met');
    expect(r.conclusion.startsWith('最终')).toBe(true);
    c = courseReducer(c, { type: 'clearAssumption', id: 'final' });
    expect(item(c, 'final').assumed).toBeNull();
  });

  it('清除全部假设：期中二和期末均分需求', () => {
    const c = courseReducer(sampleCourse(), { type: 'clearAllAssumptions' });
    expect(c.items.every((i) => !i.assumed)).toBe(true);
    const r = computeCourse(c);
    // (85 − 32.6 − 2) / 0.6 = 84.0
    expect(r.required).toBeCloseTo(84, 6);
    expect(r.items.filter((i) => i.required !== null).map((i) => i.id)).toEqual(['m2', 'final']);
  });

  it('添加评分项：权重 0、未完成，不打乱权重合计；删除行', () => {
    let c = courseReducer(sampleCourse(), { type: 'addItem' });
    expect(c.items).toHaveLength(5);
    const added = c.items[4];
    expect(added.weight).toBe(0);
    expect(added.score).toBeNull();
    expect(new Set(c.items.map((i) => i.id)).size).toBe(5);
    expect(computeCourse(c).weightsOk).toBe(true);
    c = courseReducer(c, { type: 'removeItem', id: 'm1' });
    expect(c.items.map((i) => i.id)).not.toContain('m1');
    expect(computeCourse(c).weightTotal).toBe(80);
  });

  it('删除被期末替代的项时清掉 replaces', () => {
    let c = sampleCourse();
    c.items = c.items.map((i) => (i.id === 'final' ? { ...i, replaces: 'm1' } : i));
    c = courseReducer(c, { type: 'removeItem', id: 'm1' });
    expect(item(c, 'final').replaces).toBeNull();
  });

  it('修改已得分 / 权重即时生效', () => {
    const c = courseReducer(sampleCourse(), { type: 'updateItem', id: 'hw', patch: { score: 95 } });
    expect(computeCourse(c).current).toBeCloseTo((19 + 15.6) / 0.4 + 2, 6);
  });

  it('Bonus：删除、添加（最多 5、未得分）、修改', () => {
    let c = courseReducer(sampleCourse(), { type: 'removeBonus' });
    expect(c.bonus).toBeNull();
    expect(computeCourse(c).bonusPoints).toBe(0);
    c = courseReducer(c, { type: 'addBonus' });
    expect(c.bonus).toMatchObject({ max: 5, score: null });
    c = courseReducer(c, { type: 'updateBonus', patch: { score: 3 } });
    expect(computeCourse(c).bonusPoints).toBe(3);
    // 没有 Bonus 时 updateBonus 不生效
    const none = courseReducer(courseReducer(c, { type: 'removeBonus' }), { type: 'updateBonus', patch: { score: 1 } });
    expect(none.bonus).toBeNull();
  });

  it('重置回示例课程', () => {
    let c = courseReducer(sampleCourse(), { type: 'removeItem', id: 'hw' });
    c = courseReducer(c, { type: 'reset' });
    expect(c.items).toHaveLength(4);
    expect(computeCourse(c).current).toBeCloseTo(83.5, 6);
  });
});
