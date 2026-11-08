import { useEffect, useRef, useState } from 'react';
import type { GradeItem } from '../types';
import { formatScore as f, isFinalItem, type CourseResult, type ItemResult } from '../lib/grade';
import { useCourse } from '../state/CourseContext';
import { btn, feasibilityTone, field, IconChevron, IconClose, IconPen, IconPlus, IconTrash, NumberInput, Pill, trim1 } from './ui';
import { AdvancedPanel } from './AdvancedPanel';

/** 八列：评分项 / 权重 / 满分 / 已得分 / 状态 / 需要 · 假设 / 高级 / 删除 */
const GRID = 'grid grid-cols-[2fr_0.7fr_0.7fr_0.9fr_1fr_3fr_76px_34px] items-center gap-4 px-6';

export function GradeTable() {
  const { course, result: r, dispatch } = useCourse();

  // 新加的行：名称框自动聚焦
  const seen = useRef(new Set(course.items.map((i) => i.id)));
  useEffect(() => {
    seen.current = new Set(course.items.map((i) => i.id));
  });

  return (
    <section className="overflow-hidden rounded-[14px] border border-edge bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-edge px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-bold">评分构成</h2>
          <WeightBadge r={r} />
          {course.bonus && (
            <Pill className="bg-bonus-tint text-bonus-dark">Bonus 最多 +{trim1(course.bonus.max)}</Pill>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => dispatch({ type: 'addItem' })} className={`${btn.base} ${btn.primary}`}>
            <IconPlus />添加评分项
          </button>
          {!course.bonus && (
            <button
              type="button"
              onClick={() => dispatch({ type: 'addBonus' })}
              className={`${btn.base} border border-bonus-edge bg-white font-semibold text-bonus-dark hover:bg-bonus-row`}
            >
              <IconPlus />添加 Bonus
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-[960px] flex-col">
          <div className={`${GRID} bg-head py-2.5 text-xs font-semibold text-muted`}>
            <span>评分项</span><span>权重 %</span><span>满分</span><span>已得分</span><span>状态</span><span>需要 · 假设</span>
            <span className="sr-only">高级</span>
            <span className="sr-only">删除</span>
          </div>

          {course.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              res={r.items.find((x) => x.id === item.id)!}
              r={r}
              autoFocus={!seen.current.has(item.id)}
            />
          ))}

          {course.items.length === 0 && (
            <div className="border-t border-divide px-6 py-8 text-center text-sm text-muted">
              还没有评分项。点「添加评分项」开始，比如作业、期中、期末。
            </div>
          )}

          {course.bonus && <BonusRow />}
        </div>
      </div>
    </section>
  );
}

function WeightBadge({ r }: { r: CourseResult }) {
  return r.weightsOk ? (
    <Pill className="bg-ok-tint text-ok">权重合计 100%</Pill>
  ) : (
    <Pill className="bg-bonus-tint text-bonus-dark">权重合计 {trim1(r.weightTotal)}% · 应为 100%</Pill>
  );
}

// ───────────────────────── 普通行 ─────────────────────────

function ItemRow({ item, res, r, autoFocus }: { item: GradeItem; res: ItemResult; r: CourseResult; autoFocus: boolean }) {
  const { dispatch } = useCourse();
  const update = (patch: Partial<GradeItem>) => dispatch({ type: 'updateItem', id: item.id, patch });
  const open = res.status !== 'completed';
  const label = item.name || '未命名';
  const hasSub = !!item.advanced && item.advanced.count > 0;
  const advActive = hasSub || (isFinalItem(item) && !!item.replaces);
  const [expanded, setExpanded] = useState(false);

  const secondary =
    res.summary ||
    (res.status === 'completed'
      ? item.max !== 100 && res.percent !== null ? `得分率 ${f(res.percent)}%` : '已出分'
      : res.status === 'assumed' ? '未出分 · 按假设计算' : '未出分');

  return (
    <div>
      <div className={`${GRID} border-t border-divide py-3.5 ${res.status === 'assumed' ? 'bg-assume-row' : ''}`}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <input
            value={item.name}
            onChange={(e) => update({ name: e.target.value })}
            onFocus={(e) => e.target.select()}
            autoFocus={autoFocus}
            placeholder="评分项名称"
            aria-label="评分项名称"
            className="-mx-1.5 min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[15px] font-semibold text-ink outline-none hover:border-edge focus:border-assume focus:bg-white"
          />
          <span className={`truncate text-xs ${advActive ? 'text-assume-dark' : 'text-muted'}`} title={secondary} data-testid={`summary-${item.id}`}>
            {secondary}
          </span>
        </div>

        <NumberInput
          value={item.weight}
          onValue={(v) => update({ weight: v ?? 0 })}
          min={0}
          step="any"
          aria-label={`${label}权重`}
          className={`${field.base} ${field.solid} w-14`}
        />
        {hasSub ? (
          <span className="text-[13px] text-muted">按子项</span>
        ) : (
          <NumberInput
            value={item.max}
            onValue={(v) => v !== null && v > 0 && update({ max: v })}
            min={0}
            step="any"
            aria-label={`${label}满分`}
            className={`${field.base} ${field.solid} w-14`}
          />
        )}
        {hasSub ? (
          <SubScoreReadout res={res} label={label} />
        ) : (
          <NumberInput
            value={item.score}
            onValue={(v) => update({ score: v })}
            allowEmpty
            min={0}
            step="any"
            placeholder="未出分"
            aria-label={`${label}已得分`}
            className={`${field.base} w-16 ${
              open ? 'border-dashed border-dash bg-transparent' : 'border-edge bg-white font-semibold'
            }`}
          />
        )}

        <span><StatusPill status={res.status} /></span>

        <div className="min-w-0">
          {res.status === 'completed' && <Contribution res={res} />}
          {res.status === 'assumed' &&
            (hasSub ? (
              <span className="text-[13px] text-assume-dark">
                按子项假设 <strong className="text-base">{f(res.percent ?? 0)}%</strong>
              </span>
            ) : (
              <AssumeEditor item={item} label={label} />
            ))}
          {res.status === 'pending' && (
            <Need item={item} res={res} r={r} onSubAssume={hasSub ? () => setExpanded(true) : undefined} />
          )}
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={`adv-${item.id}`}
          title={expanded ? '收起高级' : isFinalItem(item) ? '多次子项、期末替代期中' : '多次子项'}
          className={`inline-flex h-8 cursor-pointer items-center justify-center gap-1 rounded-lg border px-2 text-[13px] font-semibold ${
            expanded || advActive
              ? 'border-assume-edge bg-assume-tint text-assume-dark'
              : 'border-edge bg-white text-muted hover:bg-page hover:text-ink'
          }`}
        >
          高级
          <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}><IconChevron size={12} /></span>
        </button>

        <button
          type="button"
          onClick={() => dispatch({ type: 'removeItem', id: item.id })}
          aria-label={`删除${label}`}
          title="删除这一项"
          className={`${btn.icon} border-transparent bg-transparent hover:border-bad-tint hover:bg-bad-tint hover:text-bad`}
        >
          <IconTrash />
        </button>
      </div>
      {expanded && <AdvancedPanel item={item} res={res} r={r} />}
    </div>
  );
}

/** 有子项时主表「已得分」只读：完成或全部假设时显示这一项的百分比，否则显示已完成部分 */
function SubScoreReadout({ res, label }: { res: ItemResult; label: string }) {
  const v = res.status === 'pending' ? res.currentPercent : res.percent;
  return (
    <output
      aria-label={`${label}已得分（由子项算出）`}
      title={res.status === 'pending' && v !== null ? '已完成部分，由子项算出' : '由子项算出'}
      className={`inline-flex h-[34px] w-16 items-center justify-center rounded-lg border border-edge bg-page text-sm ${
        res.status === 'pending' ? 'text-muted' : 'font-semibold text-ink'
      }`}
    >
      {v === null ? '—' : `${f(v)}%`}
    </output>
  );
}

function StatusPill({ status }: { status: ItemResult['status'] }) {
  if (status === 'completed') return <Pill className="bg-chip text-chip-ink">已完成</Pill>;
  if (status === 'assumed')
    return <Pill className="border border-dashed border-assume bg-assume-tint py-[3px]! text-assume-dark">假设</Pill>;
  return <Pill className="border border-dash bg-white py-[3px]! text-muted">未完成</Pill>;
}

function Contribution({ res }: { res: ItemResult }) {
  const pts = res.normWeight * (res.percent ?? 0);
  return (
    <span className="text-[13px] text-muted">
      已贡献 {f(pts)} / {trim1(res.normWeight * 100)} 分
    </span>
  );
}

/** 未完成：「需要 X%」+「假设」按钮 */
function Need({
  item, res, r, onSubAssume,
}: { item: GradeItem; res: ItemResult; r: CourseResult; onSubAssume?: () => void }) {
  const { dispatch } = useCourse();
  const tone = feasibilityTone(r.status);
  const others = r.items.filter((i) => i.required !== null && i.id !== item.id);

  let note = '';
  if (res.required !== null) {
    if (r.status === 'secured') note = '（0 分也能达标）';
    else if (others.length === 1) note = `（与${others[0].name || '未命名'}均分）`;
    else if (others.length > 1) note = `（剩余 ${others.length + 1} 项均分）`;
  }

  // 「假设」默认填需求分（向上取整），没有需求分时填目标
  const start = res.required !== null ? Math.ceil(res.required - 1e-9) : Math.round(r.target);
  const assume = () => dispatch({ type: 'assume', id: item.id, value: Math.min(100, Math.max(0, start)) });

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-ink">
        {res.required === null ? (
          <span className="text-muted">—</span>
        ) : (
          <>
            需要 <strong className={`text-base ${tone.text}`}>{f(Math.max(0, res.required))}%</strong>{' '}
            <span className="text-muted">{note}</span>
          </>
        )}
      </span>
      <button
        type="button"
        onClick={onSubAssume ?? assume}
        title={onSubAssume ? '有子项时在「高级」里逐次假设' : undefined}
        className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-assume bg-white px-3 text-[13px] font-semibold whitespace-nowrap text-assume-dark hover:bg-assume-tint"
      >
        <IconPen />{onSubAssume ? '逐次假设' : '假设'}
      </button>
    </div>
  );
}

/** 假设态：数字框 + 滑块 + ×（假设分是百分比 0–100） */
function AssumeEditor({ item, label }: { item: GradeItem; label: string }) {
  const { dispatch } = useCourse();
  const v = item.assumed ?? 0;
  const set = (n: number | null) => n !== null && dispatch({ type: 'assume', id: item.id, value: n });
  const id = `assume-${item.id}`;

  return (
    <div className="flex items-center gap-2.5">
      <label htmlFor={id} className="text-[13px] font-semibold whitespace-nowrap text-assume-dark">假设考</label>
      <NumberInput
        id={id}
        value={v}
        onValue={set}
        min={0}
        max={100}
        step="any"
        className={`${field.base} w-16 border-assume bg-white font-bold text-assume-dark`}
      />
      {item.max !== 100 && <span className="text-[13px] text-assume-dark">%</span>}
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(v)}
        onChange={(e) => set(Number(e.target.value))}
        aria-label={`${label}假设分数滑块`}
        className="min-w-0 flex-[1_1_120px]"
      />
      <button
        type="button"
        onClick={() => dispatch({ type: 'clearAssumption', id: item.id })}
        aria-label={`清除${label}的假设`}
        title="清除假设"
        className={btn.icon}
      >
        <IconClose />
      </button>
    </div>
  );
}

// ───────────────────────── Bonus 行 ─────────────────────────

function BonusRow() {
  const { course, result: r, dispatch } = useCourse();
  const bonus = course.bonus!;
  const update = (patch: Partial<typeof bonus>) => dispatch({ type: 'updateBonus', patch });

  return (
    <div className={`${GRID} border-t border-dashed border-bonus-edge bg-bonus-row py-3.5`}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <input
          value={bonus.name}
          onChange={(e) => update({ name: e.target.value })}
          onFocus={(e) => e.target.select()}
          placeholder="Bonus 名称"
          aria-label="Bonus 名称"
          className="-mx-1.5 min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[15px] font-semibold text-ink outline-none hover:border-bonus-edge focus:border-bonus focus:bg-white"
        />
        <span className="text-xs leading-snug text-muted">权重外加分 · 不计入 100% · 直接加到总分</span>
      </div>
      <span className="text-[13px] text-muted">权重外</span>
      <NumberInput
        value={bonus.max}
        onValue={(v) => v !== null && v >= 0 && update({ max: v })}
        min={0}
        step="any"
        aria-label="Bonus 最多加分"
        title="最多加分"
        className={`${field.base} ${field.solid} w-14`}
      />
      <NumberInput
        value={bonus.score}
        onValue={(v) => update({ score: v })}
        allowEmpty
        min={0}
        step="any"
        placeholder="0"
        aria-label="Bonus 已得分"
        aria-invalid={r.bonusOverMax}
        title={r.bonusOverMax ? `超过最多加分，按 +${trim1(bonus.max)} 计` : undefined}
        className={`${field.base} w-16 bg-white font-semibold ${
          r.bonusOverMax ? 'border-bad text-bad focus:border-bad focus:ring-bad/15' : 'border-edge'
        }`}
      />
      <span><Pill className="bg-bonus-tint text-bonus-dark">Bonus</Pill></span>
      <span className="text-[13px] text-ink">
        已加 <strong className="text-base text-bonus-dark">+{f(r.bonusPoints)}</strong> 分{' '}
        <span className={r.bonusOverMax ? 'text-bad' : 'text-muted'}>
          · {r.bonusOverMax ? `超过上限，按最多 +${trim1(bonus.max)} 计` : `最多 +${trim1(bonus.max)}`}
        </span>
      </span>
      <span />
      <button
        type="button"
        onClick={() => dispatch({ type: 'removeBonus' })}
        aria-label="删除 Bonus"
        title="删除 Bonus"
        className={`${btn.icon} border-transparent bg-transparent hover:border-bad-tint hover:bg-bad-tint hover:text-bad`}
      >
        <IconTrash />
      </button>
    </div>
  );
}
