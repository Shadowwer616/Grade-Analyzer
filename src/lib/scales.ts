// 等级表预设（方案 §2.4）与等级换算。阈值比较带 0.05 容差（方案 §3「进位」）。
import type { GradeScaleId, ScaleEntry } from '../types';

export const GRADE_TOLERANCE = 0.05;

export const SCALE_PRESETS: Record<Exclude<GradeScaleId, 'custom'>, { name: string; entries: ScaleEntry[] }> = {
  'us-10': {
    name: '美式 10 分制',
    entries: [
      ['A', 93], ['A-', 90],
      ['B+', 87], ['B', 83], ['B-', 80],
      ['C+', 77], ['C', 73], ['C-', 70],
      ['D+', 67], ['D', 63], ['D-', 60],
      ['F', 0],
    ],
  },
  'us-letter': {
    name: '美式整十',
    entries: [['A', 90], ['B', 80], ['C', 70], ['D', 60], ['F', 0]],
  },
  'cn-100': {
    name: '中国百分制',
    entries: [['优', 90], ['良', 80], ['中', 70], ['及格', 60], ['不及格', 0]],
  },
};

/** 取课程实际使用的等级表，按下限从高到低排序 */
export function resolveScale(gradeScale: GradeScaleId, customScale: ScaleEntry[] | null): ScaleEntry[] {
  const entries =
    gradeScale === 'custom' ? customScale ?? [] : SCALE_PRESETS[gradeScale]?.entries ?? SCALE_PRESETS['us-10'].entries;
  return [...entries].sort((a, b) => b[1] - a[1]);
}

/** 分数对应的等级；79.96 按 80 算。低于所有档（只可能出现在自定义表）返回 null */
export function letterGrade(score: number | null, entries: ScaleEntry[]): string | null {
  if (score === null || !Number.isFinite(score)) return null;
  for (const [label, min] of entries) {
    if (score >= min - GRADE_TOLERANCE - 1e-9) return label;
  }
  return null;
}

/** 等级表下拉的名字（阶段 3） */
export const SCALE_OPTIONS: { id: GradeScaleId; name: string }[] = [
  { id: 'us-10', name: '美式 A/B/C（10 分制）' },
  { id: 'us-letter', name: '美式整十（A/B/C/D/F）' },
  { id: 'cn-100', name: '中国百分制（优/良/中/及格）' },
  { id: 'custom', name: '自定义…' },
];

export interface ScaleCheck {
  /** 去掉首尾空格、按下限从高到低排好的档位 */
  entries: ScaleEntry[];
  /** 不能保存的原因；为空表示可以保存 */
  errors: string[];
}

/**
 * 自定义等级表保存前的检查：至少一档；等级名不能空、不能重复；
 * 下限是 0–100 的数字、不能重复。最低一档不是 0 时，低于它的分数没有等级（允许，只提示）。
 */
export function checkScale(entries: ScaleEntry[]): ScaleCheck {
  const errors: string[] = [];
  const cleaned: ScaleEntry[] = entries.map(([l, m]) => [l.trim(), m]);
  if (cleaned.length === 0) errors.push('至少要有一档');
  if (cleaned.some(([l]) => l === '')) errors.push('等级名不能为空');
  const labels = cleaned.map(([l]) => l).filter(Boolean);
  if (new Set(labels).size !== labels.length) errors.push('等级名不能重复');
  if (cleaned.some(([, m]) => !Number.isFinite(m) || m < 0 || m > 100)) errors.push('下限要在 0–100 之间');
  const mins = cleaned.map(([, m]) => m);
  if (new Set(mins).size !== mins.length) errors.push('两档的下限不能相同');
  return { entries: [...cleaned].sort((a, b) => b[1] - a[1]), errors };
}

/** 目标按等级选择时，取该等级的下限分数 */
export function gradeFloor(label: string, entries: ScaleEntry[]): number | null {
  const hit = entries.find(([l]) => l === label);
  return hit ? hit[1] : null;
}
