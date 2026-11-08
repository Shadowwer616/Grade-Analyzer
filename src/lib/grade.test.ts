import { describe, expect, it } from 'vitest';
import type { AdvancedConfig, Course, GradeItem } from '../types';
import {
  atLeast,
  computeCourse,
  evaluateSubItems,
  formatScore,
  normalizeWeights,
  subItemRequirement,
} from './grade';
import { gradeFloor, letterGrade, resolveScale } from './scales';

// ── 工具 ──

function course(items: GradeItem[], extra: Partial<Course> = {}): Course {
  return {
    id: 'c_test',
    name: '测试课程',
    target: 85,
    gradeScale: 'us-10',
    customScale: null,
    items,
    bonus: null,
    updatedAt: '2026-11-07T20:30:00-06:00',
    ...extra,
  };
}

const item = (id: string, name: string, weight: number, score: number | null, extra: Partial<GradeItem> = {}): GradeItem => ({
  id, name, weight, max: 100, score, ...extra,
});

/** 方案 §3 贯穿算例：作业 85（20%）、期中一 78（20%）、期中二假设 90（20%）、期末未考（40%）、Bonus +2、目标 85 */
function walkthrough(replaces: string | null = null): Course {
  return course(
    [
      item('hw', '作业', 20, 85),
      item('m1', '期中一', 20, 78),
      item('m2', '期中二', 20, null, { assumed: 90 }),
      item('final', '期末', 40, null, { replaces }),
    ],
    { bonus: { name: '课堂参与 Bonus', max: 5, score: 2 } },
  );
}

/** 方案 §3：10 次 × 10 分，去掉 1 次，已完成 8 次 */
const homeworkPanel = (): AdvancedConfig => ({
  count: 10,
  maxEach: 10,
  dropLowest: 1,
  scores: [9, 8, 10, 6, 9, 7, 10, 9, null, null],
  assumed: Array(10).fill(null),
});

// ── §3 贯穿算例 ──

describe('§3 贯穿算例', () => {
  const r = computeCourse(walkthrough());

  it('当前成绩 C = (17 + 15.6) / 0.4 + 2 = 83.5 → B', () => {
    expect(r.current).toBeCloseTo(83.5, 6);
    expect(r.currentGrade).toBe('B');
  });

  it('已锁定 E = 50.6，剩余 R = 40%', () => {
    expect(r.locked).toBeCloseTo(50.6, 6);
    expect(r.remainingWeight).toBeCloseTo(40, 6);
  });

  it('含假设预估 P = 50.6 / 0.6 + 2 = 86.3 → B', () => {
    expect(r.projected).toBeCloseTo(86.333333, 5);
    expect(formatScore(r.projected!)).toBe('86.3');
    expect(r.projectedGrade).toBe('B');
  });

  it('期末需要 x = (85 − 50.6 − 2) / 0.4 = 81.0，可达', () => {
    expect(r.required).toBeCloseTo(81, 6);
    expect(r.status).toBe('reachable');
    expect(r.statusLabel).toBe('可达');
    const fin = r.items.find((i) => i.id === 'final')!;
    expect(fin.required).toBeCloseTo(81, 6);
    expect(r.conclusion).toBe('期末至少需要 81.0%，总评才能达到 85（B）');
  });

  it('最低 / 最高可能 52.6 / 92.6（A-），距目标还需 32.4', () => {
    expect(r.minPossible).toBeCloseTo(52.6, 6);
    expect(r.maxPossible).toBeCloseTo(92.6, 6);
    expect(r.maxGrade).toBe('A-');
    expect(r.gap).toBeCloseTo(32.4, 6);
  });

  it('开启「期末替代期中一」：x′ = (85 − 2 − 17 − 18) / 0.6 = 80.0 > 78，期末至少 80', () => {
    const rr = computeCourse(walkthrough('m1'));
    expect(rr.required).toBeCloseTo(80, 6);
    expect(rr.replacement).toMatchObject({ finalId: 'final', targetId: 'm1', active: true });
    expect(rr.replacement!.requiredWithout).toBeCloseTo(81, 6);
    expect(rr.replacement!.requiredWith).toBeCloseTo(80, 6);
    expect(rr.conclusion).toBe('期末考到 80.0 会替代期中一（78.0），所以只需 80.0 而不是 81.0');
    expect(rr.items.find((i) => i.id === 'final')!.summary).toBe('可替代期中一');
    // 当前成绩、已锁定、最低可能不受替代影响；最高可能变成期末 100 替代期中一
    expect(rr.current).toBeCloseTo(83.5, 6);
    expect(rr.locked).toBeCloseTo(50.6, 6);
    expect(rr.minPossible).toBeCloseTo(52.6, 6);
    expect(rr.maxPossible).toBeCloseTo(97, 6);
  });

  it('作业若用子项面板：去掉最低 1 次后 62 / 70 = 88.6%', () => {
    const sub = evaluateSubItems(homeworkPanel());
    expect(sub.dropApplied).toBe(true);
    expect(sub.dropped).toEqual([3]); // 6 分那次
    expect(sub.keptScore).toBe(62);
    expect(sub.keptMax).toBe(70);
    expect(formatScore(sub.currentPercent!)).toBe('88.6');
    expect(sub.status).toBe('pending');
    expect(sub.summary).toBe('10 次 · 去掉最低 1 次 · 已完成 8/10');
  });

  it('作业要达到 90%：剩余 2 次每次至少 (0.9 × 90 − 62) / 2 = 9.5 分', () => {
    const req = subItemRequirement(evaluateSubItems(homeworkPanel()), 90)!;
    expect(req.each[8]).toBeCloseTo(9.5, 6);
    expect(req.each[9]).toBeCloseTo(9.5, 6);
    expect(req.each.slice(0, 8).every((v) => v === null)).toBe(true);
    expect(req.percent).toBeCloseTo(95, 6);
  });

  it('子项面板接进主表：主表要求作业 90% 时面板换算成每次 9.5', () => {
    // 作业是唯一未完成项、其余已锁定使作业恰好需要 90%
    const c = course([
      item('hw', '作业', 20, null, { advanced: homeworkPanel() }),
      item('rest', '其他', 80, 90),
    ], { target: 90 });
    const r2 = computeCourse(c);
    const hw = r2.items.find((i) => i.id === 'hw')!;
    expect(hw.required).toBeCloseTo(90, 6);
    expect(hw.subRequired!.each[8]).toBeCloseTo(9.5, 6);
    // 部分完成的子项面板按已完成部分计入当前成绩：0.2×88.571 + 0.8×90 = 89.71
    expect(r2.current).toBeCloseTo((0.2 * (62 / 70) * 100 + 72) / 1, 6);
  });
});

// ── §3 边界表 ──

describe('§3 边界', () => {
  it('权重合计 ≠ 100%：提示，并按 w_i / Σw 计算；一键归一化后合计 100', () => {
    const c = course([item('a', '作业', 10, 80), item('b', '期末', 20, null)], { target: 80 });
    const r = computeCourse(c);
    expect(r.weightsOk).toBe(false);
    expect(r.weightTotal).toBe(30);
    // 作业占 1/3，期末占 2/3：x = (80 − 80/3) / (2/3) = 80
    expect(r.required).toBeCloseTo(80, 6);

    const n = normalizeWeights(c);
    expect(n.items.map((i) => i.weight)).toEqual([33.3, 66.7]);
    expect(computeCourse(n).weightsOk).toBe(true);

    const three = normalizeWeights(course([item('a', 'a', 1, null), item('b', 'b', 1, null), item('c', 'c', 1, null)]));
    expect(three.items.reduce((s, i) => s + i.weight, 0)).toBeCloseTo(100, 9);
  });

  it('R = 0（全部完成或假设）：不给需求分，只给最终成绩与达成 / 未达成', () => {
    const c = course([item('a', '作业', 50, 90), item('b', '期末', 50, null, { assumed: 80 })], { target: 85 });
    const r = computeCourse(c);
    expect(r.remainingWeight).toBe(0);
    expect(r.required).toBeNull();
    expect(r.items.every((i) => i.required === null)).toBe(true);
    expect(r.final).toBeCloseTo(85, 6);
    expect(r.status).toBe('met');
    expect(r.conclusion).toBe('最终 85.0（B），达到目标 85（B）');

    const r2 = computeCourse({ ...c, target: 90 });
    expect(r2.status).toBe('notMet');
    expect(r2.statusLabel).toBe('未达成');
    expect(r2.conclusion).toBe('最终 85.0（B），未达到目标 90（A-）');
  });

  it('已完成子项数 ≤ K：不 drop，提示「成绩再多些后生效」', () => {
    const sub = evaluateSubItems({
      count: 5, maxEach: 10, dropLowest: 2,
      scores: [4, 10, null, null, null], assumed: [],
    });
    expect(sub.dropApplied).toBe(false);
    expect(sub.dropWaiting).toBe(true);
    expect(sub.dropped).toEqual([]);
    expect(sub.currentPercent).toBeCloseTo(70, 6);
  });

  it('子项全部未完成：该项按未完成处理，面板显示「每次至少 X」', () => {
    const adv: AdvancedConfig = { count: 4, maxEach: 10, dropLowest: 1, scores: [null, null, null, null], assumed: [] };
    const c = course([item('hw', '作业', 50, null, { advanced: adv }), item('m', '期中', 50, 70)], { target: 80 });
    const r = computeCourse(c);
    const hw = r.items.find((i) => i.id === 'hw')!;
    expect(hw.status).toBe('pending');
    expect(hw.currentPercent).toBeNull();
    expect(r.current).toBeCloseTo(70, 6); // 只按期中
    expect(hw.required).toBeCloseTo(90, 6);
    expect(hw.subRequired!.each).toEqual([9, 9, 9, 9].map((v) => expect.closeTo(v, 6)));
  });

  it('Bonus 已得 > 最多加分：标红，按上限计', () => {
    const c = course([item('a', '期末', 100, 80)], { bonus: { name: 'B', max: 3, score: 5 } });
    const r = computeCourse(c);
    expect(r.bonusOverMax).toBe(true);
    expect(r.bonusPoints).toBe(3);
    expect(r.current).toBeCloseTo(83, 6);
  });

  it('Bonus 让总分超过 100 时不封顶', () => {
    const c = course([item('a', '期末', 100, 99)], { bonus: { name: 'B', max: 5, score: 5 } });
    expect(computeCourse(c).final).toBeCloseTo(104, 6);
  });

  it('替代目标和期末都已出分：直接比较，高者生效，摘要「已替代期中一」', () => {
    const base = [item('m1', '期中一', 30, 60), item('final', '期末', 70, 90, { replaces: 'm1' })];
    const r = computeCourse(course(base));
    expect(r.replacement!.active).toBe(true);
    expect(r.final).toBeCloseTo(90, 6); // 期中一按 90 计
    expect(r.current).toBeCloseTo(90, 6);
    expect(r.items.find((i) => i.id === 'final')!.summary).toBe('已替代期中一');
    expect(r.items.find((i) => i.id === 'm1')!.replacedBy).toBe('final');

    // 期末更低时不替代
    const r2 = computeCourse(course([item('m1', '期中一', 30, 95), base[1]]));
    expect(r2.replacement!.active).toBe(false);
    expect(r2.final).toBeCloseTo(0.3 * 95 + 0.7 * 90, 6);
    expect(r2.items.find((i) => i.id === 'final')!.summary).toBe('可替代期中一');
  });
});

// ── 可行性三态与其他规则 ──

describe('可行性', () => {
  it('x > 100 → 无法达到，显示最高可达 E + B + 100R', () => {
    const r = computeCourse(course([item('a', '期中', 60, 50), item('b', '期末', 40, null)], { target: 85 }));
    expect(r.required).toBeCloseTo((85 - 30) / 0.4, 6);
    expect(r.status).toBe('unreachable');
    expect(r.maxPossible).toBeCloseTo(70, 6);
    expect(r.conclusion).toBe('剩余项全部满分最高也只有 70.0（C-），达不到目标 85（B）');
  });

  it('x ≤ 0 → 已达成', () => {
    const r = computeCourse(course([item('a', '期中', 90, 100), item('b', '期末', 10, null)], { target: 85 }));
    expect(r.required!).toBeLessThanOrEqual(0);
    expect(r.status).toBe('secured');
    expect(r.statusLabel).toBe('已达成');
    expect(r.conclusion).toBe('已稳拿 90.0，剩余项全部 0 分也能达到目标 85（B）');
  });

  it('多项未完成时均分剩余需求', () => {
    const r = computeCourse(course([
      item('a', '作业', 40, 80),
      item('b', '期中', 30, null),
      item('c', '期末', 30, null),
    ], { target: 86 }));
    expect(r.required).toBeCloseTo(90, 6);
    expect(r.items.filter((i) => i.required !== null)).toHaveLength(2);
    expect(r.conclusion).toBe('剩余 2 项每项至少需要 90.0%，总评才能达到 86（B）');
  });

  it('没有任何已完成项：当前成绩为空，预估为空', () => {
    const r = computeCourse(course([item('a', '期中', 50, null), item('b', '期末', 50, null)]));
    expect(r.current).toBeNull();
    expect(r.projected).toBeNull();
    expect(r.required).toBeCloseTo(85, 6);
  });

  it('空课程 → empty', () => {
    const r = computeCourse(course([]));
    expect(r.status).toBe('empty');
  });
});

describe('进位与容差', () => {
  it('79.96 算 80：等级和可行性都按 80', () => {
    const scale = resolveScale('us-10', null);
    expect(letterGrade(79.96, scale)).toBe('B-');
    expect(letterGrade(79.9, scale)).toBe('C+');
    expect(atLeast(79.96, 80)).toBe(true);
    expect(atLeast(79.9, 80)).toBe(false);

    const r = computeCourse(course([item('a', '期末', 100, 79.96)], { target: 80 }));
    expect(r.status).toBe('met');
  });

  it('显示保留 1 位小数', () => {
    expect(formatScore(86.3333)).toBe('86.3');
    expect(formatScore(81)).toBe('81.0');
    expect(formatScore(-0.01)).toBe('0.0');
  });
});

describe('等级表', () => {
  it('三个预设', () => {
    expect(letterGrade(93, resolveScale('us-10', null))).toBe('A');
    expect(letterGrade(88, resolveScale('us-letter', null))).toBe('B');
    expect(letterGrade(75, resolveScale('cn-100', null))).toBe('中');
    expect(letterGrade(59, resolveScale('cn-100', null))).toBe('不及格');
  });

  it('自定义等级表；低于所有档返回 null', () => {
    const custom = resolveScale('custom', [['P', 60], ['H', 85]]);
    expect(letterGrade(90, custom)).toBe('H');
    expect(letterGrade(70, custom)).toBe('P');
    expect(letterGrade(50, custom)).toBeNull();
  });

  it('目标按等级：取该等级下限', () => {
    expect(gradeFloor('B+', resolveScale('us-10', null))).toBe(87);
    expect(gradeFloor('Z', resolveScale('us-10', null))).toBeNull();
  });
});

describe('子项面板', () => {
  it('子项假设：没有未完成子项时这一项算「假设」，drop 只用在已完成里', () => {
    const adv: AdvancedConfig = {
      count: 4, maxEach: 10, dropLowest: 1,
      scores: [5, 9, 10, null], assumed: [null, null, null, 2],
    };
    const sub = evaluateSubItems(adv);
    expect(sub.status).toBe('assumed');
    expect(sub.dropped).toEqual([0]); // 去掉已完成里的 5，而不是假设的 2
    expect(sub.percent).toBeCloseTo((9 + 10 + 2) / 30 * 100, 6);
    expect(sub.currentPercent).toBeCloseTo(95, 6);
  });

  it('每次满分不同：按各自满分同比例换算', () => {
    const adv: AdvancedConfig = {
      count: 3, maxEach: [10, 10, 20], dropLowest: 0,
      scores: [8, 10, null], assumed: [],
    };
    const sub = evaluateSubItems(adv);
    const req = subItemRequirement(sub, 80)!;
    // 需要 0.8 × 40 − 18 = 14 分，最后一次满分 20
    expect(req.each[2]).toBeCloseTo(14, 6);
    expect(req.percent).toBeCloseTo(70, 6);
  });

  it('§5 示例课程能算出自洽的结果', () => {
    const c: Course = {
      id: 'c_8f3a', name: '微积分 I', target: 85, gradeScale: 'us-10', customScale: null,
      items: [
        { id: 'hw', name: '作业', weight: 20, max: 100, score: null,
          advanced: { count: 10, maxEach: 10, dropLowest: 1,
            scores: [9, 8, 10, 6, 9, 7, 10, 9, null, null],
            assumed: [null, null, null, null, null, null, null, null, 9, null] } },
        { id: 'm1', name: '期中一', weight: 20, max: 100, score: 78 },
        { id: 'm2', name: '期中二', weight: 20, max: 100, score: null, assumed: 90 },
        { id: 'final', name: '期末', weight: 40, max: 100, score: null, replaces: 'm1' },
      ],
      bonus: { name: '课堂参与 Bonus', max: 5, score: 2 },
      updatedAt: '2026-11-07T20:30:00-06:00',
    };
    const r = computeCourse(c);
    // 作业还有 1 次没完成也没假设 → 主表仍按未完成；E = 15.6 + 18 = 33.6，R = 60%
    expect(r.locked).toBeCloseTo(33.6, 6);
    expect(r.remainingWeight).toBeCloseTo(60, 6);
    // 不替代：(85 − 2 − 33.6) / 0.6 = 82.33；替代期中一：(85 − 2 − 18) / 0.8 = 81.25 > 78
    expect(r.replacement!.requiredWithout).toBeCloseTo(82.3333, 3);
    expect(r.required).toBeCloseTo(81.25, 6);
    // 作业需要 81.25%：0.8125 × 90 − (62 + 9) = 2.125，剩 1 次满分 10
    const hw = r.items.find((i) => i.id === 'hw')!;
    expect(hw.subRequired!.each[9]).toBeCloseTo(2.125, 6);
    expect(hw.summary).toBe('10 次 · 去掉最低 1 次 · 已完成 8/10');
  });
});

describe('期末替代：更多情况', () => {
  it('分数最低的那次期中：自动选最低的那次', () => {
    const c = course([
      item('m1', '期中一', 20, 88),
      item('m2', '期中二', 20, 70),
      item('hw', '作业', 20, 90),
      item('final', '期末', 40, null, { replaces: 'lowest-midterm' }),
    ], { target: 85 });
    const r = computeCourse(c);
    expect(r.replacement!.candidates).toEqual(['m1', 'm2']);
    expect(r.replacement!.targetId).toBe('m2');
    expect(r.replacement!.active).toBe(true);
    // 不替代：(85 − 17.6 − 14 − 18) / 0.4 = 88.5；替代期中二：(85 − 17.6 − 18) / 0.6 = 82.33 > 70
    expect(r.replacement!.requiredWithout).toBeCloseTo(88.5, 6);
    expect(r.required).toBeCloseTo(82.3333, 3);
    expect(r.conclusion).toBe('期末考到 82.3 会替代期中二（70.0），所以只需 82.3 而不是 88.5');
  });

  it('替代不划算时不生效（期中已很高）', () => {
    const c = course([
      item('m1', '期中一', 50, 95),
      item('final', '期末', 50, null, { replaces: 'm1' }),
    ], { target: 85 });
    const r = computeCourse(c);
    expect(r.replacement!.active).toBe(false);
    expect(r.required).toBeCloseTo(75, 6);
    expect(r.conclusion).toBe('期末至少需要 75.0%，总评才能达到 85（B）');
  });

  it('期末已假设、被替代的期中还没考：期中不再需要分数', () => {
    const c = course([
      item('hw', '作业', 30, 80),
      item('m1', '期中一', 30, null),
      item('final', '期末', 40, null, { assumed: 95, replaces: 'm1' }),
    ], { target: 85 });
    const r = computeCourse(c);
    // 期中一 ≥ 95 → 0.3×80 + 0.7×95 = 90.5 ≥ 85
    expect(r.status).toBe('secured');
    expect(r.minPossible).toBeCloseTo(90.5, 6);
    expect(r.items.find((i) => i.id === 'm1')!.required).toBeNull();
    expect(r.items.find((i) => i.id === 'm1')!.replacedBy).toBe('final');
  });

  it('多项未完成时替代：剩余项统一需求，结论说明替代', () => {
    const c = course([
      item('m1', '期中一', 20, 60),
      item('lab', '实验', 30, null),
      item('final', '期末', 50, null, { replaces: 'm1' }),
    ], { target: 80 });
    const r = computeCourse(c);
    // 不替代：(80 − 12) / 0.8 = 85；替代：80 / 1.0 = 80 > 60
    expect(r.replacement!.requiredWithout).toBeCloseTo(85, 6);
    expect(r.required).toBeCloseTo(80, 6);
    expect(r.conclusion).toBe('剩余 2 项每项至少需要 80.0%，总评才能达到 80（B-）；期末考到 80.0 会替代期中一（60.0），不替代则需要 85.0');
  });
});
