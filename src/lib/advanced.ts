// 「高级」多次子项面板的编辑操作（方案 §2.2，阶段 3）。纯函数：输入旧的 AdvancedConfig，返回新的。
// 单位约定：scores / assumed 都是原始分（满分 10 的子项填 9），和主表 assumed（百分比）不同。
import type { AdvancedConfig } from '../types';

export const MAX_COUNT = 60;
export const DEFAULT_COUNT = 10;
export const DEFAULT_MAX_EACH = 10;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fit = <T>(arr: (T | null)[] | undefined, n: number): (T | null)[] =>
  Array.from({ length: n }, (_, j) => (arr && j < arr.length ? arr[j] ?? null : null));

/** 新开启子项面板时的默认配置：10 次 × 10 分，不 drop，全部未完成 */
export function createAdvanced(count = DEFAULT_COUNT, maxEach = DEFAULT_MAX_EACH): AdvancedConfig {
  return { count, maxEach, dropLowest: 0, scores: fit([], count), assumed: fit([], count) };
}

export const isPerSlotMax = (adv: AdvancedConfig): adv is AdvancedConfig & { maxEach: number[] } =>
  Array.isArray(adv.maxEach);

/** 第 j 次的满分（逐次填时数组不够长就沿用最后一个） */
export function maxAt(adv: AdvancedConfig, j: number): number {
  if (isPerSlotMax(adv)) {
    const m = adv.maxEach;
    return m[j] ?? m[m.length - 1] ?? DEFAULT_MAX_EACH;
  }
  return adv.maxEach as number;
}

/** 改次数 N：数组补 null 或截断；K 保持 < N */
export function resizeAdvanced(adv: AdvancedConfig, n: number): AdvancedConfig {
  const count = clamp(Math.floor(n) || 1, 1, MAX_COUNT);
  const maxEach = isPerSlotMax(adv) ? Array.from({ length: count }, (_, j) => maxAt(adv, j)) : adv.maxEach;
  return {
    ...adv,
    count,
    maxEach,
    dropLowest: clamp(adv.dropLowest, 0, count - 1),
    scores: fit(adv.scores, count),
    assumed: fit(adv.assumed, count),
  };
}

/** 去掉最低 K 次：0 ≤ K ≤ N − 1 */
export function setDropLowest(adv: AdvancedConfig, k: number): AdvancedConfig {
  return { ...adv, dropLowest: clamp(Math.floor(k) || 0, 0, Math.max(0, adv.count - 1)) };
}

/** 每次满分：统一一个数 ↔ 逐次填。切回统一时取第 1 次的满分 */
export function setPerSlotMax(adv: AdvancedConfig, perSlot: boolean): AdvancedConfig {
  if (perSlot === isPerSlotMax(adv)) return adv;
  return perSlot
    ? { ...adv, maxEach: Array.from({ length: adv.count }, () => adv.maxEach as number) }
    : { ...adv, maxEach: maxAt(adv, 0) };
}

/** 统一满分时改那个数；逐次填时改第 j 次。满分必须 > 0 */
export function setMaxEach(adv: AdvancedConfig, value: number, j?: number): AdvancedConfig {
  if (!(value > 0)) return adv;
  if (isPerSlotMax(adv) && j !== undefined) {
    const m = Array.from({ length: adv.count }, (_, i) => maxAt(adv, i));
    m[j] = value;
    return { ...adv, maxEach: m };
  }
  return { ...adv, maxEach: value };
}

/** 填第 j 次的已得分；填了分就清掉这次的假设，清空 = 未完成 */
export function setSubScore(adv: AdvancedConfig, j: number, value: number | null): AdvancedConfig {
  const scores = fit(adv.scores, adv.count);
  const assumed = fit(adv.assumed, adv.count);
  scores[j] = value === null ? null : Math.max(0, value);
  if (value !== null) assumed[j] = null;
  return { ...adv, scores, assumed };
}

/** 第 j 次的假设分（原始分，限 0–满分）；null = 清除假设 */
export function setSubAssumed(adv: AdvancedConfig, j: number, value: number | null): AdvancedConfig {
  const assumed = fit(adv.assumed, adv.count);
  assumed[j] = value === null ? null : clamp(value, 0, maxAt(adv, j));
  return { ...adv, assumed };
}

/** 主表的百分比 → 第 j 次的原始分 */
export const percentToRaw = (adv: AdvancedConfig, j: number, percent: number) => (percent / 100) * maxAt(adv, j);

/**
 * 「剩余全部假设为 X」：所有没出分的子项（含已假设的）都设成 X。
 * unit = 'raw' 时 X 是每次的原始分（统一满分时用）；'percent' 时 X 是百分比，按各次满分换算（逐次满分时用）。
 */
export function assumeAllRemaining(adv: AdvancedConfig, x: number, unit: 'raw' | 'percent'): AdvancedConfig {
  let next = adv;
  for (let j = 0; j < adv.count; j++) {
    if (adv.scores[j] !== null && adv.scores[j] !== undefined) continue;
    next = setSubAssumed(next, j, unit === 'raw' ? x : percentToRaw(adv, j, x));
  }
  return next;
}

export interface ParsedScores {
  values: (number | null)[];
  /** 不是数字的片段，原样返回给界面提示 */
  invalid: string[];
}

/**
 * 粘贴录入：「9, 8.5, 10, 7」「9 8.5 10 7」「9，8.5、10；7」都行；
 * 「-」「—」「_」「x」占位表示这一次还没出分。
 */
export function parseScoreList(text: string): ParsedScores {
  const values: (number | null)[] = [];
  const invalid: string[] = [];
  for (const tok of text.split(/[\s,，、;；]+/).filter(Boolean)) {
    if (/^[-—_xX]$/.test(tok)) values.push(null);
    else {
      const v = Number(tok.replace(/分$/, ''));
      if (Number.isFinite(v) && v >= 0) values.push(v);
      else invalid.push(tok);
    }
  }
  return { values, invalid };
}

/**
 * 把粘贴的一串成绩从第 1 次起依次填入：粘贴的是「到目前为止的全部成绩」，
 * 所以后面没粘到的已得分清空（假设保留）；比 N 多时自动把 N 加大。
 */
export function applyPastedScores(adv: AdvancedConfig, values: (number | null)[]): AdvancedConfig {
  let next = values.length > adv.count ? resizeAdvanced(adv, values.length) : adv;
  for (let j = 0; j < next.count; j++) {
    next = setSubScore(next, j, j < values.length ? values[j] : null);
  }
  return next;
}
