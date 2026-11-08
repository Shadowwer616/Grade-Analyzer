// 「高级」面板（方案 §2.2、§2.3，阶段 3）：普通行下方展开。
// 期末行多一个「可替代」下拉；所有行都可以开启「多次子项」。
import { useState } from 'react';
import type { AdvancedConfig, GradeItem } from '../types';
import { formatScore as f, isFinalItem, replaceOptions, type CourseResult, type ItemResult } from '../lib/grade';
import {
  applyPastedScores,
  assumeAllRemaining,
  createAdvanced,
  isPerSlotMax,
  maxAt,
  parseScoreList,
  percentToRaw,
  resizeAdvanced,
  setDropLowest,
  setMaxEach,
  setPerSlotMax,
  setSubAssumed,
  setSubScore,
} from '../lib/advanced';
import { useCourse } from '../state/CourseContext';
import { btn, field, IconClose, IconPen, NumberInput, trim1 } from './ui';

/** 显示原始分：9 → "9"，9.5 → "9.5"，9.47 → "9.5" */
const raw1 = trim1;
/** 「假设」默认值：向上取到 0.1，限 0–满分 */
const ceil1 = (v: number, max: number) => Math.min(max, Math.max(0, Math.ceil(v * 10 - 1e-9) / 10));

export function AdvancedPanel({ item, res, r }: { item: GradeItem; res: ItemResult; r: CourseResult }) {
  const { dispatch } = useCourse();
  const setAdvanced = (advanced: AdvancedConfig | null) =>
    dispatch({ type: 'updateItem', id: item.id, patch: { advanced } });
  const enabled = !!item.advanced && item.advanced.count > 0;

  return (
    <div
      id={`adv-${item.id}`}
      className={`border-t border-divide px-6 pt-1 pb-4 ${res.status === 'assumed' ? 'bg-assume-row' : 'bg-head'}`}
    >
      <div className="flex flex-col gap-4 rounded-xl border border-edge bg-white px-5 py-4">
        {isFinalItem(item) && <ReplaceSection item={item} r={r} />}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-ink">多次子项</span>
            <span className="text-xs text-muted">
              这一项由多次小成绩组成（作业、小测、实验…），按次录入，可去掉最低几次
            </span>
          </div>
          <Switch
            checked={enabled}
            label="按多次子项计分"
            onChange={(on) => setAdvanced(on ? createAdvanced() : null)}
          />
        </div>

        {enabled && item.advanced && <SubItems item={item} adv={item.advanced} res={res} r={r} onChange={setAdvanced} />}
      </div>
    </div>
  );
}

// ───────────────────────── 期末替代 ─────────────────────────

function ReplaceSection({ item, r }: { item: GradeItem; r: CourseResult }) {
  const { course, dispatch } = useCourse();
  const options = replaceOptions(course, item.id);
  const rep = r.replacement?.finalId === item.id ? r.replacement : null;
  const tName = rep?.targetId ? course.items.find((i) => i.id === rep.targetId)?.name ?? '' : '';

  let hint = '期末百分比高于被替代项时，被替代项按期末计；当前、预估、反推都取更有利的算法';
  let hintTone = 'text-muted';
  if (rep && item.replaces) {
    if (rep.active) {
      hintTone = 'text-ok';
      hint =
        rep.requiredWith !== null && rep.requiredWithout !== null
          ? `替代${tName}生效：期末只需 ${f(rep.requiredWith)} 而不是 ${f(rep.requiredWithout)}`
          : `替代${tName}生效，按更高的期末分计算`;
    } else {
      hint = tName ? `替代${tName}暂不生效：不替代时结果一样或更好` : '暂不生效：还没有可替代的项';
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divide pb-4">
      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-0.5">
        <label htmlFor={`rep-${item.id}`} className="text-sm font-semibold text-ink">可替代</label>
        <span className={`text-xs ${hintTone}`} data-testid="replace-hint">{hint}</span>
      </div>
      <select
        id={`rep-${item.id}`}
        value={item.replaces ?? ''}
        onChange={(e) => dispatch({ type: 'updateItem', id: item.id, patch: { replaces: e.target.value || null } })}
        className="h-[34px] max-w-[320px] rounded-lg border border-edge bg-white px-2.5 text-[13px] text-ink"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ───────────────────────── 子项 ─────────────────────────

function SubItems({
  item, adv, res, r, onChange,
}: { item: GradeItem; adv: AdvancedConfig; res: ItemResult; r: CourseResult; onChange: (a: AdvancedConfig) => void }) {
  const sub = res.sub;
  const perSlot = isPerSlotMax(adv);
  const req = res.subRequired;
  const label = item.name || '未命名';

  // 「剩余全部假设为 X」：统一满分时 X 是原始分，逐次满分时 X 是百分比
  const defaultAll = req ? (perSlot ? Math.ceil(req.percent) : ceil1(req.percent / 100 * maxAt(adv, 0), maxAt(adv, 0))) : perSlot ? Math.round(r.target) : raw1(r.target / 100 * maxAt(adv, 0));
  const [allX, setAllX] = useState<number | null>(null);
  const xAll = allX ?? Number(defaultAll);
  const xAllMax = perSlot ? 100 : maxAt(adv, 0);

  const [paste, setPaste] = useState('');
  const [pasteMsg, setPasteMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const doPaste = () => {
    const { values, invalid } = parseScoreList(paste);
    if (values.length === 0) {
      setPasteMsg({ text: '没认出数字，试试「9, 8.5, 10, 7」', bad: true });
      return;
    }
    onChange(applyPastedScores(adv, values));
    setPaste('');
    setPasteMsg({
      text: `已填入 ${values.length} 次${values.length > adv.count ? `，次数加到 ${values.length}` : ''}${invalid.length ? `；忽略了 ${invalid.join('、')}` : ''}`,
      bad: invalid.length > 0,
    });
  };

  const pendingCount = sub ? sub.pending.length + sub.assumed.length : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* 次数 / 每次满分 / 去掉最低 K 次 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px] text-ink">
        <label className="flex items-center gap-2">
          次数
          <NumberInput
            value={adv.count}
            onValue={(v) => v !== null && v >= 1 && onChange(resizeAdvanced(adv, v))}
            min={1}
            step={1}
            aria-label={`${label}子项次数`}
            className={`${field.base} ${field.solid} w-14`}
          />
        </label>
        <div className="flex items-center gap-2">
          每次满分
          <div className="inline-flex rounded-lg border border-edge p-0.5" role="group" aria-label="每次满分的填法">
            {[
              { v: false, t: '统一' },
              { v: true, t: '逐次填' },
            ].map((o) => (
              <button
                key={o.t}
                type="button"
                aria-pressed={perSlot === o.v}
                onClick={() => onChange(setPerSlotMax(adv, o.v))}
                className={`h-7 cursor-pointer rounded-md px-2.5 text-xs font-semibold ${
                  perSlot === o.v ? 'bg-ink text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {o.t}
              </button>
            ))}
          </div>
          {!perSlot && (
            <NumberInput
              value={adv.maxEach as number}
              onValue={(v) => v !== null && onChange(setMaxEach(adv, v))}
              min={0}
              step="any"
              aria-label={`${label}每次满分`}
              className={`${field.base} ${field.solid} w-14`}
            />
          )}
        </div>
        <label className="flex items-center gap-2">
          去掉最低
          <NumberInput
            value={adv.dropLowest}
            onValue={(v) => v !== null && onChange(setDropLowest(adv, v))}
            min={0}
            max={adv.count - 1}
            step={1}
            aria-label={`${label}去掉最低几次`}
            className={`${field.base} ${field.solid} w-12`}
          />
          次
        </label>
      </div>

      {/* 每次得分 */}
      <div className="flex flex-wrap gap-2" role="list" aria-label={`${label}每次得分`}>
        {Array.from({ length: adv.count }, (_, j) => (
          <SubCell key={j} j={j} adv={adv} res={res} r={r} label={label} onChange={onChange} />
        ))}
      </div>

      {/* 汇总 + 每次至少 */}
      {sub && <SubSummary adv={adv} res={res} />}

      {/* 剩余全部假设 + 粘贴录入 */}
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3 border-t border-divide pt-4 text-[13px]">
        <div className="flex items-center gap-2">
          <span className="text-ink">剩余全部假设为</span>
          <NumberInput
            value={xAll}
            onValue={(v) => setAllX(v)}
            min={0}
            max={xAllMax}
            step="any"
            aria-label="剩余全部假设为"
            className={`${field.base} w-16 border-assume bg-white font-bold text-assume-dark`}
          />
          <span className="text-muted">{perSlot ? '%' : `分 / ${raw1(maxAt(adv, 0))}`}</span>
          <button
            type="button"
            disabled={pendingCount === 0}
            onClick={() => onChange(assumeAllRemaining(adv, Math.min(xAllMax, Math.max(0, xAll)), perSlot ? 'percent' : 'raw'))}
            className={`${btn.base} h-8! border border-dashed border-assume bg-white text-[13px] font-semibold text-assume-dark hover:bg-assume-tint`}
          >
            <IconPen />应用
          </button>
        </div>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
          <div className="flex items-center gap-2">
            <input
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doPaste()}
              placeholder="粘贴成绩：9, 8.5, 10, 7（- 表示还没出分）"
              aria-label="粘贴一串成绩"
              className={`${field.base} ${field.solid} min-w-0 flex-1`}
            />
            <button type="button" onClick={doPaste} disabled={!paste.trim()} className={`${btn.base} ${btn.outline} h-8!`}>
              填入
            </button>
          </div>
          <span className={`text-xs ${pasteMsg?.bad ? 'text-bad' : 'text-muted'}`} aria-live="polite">
            {pasteMsg?.text ?? '从第 1 次起依次填入，后面没粘到的已得分会清空'}
          </span>
        </div>
      </div>
    </div>
  );
}

function SubCell({
  j, adv, res, r, label, onChange,
}: { j: number; adv: AdvancedConfig; res: ItemResult; r: CourseResult; label: string; onChange: (a: AdvancedConfig) => void }) {
  const sub = res.sub;
  const m = maxAt(adv, j);
  const score = adv.scores[j] ?? null;
  const assumed = adv.assumed[j] ?? null;
  const dropped = sub?.dropped.includes(j) ?? false;
  const over = score !== null && score > m;
  const need = res.subRequired?.each[j] ?? null;
  const n = j + 1;

  const startAssume = () => {
    const base = need !== null ? need : percentToRaw(adv, j, r.target);
    onChange(setSubAssumed(adv, j, ceil1(base, m)));
  };

  const tone =
    score !== null ? (dropped ? 'border-edge bg-page' : 'border-edge bg-white')
    : assumed !== null ? 'border-assume-edge bg-assume-row'
    : 'border-dashed border-dash bg-white';

  return (
    <div role="listitem" className={`flex w-[92px] flex-col gap-1.5 rounded-lg border p-2 ${tone}`} data-testid={`sub-${j}`}>
      <span className="flex items-center justify-between text-[11px] text-muted">
        <span>第 {n} 次</span>
        {dropped && <span className="font-semibold text-chip-ink" title="按「去掉最低」不计入">去掉</span>}
      </span>
      <div className="flex items-center gap-1">
        <NumberInput
          value={score}
          onValue={(v) => onChange(setSubScore(adv, j, v))}
          allowEmpty
          min={0}
          step="any"
          placeholder="—"
          aria-label={`${label}第 ${n} 次得分`}
          aria-invalid={over}
          title={over ? `超过满分 ${raw1(m)}` : undefined}
          className={`${field.base} h-[30px]! w-full px-1.5 text-center ${
            over ? 'border-bad text-bad' : score !== null ? `border-edge bg-white font-semibold ${dropped ? 'text-muted line-through' : ''}` : 'border-dash bg-transparent'
          }`}
        />
      </div>
      {isPerSlotMax(adv) ? (
        <label className="flex items-center gap-1 text-[11px] text-muted">
          满分
          <NumberInput
            value={m}
            onValue={(v) => v !== null && onChange(setMaxEach(adv, v, j))}
            min={0}
            step="any"
            aria-label={`${label}第 ${n} 次满分`}
            className={`${field.base} h-6! w-full px-1 text-center text-xs ${field.solid}`}
          />
        </label>
      ) : (
        <span className="text-center text-[11px] text-muted">/ {raw1(m)}</span>
      )}
      {score === null &&
        (assumed !== null ? (
          <div className="flex items-center gap-1">
            <NumberInput
              value={assumed}
              onValue={(v) => v !== null && onChange(setSubAssumed(adv, j, v))}
              min={0}
              max={m}
              step="any"
              aria-label={`${label}第 ${n} 次假设分`}
              className={`${field.base} h-[26px]! w-full px-1 text-center text-xs font-bold border-assume bg-white text-assume-dark`}
            />
            <button
              type="button"
              onClick={() => onChange(setSubAssumed(adv, j, null))}
              aria-label={`清除${label}第 ${n} 次的假设`}
              title="清除假设"
              className="inline-flex h-[26px] w-[22px] shrink-0 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-page hover:text-ink"
            >
              <IconClose size={12} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startAssume}
            aria-label={`假设${label}第 ${n} 次`}
            title={need !== null ? `默认填至少需要的 ${raw1(Math.max(0, need))} 分` : undefined}
            className="inline-flex h-[26px] cursor-pointer items-center justify-center gap-1 rounded-md border border-dashed border-assume bg-white text-[11px] font-semibold text-assume-dark hover:bg-assume-tint"
          >
            <IconPen size={11} />假设
          </button>
        ))}
    </div>
  );
}

function SubSummary({ adv, res }: { adv: AdvancedConfig; res: ItemResult }) {
  const sub = res.sub!;
  const req = res.subRequired;
  const perSlot = isPerSlotMax(adv);
  const parts: string[] = [];

  if (sub.currentPercent !== null) {
    parts.push(
      sub.status === 'completed'
        ? `这一项 ${f(sub.currentPercent)}%`
        : `已完成部分 ${f(sub.currentPercent)}%（${raw1(sub.keptScore)} / ${raw1(sub.keptMax)}）`,
    );
  }
  if (sub.status === 'assumed' && sub.percent !== null) parts.push(`含假设 ${f(sub.percent)}%`);
  if (sub.dropApplied) {
    parts.push(`已去掉第 ${sub.dropped.map((j) => j + 1).join('、')} 次`);
  }

  let need: { text: string; tone: string } | null = null;
  if (req && res.required !== null) {
    const r = sub.pending.length;
    const each = sub.pending.map((j) => req.each[j] as number);
    if (req.percent > 100 + 0.05) {
      need = { text: `剩余 ${r} 次全拿满分也到不了 ${f(res.required)}%`, tone: 'text-bad' };
    } else if (req.percent <= 0) {
      need = { text: `剩余 ${r} 次 0 分也够 ${f(Math.max(0, res.required))}%`, tone: 'text-ok' };
    } else if (!perSlot || new Set(sub.pending.map((j) => maxAt(adv, j))).size === 1) {
      need = {
        text: `这一项要 ${f(res.required)}%，剩余 ${r} 次每次至少 ${f(each[0])} 分（满分 ${raw1(maxAt(adv, sub.pending[0]))}）`,
        tone: 'text-ok',
      };
    } else {
      need = { text: `这一项要 ${f(res.required)}%，剩余 ${r} 次每次至少拿到满分的 ${f(req.percent)}%`, tone: 'text-ok' };
    }
  }

  return (
    <div className="flex flex-col gap-1.5 text-[13px]">
      {parts.length > 0 && <span className="text-muted">{parts.join(' · ')}</span>}
      {sub.dropWaiting && (
        <span className="text-bonus-dark" data-testid="drop-waiting">
          已完成 {sub.completed.length} 次 ≤ 去掉的 {sub.dropLowest} 次，「去掉最低」成绩再多些后生效
        </span>
      )}
      {need && (
        <span className={`font-semibold ${need.tone}`} data-testid="sub-need">{need.text}</span>
      )}
    </div>
  );
}

// ───────────────────────── 开关 ─────────────────────────

function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-ink">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 cursor-pointer rounded-full transition-colors ${checked ? 'bg-assume' : 'bg-line'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`}
        />
      </button>
    </label>
  );
}
