import { useState } from 'react';
import type { GradeScaleId, ScaleEntry } from '../types';
import { formatScore as f, progressBreakdown } from '../lib/grade';
import { resolveScale, SCALE_OPTIONS } from '../lib/scales';
import { useCourse } from '../state/CourseContext';
import { ScaleEditor } from './ScaleEditor';
import { btn, feasibilityTone, field, NumberInput, Pill, trim1 } from './ui';

export function Overview() {
  const { course, result: r, dispatch } = useCourse();
  const b = progressBreakdown(r);
  const tone = feasibilityTone(r.status);
  const setTarget = (v: number | null) => v !== null && dispatch({ type: 'setTarget', value: v });

  // 等级表：选「自定义…」且还没有自定义表时先打开编辑器（以当前等级表为底稿）
  const scale = resolveScale(course.gradeScale, course.customScale);
  const [editing, setEditing] = useState(false);
  const pickScale = (id: GradeScaleId) => {
    if (id === 'custom' && !course.customScale?.length) setEditing(true);
    else dispatch({ type: 'setScale', gradeScale: id });
  };
  const saveScale = (entries: ScaleEntry[]) => {
    dispatch({ type: 'setScale', gradeScale: 'custom', customScale: entries });
    setEditing(false);
  };

  // 目标等级下拉：目标正好等于某档下限时选中那一档；否则显示「≈ 当前等级」占位，选任意一档都会生效
  const exact = scale.find(([l, m]) => l === r.targetGrade && Math.abs(m - course.target) < 1e-9);
  const gradeValue = exact ? exact[0] : '';

  const segments = [
    { key: 'earned', label: '已拿到', value: f(b.earned), width: b.earned, color: 'bg-ink' },
    ...(course.bonus ? [{ key: 'bonus', label: 'Bonus', value: `+${f(b.bonus)}`, width: b.bonus, color: 'bg-bonus' }] : []),
    { key: 'lost', label: '已失', value: f(b.lost), width: b.lost, color: 'bg-line' },
    { key: 'need', label: '还需', value: f(b.need), width: b.need, color: 'bg-assume' },
  ];
  const pct = (w: number) => `${b.total > 0 ? (w / b.total) * 100 : 0}%`;

  return (
    <section className="flex flex-wrap gap-8 rounded-[14px] border border-edge bg-white px-7 py-6">
      {/* 左：当前成绩 + 进度条 */}
      <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5">
        <div className="text-[13px] font-medium text-muted">当前成绩 · 只按已完成项</div>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-[56px] leading-none font-extrabold tracking-[-0.03em]" data-testid="current">
            {r.current === null ? '—' : f(r.current)}
          </span>
          {r.currentGrade && (
            <span className="rounded-full bg-chip px-2.5 py-1 text-base font-bold text-chip-ink">{r.currentGrade}</span>
          )}
          <span className="text-sm text-muted">
            含假设预估{' '}
            <strong className="text-assume-dark" data-testid="projected">{r.projected === null ? '—' : f(r.projected)}</strong>
            {r.projectedGrade && ` · ${r.projectedGrade}`}
          </span>
        </div>

        <div
          className="mt-1 flex h-3.5 overflow-hidden rounded-[7px] bg-assume-tint"
          role="img"
          aria-label={segments.map((s) => `${s.label} ${s.value}`).join('，') + `，余量 ${f(b.slack)}`}
        >
          {segments.map((s) => (
            <div key={s.key} className={`${s.color} transition-[width] duration-150`} style={{ width: pct(s.width) }} />
          ))}
        </div>

        <div className="flex flex-wrap gap-x-[18px] gap-y-1.5 text-xs text-muted">
          {segments.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-[3px] ${s.color}`} />
              {s.label} {s.value}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="box-border h-2.5 w-2.5 rounded-[3px] border border-assume-edge bg-assume-tint" />
            余量 {f(b.slack)}
          </span>
        </div>
      </div>

      {/* 右：目标、等级表、状态 */}
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3 border-edge lg:border-l lg:pl-8">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="target-num" className="text-[13px] font-medium text-muted">目标分数</label>
          <span className="flex items-center gap-2">
            <NumberInput
              id="target-num"
              value={course.target}
              onValue={setTarget}
              min={0}
              max={100}
              step="any"
              className={`${field.base} ${field.solid} w-[72px] text-right text-xl font-bold`}
            />
            <select
              value={gradeValue}
              onChange={(e) => {
                const hit = scale.find(([l]) => l === e.target.value);
                if (hit) setTarget(hit[1]);
              }}
              aria-label="按等级设目标"
              title="选等级，目标设为该等级的下限"
              className="h-[34px] rounded-lg border border-edge bg-white px-2 text-[13px] font-semibold text-ink"
            >
              {!exact && <option value="" disabled>{r.targetGrade ? `≈ ${r.targetGrade}` : '等级'}</option>}
              {scale.map(([l, m]) => (
                <option key={l} value={l}>{l} · ≥{trim1(m)}</option>
              ))}
            </select>
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(course.target)}
          onChange={(e) => setTarget(Number(e.target.value))}
          aria-label="目标分数滑块"
          className="w-full"
        />
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="scale" className="text-[13px] text-muted">等级表</label>
          <span className="flex items-center gap-2">
            {course.gradeScale === 'custom' && (
              <button type="button" onClick={() => setEditing(true)} className={`${btn.base} ${btn.outline} h-[34px]! px-2.5! text-[13px]`}>
                编辑
              </button>
            )}
            <select
              id="scale"
              value={course.gradeScale}
              onChange={(e) => pickScale(e.target.value as GradeScaleId)}
              className="h-[34px] rounded-lg border border-edge bg-white px-2.5 text-[13px] text-ink"
            >
              {SCALE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.id === 'custom' && course.customScale?.length ? '自定义' : o.name}</option>
              ))}
            </select>
          </span>
        </div>
        <div className="-mt-1 text-right text-xs text-muted" data-testid="scale-summary">
          {scale.slice(0, 6).map(([l, m]) => `${l} ≥${trim1(m)}`).join(' · ')}
          {scale.length > 6 ? ' …' : ''}
        </div>
        <div className="mt-1 flex items-start gap-2.5">
          <Pill className={tone.pill}>{r.statusLabel}</Pill>
          <span className="pt-0.5 text-[13px] leading-snug text-ink">{r.conclusion}</span>
        </div>
      </div>
      {editing && <ScaleEditor initial={course.customScale?.length ? course.customScale : scale} onSave={saveScale} onCancel={() => setEditing(false)} />}
    </section>
  );
}
