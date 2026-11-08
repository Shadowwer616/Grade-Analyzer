// 数据模型：按《P1 设计方案》第 5 节。
// 一门课一个 Course 对象；所有派生值（当前成绩、需求分等）不存，由 lib/grade.ts 计算。

/** 等级表预设 id；custom 时读 Course.customScale */
export type GradeScaleId = 'us-10' | 'us-letter' | 'cn-100' | 'custom';

/** 等级表的一档：[等级名, 下限分数]，例如 ["A", 93] */
export type ScaleEntry = [label: string, min: number];

/** 期末替代「分数最低的那次期中」时 replaces 的取值 */
export const REPLACE_LOWEST_MIDTERM = 'lowest-midterm';

/** 「高级」多次子项面板 */
export interface AdvancedConfig {
  /** 次数 N */
  count: number;
  /** 每次满分：统一一个数，或逐次不同的数组 */
  maxEach: number | number[];
  /** 去掉最低 K 次 */
  dropLowest: number;
  /** 每次已得原始分；null = 未完成。长度 = count */
  scores: (number | null)[];
  /**
   * 每次假设分；null = 未假设。长度 = count。
   * 单位和 scores 一样是原始分（满分 10 的子项填 9），不是百分比；
   * 对应 scores 非空时忽略。
   */
  assumed: (number | null)[];
}

/** 普通评分项（作业、期中、期末……） */
export interface GradeItem {
  id: string;
  name: string;
  /** 权重，百分数（20 = 20%） */
  weight: number;
  /** 满分，默认 100 */
  max: number;
  /** 已得原始分；null = 未完成。有 advanced 时忽略，由子项算出 */
  score: number | null;
  /** 假设分（百分比 0–100）；null/缺省 = 未假设。score 非空或有 advanced 时忽略 */
  assumed?: number | null;
  /** 多次子项面板；null/缺省 = 普通行 */
  advanced?: AdvancedConfig | null;
  /** 只有期末行用：被替代项的 id，或 'lowest-midterm'；null/缺省 = 不替代 */
  replaces?: string | null;
}

/** Bonus 行：权重外，直接加到总分 */
export interface BonusItem {
  name: string;
  /** 最多加分（百分制的分数点） */
  max: number;
  /** 已得分；null = 还没有 */
  score: number | null;
}

export interface Course {
  id: string;
  name: string;
  /** 目标总评（百分制） */
  target: number;
  gradeScale: GradeScaleId;
  /** gradeScale = 'custom' 时使用，例如 [["A", 93], ["A-", 90]] */
  customScale: ScaleEntry[] | null;
  items: GradeItem[];
  /** null = 没有 Bonus 行 */
  bonus: BonusItem | null;
  /** ISO 时间 */
  updatedAt: string;
}

// ── 阶段 4：本地保存（方案 §5「本地保存」） ──

/** 「我的预设」等级表，所有课程共用；课程选用时把 entries 复制进 customScale */
export interface MyScale {
  id: string;
  name: string;
  entries: ScaleEntry[];
}

/** localStorage 里存的整个对象 */
export interface SavedData {
  version: 1;
  /** 当前打开的课程 id */
  currentId: string;
  /** 至少一门 */
  courses: Course[];
  myScales: MyScale[];
}
