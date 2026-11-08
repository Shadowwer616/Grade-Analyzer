import { useState } from 'react';
import type { GradeScaleId, ScaleEntry } from '../types';
import { formatScore as f, progressBreakdown } from '../lib/grade';
import { resolveScale, SCALE_OPTIONS } from '../lib/scales';
import { useApp, useCourse } from '../state/CourseContext';
import { sameScale } from '../state/appStore';
import { useIsMobile } from '../hooks/useIsMobile';
import { ScaleEditor } from './ScaleEditor';
import { MyScalesDialog } from './MyScalesDialog';
import { btn, feasibilityTone, field, NumberInput, Pill, trim1 } from './ui';

export function Overview() {
  const { course, result: r, dispatch } = useCourse();
  const b = progressBreakdown(r);
  const tone = feasibilityTone(r.status);
  const setTarget = (v: number | null) => v !== null && dispatch({ type: 'setTarget', value: v });

  // 等级表：选「自定义…」且还没有自定义表时先打开编辑器（以当前等级表为底稿）
  const scale = resolveScale(course.gradeScale, course.customScale);
  // 'edit' = 编辑当前表（是预设时默认勾「存为我的预设」）；'new' = 从预设另起一张本课自定义表
  const [editing, setEditing] = useState<false | 'edit' | 'new'>(false);
  const [managing, setManaging] = useState(false);
  const mobile = useIsMobile();
  // 阶段 4「我的预设」：选用时把档位复制进这门课的 customScale；下拉里按内容认出正在用哪个预设
  const { data, dispatch: appDispatch } = useApp();
  const myScales = data.myScales;
  const usingPreset =
    course.gradeScale === 'custom' ? myScales.find((s) => sameScale(s.entries, course.customScale)) : undefined;
  const scaleValue = usingPreset ? `my:${usingPreset.id}` : course.gradeScale;
  const pickScale = (value: string) => {
    if (value.startsWith('my:')) {
      const preset = myScales.find((s) => `my:${s.id}` === value);
      if (preset) dispatch({ type: 'setScale', gradeScale: 'custom', customScale: preset.entries.map(([l, m]) => [l, m]) });
      return;
    }
    const id = value as GradeScaleId;
    if (id === 'custom' && (!course.customScale?.length || usingPreset)) setEditing(usingPreset ? 'new' : 'edit');
    else dispatch({ type: 'setScale', gradeScale: id });
  };
  const saveScale = (entries: ScaleEntry[], presetName: string | null) => {
    dispatch({ type: 'setScale', gradeScale: 'custom', customScale: entries });
    if (presetName) appDispatch({ type: 'saveMyScale', name: presetName, entries });
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

  const bar = (
    <div
      className="mt-1 flex h-3.5 overflow-hidden rounded-[7px] bg-assume-tint mobile:mt-0 mobile:h-3 mobile:rounded-md"
      role="img"
      aria-label={segments.map((s) => `${s.label} ${s.value}`).join('，') + `，余量 ${f(b.slack)}`}
    >
      {segments.map((s) => (
        <div key={s.key} className={`${s.color} transition-[width] duration-150`} style={{ width: pct(s.width) }} />
      ))}
    </div>
  );

  const legend = (
    <div className="flex flex-wrap gap-x-[18px] gap-y-1.5 text-xs text-muted mobile:gap-x-3 mobile:gap-y-1 mobile:text-[11px]">
      {segments.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-[3px] ${s.color} mobile:h-2 mobile:w-2 mobile:rounded-[2px]`} />
          {s.label} {s.value}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="box-border h-2.5 w-2.5 rounded-[3px] border border-assume-edge bg-assume-tint mobile:h-2 mobile:w-2 mobile:rounded-[2px]" />
        余量 {f(b.slack)}
      </span>
    </div>
  );

  const targetInputs = (
    <span className="flex items-center gap-2">
      <NumberInput
        id="target-num"
        value={course.target}
        onValue={setTarget}
        min={0}
        max={100}
        step="any"
        className={`${field.base} ${field.solid} w-[72px] text-right text-xl font-bold mobile:h-10 mobile:w-16 mobile:text-lg`}
      />
      <select
        value={gradeValue}
        onChange={(e) => {
          const hit = scale.find(([l]) => l === e.target.value);
          if (hit) setTarget(hit[1]);
        }}
        aria-label="按等级设目标"
        title="选等级，目标设为该等级的下限"
        className="h-[34px] rounded-lg border border-edge bg-white px-2 text-[13px] font-semibold text-ink mobile:h-10"
      >
        {!exact && <option value="" disabled>{r.targetGrade ? `≈ ${r.targetGrade}` : '等级'}</option>}
        {scale.map(([l, m]) => (
          <option key={l} value={l}>{l} · ≥{trim1(m)}</option>
        ))}
      </select>
    </span>
  );

  const slider = (
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
  );

  const scaleRow = (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor="scale" className="shrink-0 text-[13px] text-muted">等级表</label>
      <span className="flex min-w-0 items-center gap-2">
        {myScales.length > 0 && (
          <button
            type="button"
            onClick={() => setManaging(true)}
            title="改名或删除我的预设"
            className={`${btn.base} ${btn.outline} h-[34px]! shrink-0 px-2.5! text-[13px] mobile:h-10!`}
          >
            管理预设
          </button>
        )}
        {course.gradeScale === 'custom' && (
          <button type="button" onClick={() => setEditing('edit')} className={`${btn.base} ${btn.outline} h-[34px]! shrink-0 px-2.5! text-[13px] mobile:h-10!`}>
            编辑
          </button>
        )}
        <select
          id="scale"
          value={scaleValue}
          onChange={(e) => pickScale(e.target.value)}
          className="h-[34px] max-w-[220px] min-w-0 rounded-lg border border-edge bg-white px-2.5 text-[13px] text-ink mobile:h-10"
        >
          {SCALE_OPTIONS.filter((o) => o.id !== 'custom').map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
          {myScales.length > 0 && (
            <optgroup label="我的预设">
              {myScales.map((s) => (
                <option key={s.id} value={`my:${s.id}`}>{s.name}</option>
              ))}
            </optgroup>
          )}
          <option value="custom">
            {course.customScale?.length && !usingPreset ? '自定义（本课）' : '自定义…'}
          </option>
        </select>
      </span>
    </div>
  );

  const scaleSummary = (
    <div className="-mt-1 text-right text-xs text-muted mobile:mt-0 mobile:text-[11px]" data-testid="scale-summary">
      {scale.slice(0, 6).map(([l, m]) => `${l} ≥${trim1(m)}`).join(' · ')}
      {scale.length > 6 ? ' …' : ''}
    </div>
  );

  const dialogs = (
    <>
      {editing && (
        <ScaleEditor
          initial={course.customScale?.length ? course.customScale : scale}
          onSave={saveScale}
          onCancel={() => setEditing(false)}
          presetNames={myScales.map((s) => s.name)}
          defaultPresetName={editing === 'edit' ? usingPreset?.name ?? '' : ''}
        />
      )}
      {managing && <MyScalesDialog onClose={() => setManaging(false)} />}
    </>
  );

  // 手机端：大数字 + 等级在左、含假设预估在右；进度条；图例换行；目标数字 + 滑块；等级表一行
  if (mobile) {
    return (
      <section className="flex flex-col gap-3 rounded-[14px] border border-edge bg-white p-4" data-testid="overview">
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-medium text-muted">当前成绩</span>
            <div className="flex items-baseline gap-2">
              <span className="text-[44px] leading-none font-extrabold tracking-[-0.03em]" data-testid="current">
                {r.current === null ? '—' : f(r.current)}
              </span>
              {r.currentGrade && (
                <span className="rounded-full bg-chip px-2 py-0.5 text-sm font-bold text-chip-ink">{r.currentGrade}</span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-xs font-medium text-muted">含假设预估</span>
            <span className="text-[22px] leading-none font-bold text-assume-dark">
              <span data-testid="projected">{r.projected === null ? '—' : f(r.projected)}</span>
              {r.projectedGrade && <span className="text-[13px] font-semibold text-muted"> · {r.projectedGrade}</span>}
            </span>
          </div>
        </div>
        {bar}
        {legend}
        <div className="flex flex-col gap-0.5 border-t border-divide pt-2.5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="target-num" className="text-xs font-medium text-muted">目标分数</label>
            {targetInputs}
          </div>
          {slider}
          {scaleRow}
          {scaleSummary}
        </div>
        {dialogs}
      </section>
    );
  }

  return (
    <section className="flex flex-wrap gap-8 rounded-[14px] border border-edge bg-white px-7 py-6" data-testid="overview">
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
        {bar}
        {legend}
      </div>

      {/* 右：目标、等级表、状态 */}
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3 border-edge lg:border-l lg:pl-8">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="target-num" className="text-[13px] font-medium text-muted">目标分数</label>
          {targetInputs}
        </div>
        {slider}
        {scaleRow}
        {scaleSummary}
        <div className="mt-1 flex items-start gap-2.5">
          <Pill className={tone.pill}>{r.statusLabel}</Pill>
          <span className="pt-0.5 text-[13px] leading-snug text-ink">{r.conclusion}</span>
        </div>
      </div>
      {dialogs}
    </section>
  );
}

/** 手机端：状态 + 结论句做成一条绿色 / 红色横条（画板 Mobile） */
export function StatusBar() {
  const { result: r } = useCourse();
  const good = r.status === 'reachable' || r.status === 'secured' || r.status === 'met';
  const bad = r.status === 'unreachable' || r.status === 'notMet';
  const box = good ? 'bg-ok-tint' : bad ? 'bg-bad-tint' : 'bg-chip';
  const ink = good ? 'text-[#14532d] ' : bad ? 'text-[#7a1a12]' : 'text-ink';
  const chip = good ? 'text-ok' : bad ? 'text-bad' : 'text-chip-ink';
  return (
    <section role="status" className={`flex items-start gap-2.5 rounded-[12px] px-3.5 py-3 ${box}`} data-testid="status-bar">
      <span className={`shrink-0 rounded-full bg-white px-2 py-[3px] text-[11px] font-bold ${chip}`}>{r.statusLabel}</span>
      <span className={`min-w-0 text-sm leading-snug font-semibold ${ink}`} data-testid="conclusion">{r.conclusion}</span>
    </section>
  );
}
