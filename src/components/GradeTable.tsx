// 评分表。桌面端是八列表格；手机端（≤ 640px）换成卡片布局（MobileItems），行内小块共用 ItemParts。
// 阶段 5：每行加上移 / 下移，桌面端还能按住左边的把手拖动排序；没有评分项时显示三个模板入口。
import { useRef, useState, type DragEvent } from 'react';
import type { GradeItem } from '../types';
import { formatScore as f, isFinalItem, type CourseResult, type ItemResult } from '../lib/grade';
import { useCourse } from '../state/CourseContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { btn, field, IconChevron, IconGrip, IconPlus, IconTrash, NumberInput, Pill, trim1 } from './ui';
import { AdvancedPanel } from './AdvancedPanel';
import {
  AssumeEditor, Contribution, EmptyTemplates, itemSecondary, MoveButtons, Need, StatusPill, SubScoreReadout, useNewItemIds, WeightBadge,
} from './ItemParts';
import { MobileItems } from './MobileItems';

/** 九列：把手 / 评分项 / 权重 / 满分 / 已得分 / 状态 / 需要 · 假设 / 高级 / 排序 + 删除 */
const GRID = 'grid grid-cols-[18px_2fr_0.7fr_0.7fr_0.9fr_1fr_3fr_76px_96px] items-center gap-4 pr-6 pl-3';

export function GradeTable() {
  const mobile = useIsMobile();
  return mobile ? <MobileItems /> : <DesktopTable />;
}

/** 拖动时的插入位置：第 index 行的上沿（0…n） */
interface DragState {
  id: string;
  over: number | null;
}

function DesktopTable() {
  const { course, result: r, dispatch } = useCourse();
  const isNew = useNewItemIds(course.items);
  const [drag, setDrag] = useState<DragState | null>(null);

  const move = (id: string, to: number) => dispatch({ type: 'moveItem', id, to });

  const onDragOver = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const over = e.clientY < rect.top + rect.height / 2 ? index : index + 1;
    if (over !== drag.over) setDrag({ ...drag, over });
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (drag && drag.over !== null) {
      const from = course.items.findIndex((i) => i.id === drag.id);
      // 插入位置在原位置之后时，先拿掉自己，目标下标要减 1
      const to = drag.over > from ? drag.over - 1 : drag.over;
      if (from >= 0 && to !== from) move(drag.id, to);
    }
    setDrag(null);
  };

  return (
    <section className="overflow-hidden rounded-[14px] border border-edge bg-white" data-testid="grade-table">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-edge px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-bold">评分构成</h2>
          {course.items.length > 0 && <WeightBadge r={r} />}
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

      {course.items.length === 0 ? (
        <>
          <EmptyTemplates />
          {course.bonus && (
            <div className="overflow-x-auto">
              <div className="flex min-w-[1020px] flex-col"><BonusRow /></div>
            </div>
          )}
        </>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex min-w-[1020px] flex-col" onDrop={onDrop} onDragOver={(e) => drag && e.preventDefault()}>
            <div className={`${GRID} bg-head py-2.5 text-xs font-semibold text-muted`}>
              {/* sr-only 是绝对定位、不占格子，外面包一层 span 占住把手这一列 */}
              <span><span className="sr-only">拖动排序</span></span>
              <span>评分项</span><span>权重 %</span><span>满分</span><span>已得分</span><span>状态</span><span>需要 · 假设</span>
              <span className="sr-only">高级</span>
              <span className="sr-only">排序与删除</span>
            </div>

            {course.items.map((item, k) => (
              <ItemRow
                key={item.id}
                item={item}
                res={r.items.find((x) => x.id === item.id)!}
                r={r}
                autoFocus={isNew(item.id)}
                onUp={k > 0 ? () => move(item.id, k - 1) : null}
                onDown={k < course.items.length - 1 ? () => move(item.id, k + 1) : null}
                dragging={drag?.id === item.id}
                dropLine={drag && drag.over === k ? 'top' : drag && drag.over === k + 1 && k === course.items.length - 1 ? 'bottom' : null}
                onDragStart={() => setDrag({ id: item.id, over: null })}
                onDragEnd={() => setDrag(null)}
                onDragOver={onDragOver(k)}
              />
            ))}

            {course.bonus && <BonusRow />}
          </div>
        </div>
      )}
    </section>
  );
}

// ───────────────────────── 普通行 ─────────────────────────

function ItemRow({
  item, res, r, autoFocus, onUp, onDown, dragging, dropLine, onDragStart, onDragEnd, onDragOver,
}: {
  item: GradeItem;
  res: ItemResult;
  r: CourseResult;
  autoFocus: boolean;
  onUp: (() => void) | null;
  onDown: (() => void) | null;
  dragging: boolean;
  dropLine: 'top' | 'bottom' | null;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
}) {
  const { dispatch } = useCourse();
  const update = (patch: Partial<GradeItem>) => dispatch({ type: 'updateItem', id: item.id, patch });
  const open = res.status !== 'completed';
  const label = item.name || '未命名';
  const hasSub = !!item.advanced && item.advanced.count > 0;
  const advActive = hasSub || (isFinalItem(item) && !!item.replaces);
  const [expanded, setExpanded] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  // 只有按住把手时整行才可拖，免得在输入框里选字时误拖
  const [armed, setArmed] = useState(false);

  const secondary = itemSecondary(item, res);
  const line =
    dropLine === 'top' ? 'shadow-[inset_0_2px_0_var(--color-assume)]' : dropLine === 'bottom' ? 'shadow-[inset_0_-2px_0_var(--color-assume)]' : '';

  return (
    <div
      ref={rowRef}
      draggable={armed}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.id);
        onDragStart();
      }}
      onDragEnd={() => {
        setArmed(false);
        onDragEnd();
      }}
      onDragOver={onDragOver}
      className={`${line} ${dragging ? 'opacity-40' : ''}`}
      data-testid={`row-${item.id}`}
    >
      <div className={`${GRID} border-t border-divide py-3.5 ${res.status === 'assumed' ? 'bg-assume-row' : ''}`}>
        <span
          onMouseDown={() => setArmed(true)}
          onMouseUp={() => setArmed(false)}
          title="按住拖动排序"
          aria-hidden
          data-testid={`grip-${item.id}`}
          className="flex h-8 cursor-grab items-center justify-center rounded text-dash hover:bg-page hover:text-muted active:cursor-grabbing"
        >
          <IconGrip />
        </span>

        <div className="flex min-w-0 flex-col gap-0.5">
          <input
            value={item.name}
            onChange={(e) => update({ name: e.target.value })}
            onFocus={(e) => e.target.select()}
            // 失焦时才检查：改名后不再是期末行，就清掉「可替代」（阶段 4）
            onBlur={() => dispatch({ type: 'updateItem', id: item.id, patch: {}, commit: true })}
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

        <div className="flex items-center justify-end gap-0.5">
          <MoveButtons label={label} onUp={onUp} onDown={onDown} />
          <button
            type="button"
            onClick={() => dispatch({ type: 'removeItem', id: item.id })}
            aria-label={`删除${label}`}
            title="删除这一项"
            className={`${btn.icon} h-7! w-7! border-transparent bg-transparent hover:border-bad-tint hover:bg-bad-tint hover:text-bad`}
          >
            <IconTrash />
          </button>
        </div>
      </div>
      {expanded && <AdvancedPanel item={item} res={res} r={r} />}
    </div>
  );
}

// ───────────────────────── Bonus 行 ─────────────────────────

function BonusRow() {
  const { course, result: r, dispatch } = useCourse();
  const bonus = course.bonus!;
  const update = (patch: Partial<typeof bonus>) => dispatch({ type: 'updateBonus', patch });

  return (
    <div className={`${GRID} border-t border-dashed border-bonus-edge bg-bonus-row py-3.5`} data-testid="bonus-row">
      <span />
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
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => dispatch({ type: 'removeBonus' })}
          aria-label="删除 Bonus"
          title="删除 Bonus"
          className={`${btn.icon} h-7! w-7! border-transparent bg-transparent hover:border-bad-tint hover:bg-bad-tint hover:text-bad`}
        >
          <IconTrash />
        </button>
      </div>
    </div>
  );
}
