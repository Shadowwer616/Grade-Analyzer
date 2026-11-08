// 评分项的共用小块（阶段 5 从 GradeTable 拆出）：桌面表格行和手机卡片都用这一套，不复制。
import { useEffect, useRef, type MouseEvent } from 'react';
import type { GradeItem } from '../types';
import { TEMPLATES, type TemplateId } from '../data/templates';
import { formatScore as f, type CourseResult, type ItemResult } from '../lib/grade';
import { useCourse } from '../state/CourseContext';
import { btn, feasibilityTone, field, IconArrowDown, IconArrowUp, IconClose, IconPen, NumberInput, Pill, trim1 } from './ui';

export function WeightBadge({ r }: { r: CourseResult }) {
  return r.weightsOk ? (
    <Pill className="bg-ok-tint text-ok">权重合计 100%</Pill>
  ) : (
    <Pill className="bg-bonus-tint text-bonus-dark">权重合计 {trim1(r.weightTotal)}% · 应为 100%</Pill>
  );
}

/** 有子项时主表「已得分」只读：完成或全部假设时显示这一项的百分比，否则显示已完成部分 */
export function SubScoreReadout({ res, label }: { res: ItemResult; label: string }) {
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

export function StatusPill({ status }: { status: ItemResult['status'] }) {
  if (status === 'completed') return <Pill className="bg-chip text-chip-ink">已完成</Pill>;
  if (status === 'assumed')
    return <Pill className="border border-dashed border-assume bg-assume-tint py-[3px]! text-assume-dark">假设</Pill>;
  return <Pill className="border border-dash bg-white py-[3px]! text-muted">未完成</Pill>;
}

export function Contribution({ res }: { res: ItemResult }) {
  const pts = res.normWeight * (res.percent ?? 0);
  return (
    <span className="text-[13px] text-muted">
      已贡献 {f(pts)} / {trim1(res.normWeight * 100)} 分
    </span>
  );
}

/** 未完成：「需要 X%」+「假设」按钮 */
export function Need({
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
      <span className="min-w-0 text-[13px] text-ink">
        {res.required === null ? (
          <span className="text-muted">—</span>
        ) : (
          <>
            需要 <strong className={`text-base mobile:text-[22px] ${tone.text}`} data-testid={`need-${item.id}`}>{f(Math.max(0, res.required))}%</strong>{' '}
            <span className="text-muted mobile:block mobile:text-xs">{note}</span>
          </>
        )}
      </span>
      <button
        type="button"
        onClick={onSubAssume ?? assume}
        title={onSubAssume ? '有子项时在「高级」里逐次假设' : undefined}
        data-testid={`assume-btn-${item.id}`}
        className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-assume bg-white px-3 text-[13px] font-semibold whitespace-nowrap text-assume-dark hover:bg-assume-tint mobile:h-10 mobile:rounded-[10px] mobile:px-3.5 mobile:text-sm"
      >
        <IconPen />{onSubAssume ? '逐次假设' : '假设'}
      </button>
    </div>
  );
}

/** 假设态：数字框 + 滑块 + ×（假设分是百分比 0–100） */
export function AssumeEditor({ item, label }: { item: GradeItem; label: string }) {
  const { dispatch } = useCourse();
  const v = item.assumed ?? 0;
  const set = (n: number | null) => n !== null && dispatch({ type: 'assume', id: item.id, value: n });
  const id = `assume-${item.id}`;

  return (
    <div className="flex items-center gap-2.5" data-testid={`assume-editor-${item.id}`}>
      <label htmlFor={id} className="text-[13px] font-semibold whitespace-nowrap text-assume-dark">假设考</label>
      <NumberInput
        id={id}
        value={v}
        onValue={set}
        min={0}
        max={100}
        step="any"
        className={`${field.base} w-16 border-assume bg-white font-bold text-assume-dark mobile:h-10 mobile:text-base`}
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
        className={`${btn.icon} mobile:h-10 mobile:w-10`}
      >
        <IconClose />
      </button>
    </div>
  );
}


/** 行名下 / 卡片标题下的一行说明 */
export function itemSecondary(item: GradeItem, res: ItemResult): string {
  if (res.summary) return res.summary;
  if (res.status === 'completed') return item.max !== 100 && res.percent !== null ? `得分率 ${f(res.percent)}%` : '已出分';
  return res.status === 'assumed' ? '未出分 · 按假设计算' : '未出分';
}

type MoveHandler = (e: MouseEvent<HTMLButtonElement>) => void;

/** 新加的行：名称框自动聚焦（桌面表格、手机卡片共用） */
export function useNewItemIds(items: GradeItem[]) {
  const seen = useRef(new Set(items.map((i) => i.id)));
  useEffect(() => {
    seen.current = new Set(items.map((i) => i.id));
  });
  return (id: string) => !seen.current.has(id);
}

/** 上移 / 下移按钮（桌面行末、手机卡片底部都有）；没有可移的位置时置灰 */
export function MoveButtons({
  label, onUp, onDown, size = 'sm',
}: { label: string; onUp: MoveHandler | null; onDown: MoveHandler | null; size?: 'sm' | 'lg' }) {
  const cls =
    size === 'lg'
      ? 'inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-edge bg-white text-muted active:bg-page disabled:cursor-not-allowed disabled:opacity-35'
      : 'inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-muted hover:bg-page hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent';
  return (
    <>
      <button type="button" onClick={onUp ?? undefined} disabled={!onUp} aria-label={`上移${label}`} title="上移" className={cls}>
        <IconArrowUp size={size === 'lg' ? 16 : 13} />
      </button>
      <button type="button" onClick={onDown ?? undefined} disabled={!onDown} aria-label={`下移${label}`} title="下移" className={cls}>
        <IconArrowDown size={size === 'lg' ? 16 : 13} />
      </button>
    </>
  );
}

/** 空状态：没有评分项时给三个模板入口 */
export function EmptyTemplates() {
  const { dispatch } = useCourse();
  const pick = (template: TemplateId) => dispatch({ type: 'applyTemplate', template });
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-8 text-center mobile:px-0 mobile:py-2" data-testid="empty-state">
      <div className="flex flex-col gap-1">
        <span className="text-base font-bold text-ink">还没有评分项</span>
        <span className="text-[13px] text-muted">选一个模板开始，之后权重、名称都能改</span>
      </div>
      <div className="grid w-full max-w-[720px] grid-cols-3 gap-3 mobile:grid-cols-1">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => pick(t.id)}
            data-testid={`template-${t.id}`}
            className="flex min-h-12 cursor-pointer flex-col items-start gap-1 rounded-[12px] border border-edge bg-white px-4 py-3.5 text-left hover:border-assume hover:bg-assume-row"
          >
            <span className="text-sm font-semibold text-ink">{t.id === 'blank' ? '空白，自己添加' : t.name}</span>
            <span className="text-xs text-muted">
              {t.items.length > 0 ? t.items.map((i) => `${i.name} ${i.weight}%`).join(' · ') : '先加一行评分项'}
            </span>
            <span className="text-xs text-muted">{t.detail}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** 「已完成 N 项」折叠行里的一项：作业 85 */
export function shortScore(item: GradeItem, res: ItemResult): string {
  const v = res.percent ?? 0;
  return `${item.name || '未命名'} ${trim1(v)}${item.max === 100 && !item.advanced ? '' : '%'}`;
}
