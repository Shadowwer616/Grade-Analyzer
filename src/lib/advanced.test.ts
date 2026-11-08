// 阶段 3：子项面板编辑操作 + 方案 §3 子项算例（经过面板操作得到同样的结果）
import { describe, expect, it } from 'vitest';
import type { Course } from '../types';
import {
  applyPastedScores,
  assumeAllRemaining,
  createAdvanced,
  maxAt,
  parseScoreList,
  percentToRaw,
  resizeAdvanced,
  setDropLowest,
  setMaxEach,
  setPerSlotMax,
  setSubAssumed,
  setSubScore,
} from './advanced';
import { computeCourse, evaluateSubItems, subItemRequirement } from './grade';

const SCORES = [9, 8, 10, 6, 9, 7, 10, 9];

/** 用面板操作搭出方案 §3 的作业：10 次 × 10 分，去掉最低 1 次，粘贴 8 次成绩 */
function homeworkViaPanel() {
  let adv = createAdvanced(10, 10);
  adv = setDropLowest(adv, 1);
  adv = applyPastedScores(adv, parseScoreList('9, 8, 10, 6, 9, 7, 10, 9').values);
  return adv;
}

describe('§3 子项算例（经面板操作）', () => {
  it('[9, 8, 10, 6, 9, 7, 10, 9] 去掉最低 1 次 → 62 / 70 = 88.6%', () => {
    const sub = evaluateSubItems(homeworkViaPanel());
    expect(sub.dropped).toEqual([3]); // 第 4 次的 6 分
    expect(sub.keptScore).toBe(62);
    expect(sub.keptMax).toBe(70);
    expect(sub.currentPercent).toBeCloseTo(88.571, 2);
    expect(sub.summary).toBe('10 次 · 去掉最低 1 次 · 已完成 8/10');
  });

  it('要达到 90%：剩余 2 次每次至少 (0.9 × 90 − 62) / 2 = 9.5 分', () => {
    const req = subItemRequirement(evaluateSubItems(homeworkViaPanel()), 90)!;
    expect(req.each[8]).toBeCloseTo(9.5, 9);
    expect(req.each[9]).toBeCloseTo(9.5, 9);
    expect(req.each.slice(0, 8).every((v) => v === null)).toBe(true);
  });

  it('接进主表：作业只剩子项未完成、要求 90% 时面板显示每次 9.5', () => {
    const course: Course = {
      id: 'c', name: '课', target: 90, gradeScale: 'us-10', customScale: null, bonus: null, updatedAt: '',
      items: [
        { id: 'hw', name: '作业', weight: 50, max: 100, score: null, advanced: homeworkViaPanel() },
        { id: 'x', name: '其他', weight: 50, max: 100, score: 90 },
      ],
    };
    const hw = computeCourse(course).items.find((i) => i.id === 'hw')!;
    expect(hw.required).toBeCloseTo(90, 9);
    expect(hw.subRequired!.each[8]).toBeCloseTo(9.5, 9);
  });

  it('子项假设按每次满分换算成原始分：剩余两次假设 9.5 后这一项 = 90%', () => {
    let adv = homeworkViaPanel();
    adv = assumeAllRemaining(adv, 9.5, 'raw');
    expect(adv.assumed.slice(8)).toEqual([9.5, 9.5]);
    const sub = evaluateSubItems(adv);
    expect(sub.status).toBe('assumed');
    expect(sub.percent).toBeCloseTo(90, 9);
  });
});

describe('子项编辑操作', () => {
  it('改次数：补 null / 截断；K 保持 < N', () => {
    let adv = setDropLowest(createAdvanced(5, 10), 3);
    adv = setSubScore(adv, 4, 8);
    const big = resizeAdvanced(adv, 7);
    expect(big.scores).toEqual([null, null, null, null, 8, null, null]);
    const small = resizeAdvanced(adv, 2);
    expect(small.scores).toEqual([null, null]);
    expect(small.dropLowest).toBe(1);
    expect(resizeAdvanced(adv, 0).count).toBe(1);
  });

  it('去掉最低 K：限 0 ≤ K ≤ N − 1', () => {
    expect(setDropLowest(createAdvanced(4), 9).dropLowest).toBe(3);
    expect(setDropLowest(createAdvanced(4), -2).dropLowest).toBe(0);
  });

  it('已完成子项数 ≤ K：不 drop，等成绩多了再生效', () => {
    let adv = setDropLowest(createAdvanced(10, 10), 2);
    adv = applyPastedScores(adv, [9, 5]);
    const sub = evaluateSubItems(adv);
    expect(sub.dropWaiting).toBe(true);
    expect(sub.dropped).toEqual([]);
    expect(sub.currentPercent).toBeCloseTo(70, 9);
    const more = evaluateSubItems(setSubScore(adv, 2, 10));
    expect(more.dropApplied).toBe(true);
    expect(more.dropped).toEqual([0, 1]); // 9/10 和 5/10 里去掉最低 2 次：5 和 9（10 保留）
  });

  it('填分清掉这次的假设；清空分数恢复未完成', () => {
    let adv = setSubAssumed(createAdvanced(3, 10), 0, 7);
    adv = setSubScore(adv, 0, 9);
    expect(adv.assumed[0]).toBeNull();
    adv = setSubScore(adv, 0, null);
    expect(adv.scores[0]).toBeNull();
  });

  it('假设分限在 0–每次满分', () => {
    expect(setSubAssumed(createAdvanced(2, 10), 0, 14).assumed[0]).toBe(10);
    expect(setSubAssumed(createAdvanced(2, 10), 1, -1).assumed[1]).toBe(0);
  });

  it('每次满分：统一 ↔ 逐次；逐次时按各自满分换算百分比', () => {
    let adv = setPerSlotMax(createAdvanced(3, 10), true);
    expect(adv.maxEach).toEqual([10, 10, 10]);
    adv = setMaxEach(adv, 20, 2);
    expect(maxAt(adv, 2)).toBe(20);
    expect(percentToRaw(adv, 2, 85)).toBeCloseTo(17, 9);
    adv = assumeAllRemaining(adv, 80, 'percent');
    expect(adv.assumed).toEqual([8, 8, 16]);
    expect(setPerSlotMax(adv, false).maxEach).toBe(10);
    expect(setMaxEach(adv, 0, 1)).toBe(adv); // 满分必须 > 0
  });

  it('「剩余全部假设」不动已出分的子项', () => {
    const adv = assumeAllRemaining(applyPastedScores(createAdvanced(3, 10), [6]), 9, 'raw');
    expect(adv.scores).toEqual([6, null, null]);
    expect(adv.assumed).toEqual([null, 9, 9]);
  });
});

describe('粘贴录入', () => {
  it('逗号、空格、中文标点都能拆；「-」占位为未出分', () => {
    expect(parseScoreList('9, 8.5, 10, 7').values).toEqual([9, 8.5, 10, 7]);
    expect(parseScoreList('9 8.5\n10\t7').values).toEqual([9, 8.5, 10, 7]);
    expect(parseScoreList('9，8.5、10；7').values).toEqual([9, 8.5, 10, 7]);
    expect(parseScoreList('9, -, 10').values).toEqual([9, null, 10]);
    expect(parseScoreList('9分, 10分').values).toEqual([9, 10]);
  });

  it('认不出的片段单独返回', () => {
    expect(parseScoreList('9, abc, 7')).toEqual({ values: [9, 7], invalid: ['abc'] });
  });

  it('从第 1 次起填入，后面没粘到的已得分清空；超过 N 时自动加大 N', () => {
    let adv = applyPastedScores(createAdvanced(4, 10), [1, 2, 3, 4]);
    adv = setSubAssumed(adv, 3, 5);
    adv = applyPastedScores(adv, [9, 8]);
    expect(adv.scores).toEqual([9, 8, null, null]);
    expect(adv.assumed[3]).toBe(5); // 假设保留
    const grown = applyPastedScores(createAdvanced(3, 10), SCORES);
    expect(grown.count).toBe(8);
    expect(grown.scores).toEqual(SCORES);
  });
});
