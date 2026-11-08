// 计算核心（方案 §3）。纯函数，不依赖 React：输入课程对象，输出当前 / 预估 / 需求 / 可行性 / 结论。
//
// 约定：
// - 分数一律用百分制的「分数点」（0–100）；权重内部归一化为合计 1。
// - 已完成集合 D、假设集合 L、未完成集合 U；假设项视同已完成；Bonus 最后直接加到总分。
// - 反推：所有未完成项统一需要 x，x = (T − E − B) / R。
// - 期末替代期中：把被替代项 m 的权重并入期末 f 得到「替代场景」，
//   分数类结果取两种场景中更高的，需求分取更低的（方案 §2.3）。
import type { AdvancedConfig, BonusItem, Course, GradeItem } from '../types';
import { REPLACE_LOWEST_MIDTERM } from '../types';
import { letterGrade, resolveScale } from './scales';

/** 可行性比较的容差：79.96 算 80 */
export const TOLERANCE = 0.05;
const EPS = 1e-9;

/** a ≥ b（带 0.05 容差） */
export function atLeast(a: number, b: number): boolean {
  return a >= b - TOLERANCE - EPS;
}

/** 显示用：保留 1 位小数 */
export function formatScore(n: number): string {
  const r = Math.round(n * 10) / 10;
  return (r === 0 ? 0 : r).toFixed(1);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// ───────────────────────── 类型 ─────────────────────────

export type ItemStatus = 'completed' | 'assumed' | 'pending';

/**
 * reachable 可达 / secured 已达成（还有未完成项，但 0 分也够）/ unreachable 无法达到 /
 * met 达成、notMet 未达成（R = 0，全部完成或假设）/ empty 没有可计算的评分项
 */
export type Feasibility = 'reachable' | 'secured' | 'unreachable' | 'met' | 'notMet' | 'empty';

export const FEASIBILITY_LABEL: Record<Feasibility, string> = {
  reachable: '可达',
  secured: '已达成',
  unreachable: '无法达到',
  met: '达成',
  notMet: '未达成',
  empty: '—',
};

export interface SubItemsResult {
  count: number;
  /** 每次满分（已展开成数组） */
  maxEach: number[];
  completed: number[];
  assumed: number[];
  pending: number[];
  dropLowest: number;
  /** 已完成数 > K，drop 生效 */
  dropApplied: boolean;
  /** K > 0 但已完成数 ≤ K：先不 drop，面板提示「成绩再多些后生效」 */
  dropWaiting: boolean;
  /** 被去掉的子项下标 */
  dropped: number[];
  /** 保留的已完成子项得分合计 / 满分合计 */
  keptScore: number;
  keptMax: number;
  /** 假设子项得分合计 / 满分合计 */
  assumedScore: number;
  assumedMax: number;
  /** 未完成子项满分合计 */
  pendingMax: number;
  /** 只按已完成子项（drop 后）的百分比；一个都没完成为 null */
  currentPercent: number | null;
  /** 已完成 + 假设（drop 后）的百分比；还有未完成子项时为 null */
  percent: number | null;
  status: ItemStatus;
  /** 「10 次 · 去掉最低 1 次 · 已完成 8/10」 */
  summary: string;
}

export interface SubRequirement {
  /** 剩余每次至少要拿到满分的百分之多少 */
  percent: number;
  /** 按下标：未完成子项每次至少的原始分；其他下标为 null */
  each: (number | null)[];
}

export interface ItemResult {
  id: string;
  name: string;
  weight: number;
  /** 归一化后的权重（合计 1） */
  normWeight: number;
  status: ItemStatus;
  /** 已完成或假设时的百分比 */
  percent: number | null;
  /** 计入当前成绩的百分比（已完成项；子项面板部分完成时为已完成部分） */
  currentPercent: number | null;
  /** 未完成项需要的百分比；被期末替代、不再影响结果时为 null */
  required: number | null;
  sub: SubItemsResult | null;
  subRequired: SubRequirement | null;
  /** 这一项被期末替代（替代生效时） */
  replacedBy: string | null;
  /** 期末行：替代生效时被替代项的 id */
  replacing: string | null;
  /** 行名下的摘要：子项摘要和/或「可替代期中一」 */
  summary: string;
}

export interface ReplacementInfo {
  finalId: string;
  /** 原始配置：被替代项 id 或 'lowest-midterm' */
  mode: string;
  /** 参与比较的被替代候选项 id */
  candidates: string[];
  /** 当前对应的被替代项（替代生效时就是生效的那一项） */
  targetId: string | null;
  /** 替代是否让结果更好 */
  active: boolean;
  /** 不替代时的需求分 */
  requiredWithout: number | null;
  /** 替代时的需求分（替代生效时 = required） */
  requiredWith: number | null;
}

export interface CourseResult {
  target: number;
  targetGrade: string | null;
  weightTotal: number;
  /** 权重合计 = 100% */
  weightsOk: boolean;
  bonusPoints: number;
  /** Bonus 已得 > 最多加分（输入框标红，按上限计） */
  bonusOverMax: boolean;
  /** 当前成绩 C（已完成项 + Bonus）；没有已完成项时 null */
  current: number | null;
  currentGrade: string | null;
  /** 已锁定 E（加权分数点，不含 Bonus） */
  locked: number;
  /** 剩余权重 R（百分数，40 = 40%） */
  remainingWeight: number;
  /** 含假设预估 P；没有已完成或假设项时 null */
  projected: number | null;
  projectedGrade: string | null;
  /** 剩余每项需要的百分比 x；R = 0 时 null；已达成时可能 ≤ 0 */
  required: number | null;
  /** 最低可能 E + B */
  minPossible: number;
  /** 最高可能 E + B + 100R */
  maxPossible: number;
  maxGrade: string | null;
  /** 距目标还需（分数点）= max(0, T − 最低可能) */
  gap: number;
  status: Feasibility;
  statusLabel: string;
  /** R = 0 时的最终成绩（= projected） */
  final: number | null;
  finalGrade: string | null;
  replacement: ReplacementInfo | null;
  conclusion: string;
  items: ItemResult[];
}

// ───────────────────────── 子项面板 ─────────────────────────

function expandMaxEach(adv: AdvancedConfig, n: number): number[] {
  const m = adv.maxEach;
  if (Array.isArray(m)) {
    const last = m.length ? m[m.length - 1] : 0;
    return Array.from({ length: n }, (_, j) => (isNum(m[j]) ? m[j] : last));
  }
  return Array.from({ length: n }, () => (isNum(m) ? m : 0));
}

/** 子项面板：去掉最低 K 次（保守口径：只在已完成的子项里去掉最低 K 次） */
export function evaluateSubItems(adv: AdvancedConfig): SubItemsResult {
  const n = Math.max(0, Math.floor(adv.count || 0));
  const maxEach = expandMaxEach(adv, n);
  const completed: number[] = [];
  const assumed: number[] = [];
  const pending: number[] = [];
  for (let j = 0; j < n; j++) {
    const g = adv.scores?.[j];
    const a = adv.assumed?.[j];
    if (isNum(g)) completed.push(j);
    else if (isNum(a)) assumed.push(j);
    else pending.push(j);
  }

  const K = Math.max(0, Math.floor(adv.dropLowest || 0));
  const dropApplied = K > 0 && completed.length > K;
  const dropWaiting = K > 0 && completed.length <= K;
  const pct = (j: number) => (maxEach[j] > 0 ? (adv.scores[j] as number) / maxEach[j] : 0);
  const dropped = dropApplied
    ? [...completed].sort((a, b) => pct(a) - pct(b) || a - b).slice(0, K).sort((a, b) => a - b)
    : [];
  const kept = completed.filter((j) => !dropped.includes(j));

  const sum = (idx: number[], f: (j: number) => number) => idx.reduce((s, j) => s + f(j), 0);
  const keptScore = sum(kept, (j) => adv.scores[j] as number);
  const keptMax = sum(kept, (j) => maxEach[j]);
  const assumedScore = sum(assumed, (j) => adv.assumed[j] as number);
  const assumedMax = sum(assumed, (j) => maxEach[j]);
  const pendingMax = sum(pending, (j) => maxEach[j]);

  const status: ItemStatus = pending.length > 0 || n === 0 ? 'pending' : assumed.length > 0 ? 'assumed' : 'completed';
  const currentPercent = keptMax > 0 ? (keptScore / keptMax) * 100 : null;
  const knownMax = keptMax + assumedMax;
  const percent = status !== 'pending' && knownMax > 0 ? ((keptScore + assumedScore) / knownMax) * 100 : null;

  const summary = `${n} 次${K > 0 ? ` · 去掉最低 ${K} 次` : ''} · 已完成 ${completed.length}/${n}`;

  return {
    count: n, maxEach, completed, assumed, pending, dropLowest: K, dropApplied, dropWaiting, dropped,
    keptScore, keptMax, assumedScore, assumedMax, pendingMax, currentPercent, percent, status, summary,
  };
}

/**
 * 主表要求这一项达到 requiredPercent 时，剩余每次至少多少：
 * x_sub = ( s* · (N − K) · m − Σ_kept g ) / r（满分统一时）；满分不统一时按各自满分同比例换算。
 */
export function subItemRequirement(sub: SubItemsResult, requiredPercent: number): SubRequirement | null {
  if (sub.pending.length === 0 || sub.pendingMax <= 0) return null;
  const totalMax = sub.keptMax + sub.assumedMax + sub.pendingMax;
  const p = ((requiredPercent / 100) * totalMax - (sub.keptScore + sub.assumedScore)) / sub.pendingMax;
  const each: (number | null)[] = Array.from({ length: sub.count }, () => null);
  for (const j of sub.pending) each[j] = p * sub.maxEach[j];
  return { percent: p * 100, each };
}

// ───────────────────────── 评分项 ─────────────────────────

interface ItemEval {
  item: GradeItem;
  w: number;
  status: ItemStatus;
  percent: number | null;
  currentPercent: number | null;
  sub: SubItemsResult | null;
}

function evaluateItem(item: GradeItem, w: number): ItemEval {
  if (item.advanced && item.advanced.count > 0) {
    const sub = evaluateSubItems(item.advanced);
    const status = sub.status !== 'pending' && sub.percent === null ? 'pending' : sub.status;
    return { item, w, status, percent: sub.percent, currentPercent: sub.currentPercent, sub };
  }
  if (isNum(item.score) && item.max > 0) {
    const p = (item.score / item.max) * 100;
    return { item, w, status: 'completed', percent: p, currentPercent: p, sub: null };
  }
  if (isNum(item.assumed)) {
    return { item, w, status: 'assumed', percent: item.assumed, currentPercent: null, sub: null };
  }
  return { item, w, status: 'pending', percent: null, currentPercent: null, sub: null };
}

export function bonusPoints(bonus: BonusItem | null): { points: number; overMax: boolean } {
  if (!bonus || !isNum(bonus.score)) return { points: 0, overMax: false };
  const cap = isNum(bonus.max) ? Math.max(0, bonus.max) : Infinity;
  const overMax = bonus.score > cap + EPS;
  return { points: Math.min(Math.max(0, bonus.score), cap), overMax };
}

/** 名字里含「期中」（或 midterm）的项，作为「分数最低的那次期中」的候选 */
export function midtermCandidates(course: Course, finalId: string): GradeItem[] {
  return course.items.filter((i) => i.id !== finalId && /期中|midterm/i.test(i.name));
}

/** 权重合计 ≠ 100% 时一键归一化：w_i / Σw，保留 1 位小数，尾差补到权重最大的一项 */
export function normalizeWeights(course: Course): Course {
  const S = course.items.reduce((s, i) => s + Math.max(0, i.weight || 0), 0);
  if (S <= 0) return course;
  const round1 = (v: number) => Math.round(v * 10) / 10;
  const items = course.items.map((i) => ({ ...i, weight: round1((Math.max(0, i.weight || 0) / S) * 100) }));
  const diff = round1(100 - items.reduce((s, i) => s + i.weight, 0));
  if (diff !== 0 && items.length) {
    const k = items.reduce((best, i, idx) => (i.weight > items[best].weight ? idx : best), 0);
    items[k] = { ...items[k], weight: round1(items[k].weight + diff) };
  }
  return { ...course, items };
}

// ───────────────────────── 场景 ─────────────────────────

interface Slot {
  ids: string[];
  w: number;
  status: ItemStatus;
  percent: number | null;
  currentPercent: number | null;
}

interface Scenario {
  /** null = 不替代；否则 [期末 id, 被替代项 id] */
  merge: [string, string] | null;
  /** 当前成绩是否可用这个场景（替代只在期末和被替代项都已出分时影响当前成绩） */
  currentValid: boolean;
  C: number | null;
  E: number;
  R: number;
  P: number | null;
  min: number;
  max: number;
  /** 需求分；R = 0 时用 ±Infinity 表示「已够 / 不够」 */
  x: number;
}

function runScenario(slots: Slot[], B: number, T: number, merge: Scenario['merge'], currentValid: boolean): Scenario {
  let cw = 0, cs = 0, known = 0, E = 0, R = 0;
  for (const s of slots) {
    if (s.currentPercent !== null) {
      cw += s.w;
      cs += s.w * s.currentPercent;
    }
    if (s.status === 'pending') R += s.w;
    else {
      known += s.w;
      E += s.w * (s.percent as number);
    }
  }
  const C = cw > EPS ? cs / cw + B : null;
  const P = known > EPS ? E / known + B : null;
  const x = R > EPS ? (T - E - B) / R : atLeast(E + B, T) ? -Infinity : Infinity;
  return { merge, currentValid, C, E, R: R > EPS ? R : 0, P, min: E + B, max: E + B + 100 * R, x };
}

const maxOf = (vals: (number | null)[]): number | null => {
  const v = vals.filter(isNum);
  return v.length ? Math.max(...v) : null;
};

// ───────────────────────── 主函数 ─────────────────────────

export function computeCourse(course: Course): CourseResult {
  const T = course.target;
  const scale = resolveScale(course.gradeScale, course.customScale);
  const grade = (v: number | null) => letterGrade(v, scale);
  const { points: B, overMax: bonusOverMax } = bonusPoints(course.bonus);

  const rawWeight = (i: GradeItem) => Math.max(0, isNum(i.weight) ? i.weight : 0);
  const weightTotal = course.items.reduce((s, i) => s + rawWeight(i), 0);
  const weightsOk = Math.abs(weightTotal - 100) < 0.005;
  const evals = course.items.map((i) => evaluateItem(i, weightTotal > 0 ? rawWeight(i) / weightTotal : 0));
  const byId = new Map(evals.map((e) => [e.item.id, e]));

  const baseSlots: Slot[] = evals.map((e) => ({
    ids: [e.item.id], w: e.w, status: e.status, percent: e.percent, currentPercent: e.currentPercent,
  }));

  // 期末替代期中：每个候选被替代项一个「替代场景」
  const finalItem = course.items.find((i) => i.replaces && byId.has(i.replaces) && i.replaces !== i.id)
    ?? course.items.find((i) => i.replaces === REPLACE_LOWEST_MIDTERM);
  let candidates: GradeItem[] = [];
  if (finalItem) {
    candidates =
      finalItem.replaces === REPLACE_LOWEST_MIDTERM
        ? midtermCandidates(course, finalItem.id)
        : course.items.filter((i) => i.id === finalItem.replaces);
  }

  const scenarios: Scenario[] = [runScenario(baseSlots, B, T, null, true)];
  if (finalItem) {
    const f = byId.get(finalItem.id)!;
    for (const m of candidates) {
      const me = byId.get(m.id)!;
      const slots = baseSlots
        .filter((s) => s.ids[0] !== m.id)
        .map((s) => (s.ids[0] === f.item.id ? { ...s, ids: [f.item.id, m.id], w: s.w + me.w } : s));
      const currentValid = f.status === 'completed' && me.status === 'completed';
      scenarios.push(runScenario(slots, B, T, [f.item.id, m.id], currentValid));
    }
  }
  const normal = scenarios[0];

  // 分数类：取更高；需求分：取更低
  const current = maxOf(scenarios.filter((s) => s.currentValid).map((s) => s.C));
  const locked = Math.max(...scenarios.map((s) => s.E));
  const projected = maxOf(scenarios.map((s) => s.P));
  const minPossible = Math.max(...scenarios.map((s) => s.min));
  const maxPossible = Math.max(...scenarios.map((s) => s.max));
  const hasRemaining = normal.R > EPS;

  let active = normal;
  for (const s of scenarios.slice(1)) {
    if (hasRemaining ? s.x < active.x - EPS : (s.P ?? -Infinity) > (active.P ?? -Infinity) + EPS) active = s;
  }
  const xBest = Math.min(...scenarios.map((s) => s.x));
  const required = hasRemaining ? (Number.isFinite(xBest) ? xBest : xBest < 0 ? 0 : null) : null;

  // 可行性
  let status: Feasibility;
  if (weightTotal <= EPS) status = 'empty';
  else if (!hasRemaining) status = projected !== null && atLeast(projected, T) ? 'met' : 'notMet';
  else if (atLeast(minPossible, T)) status = 'secured';
  else if (!atLeast(maxPossible, T)) status = 'unreachable';
  else status = 'reachable';

  // 替代信息
  let replacement: ReplacementInfo | null = null;
  if (finalItem) {
    let targetId: string | null = active.merge ? active.merge[1] : null;
    if (!targetId) {
      const known = candidates
        .map((c) => byId.get(c.id)!)
        .filter((e) => e.percent !== null && e.status !== 'pending')
        .sort((a, b) => (a.percent as number) - (b.percent as number));
      targetId = known[0]?.item.id ?? candidates[0]?.id ?? null;
    }
    const withScen = scenarios.find((s) => s.merge && s.merge[1] === targetId);
    const fin = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? null : v);
    replacement = {
      finalId: finalItem.id,
      mode: finalItem.replaces as string,
      candidates: candidates.map((c) => c.id),
      targetId,
      active: active.merge !== null,
      requiredWithout: hasRemaining ? fin(normal.x) : null,
      requiredWith: hasRemaining ? fin(withScen?.x) : null,
    };
  }

  // 逐项结果
  const [activeF, activeM] = active.merge ?? [null, null];
  const items: ItemResult[] = evals.map((e) => {
    const id = e.item.id;
    const coveredByFinal = id === activeM && byId.get(activeF!)!.status !== 'pending';
    const itemRequired = e.status === 'pending' && hasRemaining && !coveredByFinal ? required : null;
    const summaries: string[] = [];
    if (e.sub) summaries.push(e.sub.summary);
    if (finalItem && id === finalItem.id && replacement) {
      const tName = replacement.targetId ? byId.get(replacement.targetId)?.item.name ?? '' : '';
      const decided = replacement.active && e.status === 'completed' && byId.get(replacement.targetId!)?.status === 'completed';
      if (decided) summaries.push(`已替代${tName}`);
      else if (finalItem.replaces === REPLACE_LOWEST_MIDTERM && !replacement.active) summaries.push('可替代分数最低的期中');
      else summaries.push(`可替代${tName}`);
    }
    return {
      id,
      name: e.item.name,
      weight: e.item.weight,
      normWeight: e.w,
      status: e.status,
      percent: e.status === 'pending' ? null : e.percent,
      currentPercent: e.currentPercent,
      required: itemRequired,
      sub: e.sub,
      subRequired: e.sub && itemRequired !== null ? subItemRequirement(e.sub, itemRequired) : null,
      replacedBy: id === activeM ? activeF : null,
      replacing: id === activeF ? activeM : null,
      summary: summaries.join(' · '),
    };
  });

  const final = hasRemaining ? null : projected;
  const result: CourseResult = {
    target: T,
    targetGrade: grade(T),
    weightTotal,
    weightsOk,
    bonusPoints: B,
    bonusOverMax,
    current,
    currentGrade: grade(current),
    locked,
    remainingWeight: normal.R * 100,
    projected,
    projectedGrade: grade(projected),
    required,
    minPossible,
    maxPossible,
    maxGrade: grade(maxPossible),
    gap: Math.max(0, T - minPossible),
    status,
    statusLabel: FEASIBILITY_LABEL[status],
    final,
    finalGrade: grade(final),
    replacement,
    conclusion: '',
    items,
  };
  result.conclusion = buildConclusion(result, byId, normal);
  return result;
}

// ───────────────────────── 结论句 ─────────────────────────

function buildConclusion(r: CourseResult, byId: Map<string, ItemEval>, normal: Scenario): string {
  const f = formatScore;
  const withGrade = (v: number, g: string | null) => (g ? `${f(v)}（${g}）` : f(v));
  const T = f(r.target);
  const rep = r.replacement;
  const fItem = rep ? byId.get(rep.finalId)! : null;
  const mItem = rep?.targetId ? byId.get(rep.targetId)! : null;

  switch (r.status) {
    case 'empty':
      return '先添加评分项并填好权重';
    case 'met':
    case 'notMet': {
      const v = r.final ?? 0;
      let s = `最终 ${withGrade(v, r.finalGrade)}，${r.status === 'met' ? '达到' : '未达到'}目标 ${T}`;
      if (rep?.active && fItem && mItem) s += `；${fItem.item.name}替代了${mItem.item.name}`;
      return s;
    }
    case 'secured':
      return `已稳拿 ${f(r.minPossible)}，剩余项全部 0 分也能达到目标 ${T}`;
    case 'unreachable':
      return `剩余项全部满分最高也只有 ${withGrade(r.maxPossible, r.maxGrade)}，达不到目标 ${T}`;
    case 'reachable': {
      const x = r.required as number;
      const need = r.items.filter((i) => i.required !== null);
      const base =
        need.length === 1
          ? `${need[0].name}至少需要 ${f(x)}%，总评才能达到 ${T}`
          : `剩余 ${need.length} 项每项至少需要 ${f(x)}%，总评才能达到 ${T}`;
      if (!rep?.active || !fItem || !mItem) return base;

      const xWithout = normal.x;
      if (fItem.status === 'pending') {
        // 期末未考：期末考到 x 会替代期中
        const mp = f(mItem.percent as number);
        if (need.length === 1) {
          return `${fItem.item.name}考到 ${f(x)} 会替代${mItem.item.name}（${mp}），所以只需 ${f(x)} 而不是 ${f(xWithout)}`;
        }
        return `${base}；${fItem.item.name}考到 ${f(x)} 会替代${mItem.item.name}（${mp}），不替代则需要 ${f(xWithout)}`;
      }
      // 期末已出分或已假设，被替代的期中还没考：期中不再影响结果
      return `${fItem.item.name}（${f(fItem.percent as number)}）会替代${mItem.item.name}；${base}`;
    }
  }
}

// ───────────────────────── 进度条（阶段 2 新增） ─────────────────────────

/**
 * 总览进度条五段（方案 §2.4），单位都是百分制的分数点：
 * 已拿到 = 已锁定 E（已完成 + 假设，不含 Bonus）；Bonus = B；
 * 剩余容量 = 最高可能 − 最低可能（= 100R，期末替代时按更好的场景）；
 * 已失 = 100 − 已拿到 − 剩余容量；还需 = 目标距最低可能的差，限在剩余容量内；余量 = 剩余容量 − 还需。
 */
export interface ProgressBreakdown {
  earned: number;
  bonus: number;
  lost: number;
  need: number;
  slack: number;
  /** 五段合计（= 100 + Bonus），画进度条时作分母 */
  total: number;
}

export function progressBreakdown(r: CourseResult): ProgressBreakdown {
  const earned = Math.max(0, r.locked);
  const bonus = r.bonusPoints;
  const open = Math.max(0, r.maxPossible - r.minPossible);
  const lost = Math.max(0, 100 - earned - open);
  const need = Math.min(open, Math.max(0, r.target - r.minPossible));
  const slack = Math.max(0, open - need);
  return { earned, bonus, lost, need, slack, total: earned + bonus + lost + need + slack };
}
