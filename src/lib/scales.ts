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

/** 目标按等级选择时，取该等级的下限分数 */
export function gradeFloor(label: string, entries: ScaleEntry[]): number | null {
  const hit = entries.find(([l]) => l === label);
  return hit ? hit[1] : null;
}
