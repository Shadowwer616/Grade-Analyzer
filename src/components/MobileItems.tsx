// 手机端评分项（阶段 5，按画板 Mobile）：
// 已完成项折叠成一行、Bonus 一行紧凑显示、每个未完成项一张卡；高级面板在卡片内展开；底部固定「添加评分项」+「清空假设」。
// 行内的「需要 X% + 假设」、假设编辑、高级面板都和桌面共用组件，只换外层布局。
//
// 卡片按课程顺序渲染在同一个父元素里，分组靠 CSS order：这样一项从「未完成」变成「已完成」时组件不重建，
// 正在输入的分数框不会丢焦点。
import { useRef, useState, type CSSProperties } from 'react';
import type { GradeItem } from '../types';
import { formatScore as f, isFinalItem, type CourseResult, type ItemResult } from '../lib/grade';
import { useCourse } from '../state/CourseContext';
import { hasAssumptions } from '../state/courseReducer';
import { field, IconChevron, IconChevronRight, IconPlus, IconTrash, NumberInput, Pill, trim1 } from './ui';
import { AdvancedPanel } from './AdvancedPanel';
import {
  AssumeEditor, Contribution, EmptyTemplates, itemSecondary, MoveButtons, Need, shortScore, StatusPill, SubScoreReadout,
  useNewItemIds,
} from './ItemParts';

const ORDER = { doneSummary: 0, done: 1, bonus: 2, open: 3, addBonus: 4 } as const;

export function MobileItems() {
  const { course, result: r, dispatch } = useCourse();
  const isNew = useNewItemIds(course.items);
  const resOf = (id: string) => r.items.find((x) => x.id === id)!;
  const isDone = (item: GradeItem) => resOf(item.id).status === 'completed';

  const done = course.items.filter(isDone);
  const open = course.items.filter((i) => !isDone(i));

  // 折叠时隐藏的是「折叠那一刻已经完成的项」；之后刚录完分数的项先留在原地可见，直到再次折叠
  const [showDone, setShowDone] = useState(false);
  const [hiddenDone, setHiddenDone] = useState(() => new Set(done.map((i) => i.id)));
  const toggleDone = () => {
    if (showDone) setHiddenDone(new Set(done.map((i) => i.id)));
    setShowDone(!showDone);
  };

  // 上移 / 下移：和同一组里相邻的那一项换位置
  const neighbor = (item: GradeItem, dir: -1 | 1) => {
    const group = isDone(item) ? done : open;
    const k = group.findIndex((i) => i.id === item.id);
    const other = group[k + dir];
    if (!other) return null;
    return () => dispatch({ type: 'moveItem', id: item.id, to: course.items.findIndex((i) => i.id === other.id) });
  };

  if (course.items.length === 0) {
    return (
      <div className="flex flex-col gap-3" data-testid="m-items">
        <section className="rounded-[14px] border border-edge bg-white p-4">
          <EmptyTemplates />
        </section>
        {course.bonus ? <BonusCompact /> : <AddBonus />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="m-items">
      {done.length > 0 && (
        <button
          type="button"
          onClick={toggleDone}
          aria-expanded={showDone}
          data-testid="done-summary"
          style={{ order: ORDER.doneSummary }}
          className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-2 rounded-[12px] border border-edge bg-white px-3.5 text-left active:bg-page"
        >
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
            <span className="shrink-0">已完成 {done.length} 项</span>
            <span className="truncate text-xs font-medium text-muted">{done.map((i) => shortScore(i, resOf(i.id))).join(' · ')}</span>
          </span>
          <span className={`shrink-0 text-muted transition-transform ${showDone ? 'rotate-90' : ''}`}><IconChevronRight /></span>
        </button>
      )}

      {course.items.map((item) => {
        const res = resOf(item.id);
        const completed = res.status === 'completed';
        const hidden = completed && !showDone && hiddenDone.has(item.id);
        return (
          <ItemCard
            key={item.id}
            item={item}
            res={res}
            r={r}
            autoFocus={isNew(item.id)}
            hidden={hidden}
            style={{ order: completed ? ORDER.done : ORDER.open }}
            onUp={neighbor(item, -1)}
            onDown={neighbor(item, 1)}
          />
        );
      })}

      {course.bonus ? (
        <div style={{ order: ORDER.bonus }}><BonusCompact /></div>
      ) : (
        <div style={{ order: ORDER.addBonus }}><AddBonus /></div>
      )}
    </div>
  );
}

// ───────────────────────── 卡片 ─────────────────────────

function ItemCard({
  item, res, r, autoFocus, hidden, style, onUp, onDown,
}: {
  item: GradeItem;
  res: ItemResult;
  r: CourseResult;
  autoFocus: boolean;
  hidden: boolean;
  style: CSSProperties;
  onUp: (() => void) | null;
  onDown: (() => void) | null;
}) {
  const { dispatch } = useCourse();
  const update = (patch: Partial<GradeItem>) => dispatch({ type: 'updateItem', id: item.id, patch });
  const label = item.name || '未命名';
  const hasSub = !!item.advanced && item.advanced.count > 0;
  const advActive = hasSub || (isFinalItem(item) && !!item.replaces);
  // 新加的卡片直接展开字段，方便填权重
  const [editing, setEditing] = useState(autoFocus);
  const [adv, setAdv] = useState(false);
  const cardRef = useRef<HTMLElement>(null);

  // 换位置后把卡片滚回视野里，按钮焦点也留在原来那个按钮上
  const after = (fn: (() => void) | null) =>
    fn &&
    ((e: { currentTarget: HTMLButtonElement }) => {
      const b = e.currentTarget;
      fn();
      requestAnimationFrame(() => {
        b.focus({ preventScroll: true });
        cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    });

  const tone =
    res.status === 'assumed' ? 'border-assume-edge bg-assume-row' : 'border-edge bg-white';
  const toggle = (on: boolean) =>
    `inline-flex h-10 cursor-pointer items-center gap-1 rounded-[10px] border px-3 text-[13px] font-semibold ${
      on ? 'border-assume-edge bg-assume-tint text-assume-dark' : 'border-edge bg-white text-muted active:bg-page'
    }`;

  return (
    <section
      ref={cardRef}
      hidden={hidden}
      style={style}
      className={`flex flex-col gap-2.5 rounded-[12px] border p-3.5 ${tone}`}
      data-testid={`card-${item.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <input
            value={item.name}
            onChange={(e) => update({ name: e.target.value })}
            onBlur={() => dispatch({ type: 'updateItem', id: item.id, patch: {}, commit: true })}
            autoFocus={autoFocus}
            placeholder="评分项名称"
            aria-label="评分项名称"
            className="-mx-1.5 min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[15px] font-bold text-ink outline-none focus:border-assume focus:bg-white"
          />
          <span className={`truncate text-xs ${advActive ? 'text-assume-dark' : 'text-muted'}`} data-testid={`summary-${item.id}`}>
            权重 {trim1(item.weight)}% · {itemSecondary(item, res)}
          </span>
        </div>
        <span className="shrink-0 pt-0.5"><StatusPill status={res.status} /></span>
      </div>

      {res.status === 'completed' && <Contribution res={res} />}
      {res.status === 'assumed' &&
        (hasSub ? (
          <span className="text-[13px] text-assume-dark">
            按子项假设 <strong className="text-lg">{f(res.percent ?? 0)}%</strong>
          </span>
        ) : (
          <AssumeEditor item={item} label={label} />
        ))}
      {res.status === 'pending' && (
        <Need item={item} res={res} r={r} onSubAssume={hasSub ? () => setAdv(true) : undefined} />
      )}

      {editing && (
        <div className="grid grid-cols-3 gap-2 rounded-[10px] bg-page p-2.5" data-testid={`fields-${item.id}`}>
          <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-muted">
            权重 %
            <NumberInput
              value={item.weight}
              onValue={(v) => update({ weight: v ?? 0 })}
              min={0}
              step="any"
              aria-label={`${label}权重`}
              className={`${field.base} ${field.solid} h-11 w-full`}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-muted">
            满分
            {hasSub ? (
              <span className="flex h-11 items-center text-[13px]">按子项</span>
            ) : (
              <NumberInput
                value={item.max}
                onValue={(v) => v !== null && v > 0 && update({ max: v })}
                min={0}
                step="any"
                aria-label={`${label}满分`}
                className={`${field.base} ${field.solid} h-11 w-full`}
              />
            )}
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-muted">
            已得分
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
                className={`${field.base} h-11 w-full ${
                  res.status === 'completed' ? 'border-edge bg-white font-semibold' : 'border-dashed border-dash bg-white'
                }`}
              />
            )}
          </label>
        </div>
      )}

      {adv && (
        <div className="-mx-3.5 border-t border-divide">
          <AdvancedPanel item={item} res={res} r={r} />
        </div>
      )}

      <div className="flex items-center gap-1.5 border-t border-divide pt-2.5">
        <MoveButtons label={label} onUp={after(onUp)} onDown={after(onDown)} size="lg" />
        <span className="flex-1" />
        <button type="button" onClick={() => setEditing((v) => !v)} aria-expanded={editing} className={toggle(editing)}>
          {res.status === 'completed' ? '改分' : '录分'}
        </button>
        <button
          type="button"
          onClick={() => setAdv((v) => !v)}
          aria-expanded={adv}
          aria-controls={`adv-${item.id}`}
          className={toggle(adv || advActive)}
        >
          高级
          <span className={`transition-transform ${adv ? 'rotate-180' : ''}`}><IconChevron size={12} /></span>
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'removeItem', id: item.id })}
          aria-label={`删除${label}`}
          className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-edge bg-white text-muted active:bg-bad-tint active:text-bad"
        >
          <IconTrash />
        </button>
      </div>
    </section>
  );
}

// ───────────────────────── Bonus ─────────────────────────

/** 一行紧凑显示「Bonus 课堂参与 · +2.0 / 最多 5」，点开可改名称、上限、已得分，可删除 */
function BonusCompact() {
  const { course, result: r, dispatch } = useCourse();
  const bonus = course.bonus!;
  const update = (patch: Partial<typeof bonus>) => dispatch({ type: 'updateBonus', patch });
  const [open, setOpen] = useState(false);
  const name = bonus.name.replace(/\s*bonus\s*$/i, '').trim() || bonus.name;

  return (
    <div className="flex flex-col rounded-[12px] border border-dashed border-bonus-edge bg-bonus-row" data-testid="bonus-compact">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-2 border-0 bg-transparent px-3.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
          <Pill className="bg-bonus-tint px-[7px]! py-0.5! text-[11px]! font-bold text-bonus-dark">Bonus</Pill>
          <span className="truncate">{name}</span>
        </span>
        <span className="shrink-0 text-sm font-bold text-bonus-dark">
          +{f(r.bonusPoints)} <span className={`text-xs font-medium ${r.bonusOverMax ? 'text-bad' : 'text-muted'}`}>/ 最多 {trim1(bonus.max)}</span>
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-dashed border-bonus-edge px-3.5 py-3">
          <div className="grid grid-cols-[1fr_72px_72px] gap-2">
            <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-muted">
              名称
              <input
                value={bonus.name}
                onChange={(e) => update({ name: e.target.value })}
                aria-label="Bonus 名称"
                className={`${field.base} ${field.solid} h-11 min-w-0`}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
              最多
              <NumberInput
                value={bonus.max}
                onValue={(v) => v !== null && v >= 0 && update({ max: v })}
                min={0}
                step="any"
                aria-label="Bonus 最多加分"
                className={`${field.base} ${field.solid} h-11 w-full`}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
              已得
              <NumberInput
                value={bonus.score}
                onValue={(v) => update({ score: v })}
                allowEmpty
                min={0}
                step="any"
                placeholder="0"
                aria-label="Bonus 已得分"
                aria-invalid={r.bonusOverMax}
                className={`${field.base} h-11 w-full bg-white font-semibold ${r.bonusOverMax ? 'border-bad text-bad' : 'border-edge'}`}
              />
            </label>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-xs ${r.bonusOverMax ? 'text-bad' : 'text-muted'}`}>
              {r.bonusOverMax ? `超过上限，按最多 +${trim1(bonus.max)} 计` : '权重外加分，直接加到总分'}
            </span>
            <button
              type="button"
              onClick={() => dispatch({ type: 'removeBonus' })}
              className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] border border-edge bg-white px-3 text-[13px] font-semibold text-bad"
            >
              <IconTrash />删除 Bonus
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddBonus() {
  const { dispatch } = useCourse();
  return (
    <button
      type="button"
      onClick={() => dispatch({ type: 'addBonus' })}
      className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-bonus-edge bg-transparent text-sm font-semibold text-bonus-dark"
    >
      <IconPlus />添加 Bonus
    </button>
  );
}

// ───────────────────────── 底部固定栏 ─────────────────────────

/** 底部固定「添加评分项」+「清空假设」，上方渐变遮住滚过去的内容 */
export function MobileBottomBar() {
  const { course, dispatch } = useCourse();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 bg-[linear-gradient(180deg,rgba(244,245,247,0)_0%,var(--color-page)_40%)] px-4 pt-5 pb-[max(24px,env(safe-area-inset-bottom))]"
      data-testid="m-bottom-bar"
    >
      <div className="pointer-events-auto flex gap-2.5">
        <button
          type="button"
          onClick={() => dispatch({ type: 'addItem' })}
          className="flex h-[50px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-[12px] border-0 bg-ink text-[15px] font-semibold text-white active:bg-ink/85"
        >
          <IconPlus size={16} />添加评分项
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'clearAllAssumptions' })}
          disabled={!hasAssumptions(course)}
          className="h-[50px] shrink-0 cursor-pointer rounded-[12px] border border-edge bg-white px-4 text-sm font-semibold text-ink active:bg-page disabled:cursor-not-allowed disabled:text-muted"
        >
          清空假设
        </button>
      </div>
    </div>
  );
}
