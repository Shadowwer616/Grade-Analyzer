// 自定义等级表编辑器（方案 §2.4，阶段 3）：改每档名称和下限、增删档位，保存为课程的 customScale。
// 阶段 4：可勾选「存为我的预设」，同时存进 myScales，所有课程都能选。
import { useEffect, useRef, useState } from 'react';
import type { ScaleEntry } from '../types';
import { checkScale } from '../lib/scales';
import { btn, field, IconClose, IconPlus, IconTrash, NumberInput } from './ui';

interface Row {
  key: number;
  label: string;
  min: number | null;
}

export function ScaleEditor({
  initial, onSave, onCancel, presetNames = [], defaultPresetName = '',
}: {
  initial: ScaleEntry[];
  /** presetName 非 null = 勾了「存为我的预设」 */
  onSave: (entries: ScaleEntry[], presetName: string | null) => void;
  onCancel: () => void;
  /** 已有的「我的预设」名字，同名时提示会覆盖 */
  presetNames?: string[];
  /** 正在编辑的表本来就是某个预设时，默认勾上并填它的名字 */
  defaultPresetName?: string;
}) {
  const [asPreset, setAsPreset] = useState(defaultPresetName !== '');
  const [presetName, setPresetName] = useState(defaultPresetName || '我的等级表');
  const presetTrim = presetName.trim();
  const nextKey = useRef(0);
  const [rows, setRows] = useState<Row[]>(() =>
    [...initial].sort((a, b) => b[1] - a[1]).map(([label, min]) => ({ key: nextKey.current++, label, min })),
  );
  const firstInput = useRef<HTMLInputElement>(null);

  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useEffect(() => {
    firstInput.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancelRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const entries: ScaleEntry[] = rows.map((r) => [r.label, r.min ?? NaN]);
  const { errors: scaleErrors, entries: sorted } = checkScale(entries);
  const errors = asPreset && !presetTrim ? [...scaleErrors, '预设名不能为空'] : scaleErrors;
  const lowest = sorted[sorted.length - 1];

  const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const add = () => {
    // 新档放在最低一档下面，下限取最低一档 − 10（不小于 0）
    const lo = Math.max(0, Math.min(...rows.map((r) => r.min ?? 0)) - 10);
    setRows((rs) => [...rs, { key: nextKey.current++, label: '', min: lo }]);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scale-editor-title"
        className="flex max-h-[90vh] w-full max-w-[440px] flex-col gap-4 overflow-hidden rounded-[14px] bg-white px-6 py-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="scale-editor-title" className="text-base font-bold">自定义等级表</h2>
          <button type="button" onClick={onCancel} aria-label="关闭" className={btn.icon}><IconClose /></button>
        </div>
        <p className="-mt-2 text-xs text-muted">每档填等级名和下限分数（含），保存时按下限从高到低排序。</p>

        <div className="flex flex-col gap-2 overflow-y-auto">
          <div className="grid grid-cols-[1fr_96px_34px] gap-2 text-xs font-semibold text-muted">
            <span>等级</span><span>下限 ≥</span><span className="sr-only">删除</span>
          </div>
          {rows.map((r, i) => (
            <div key={r.key} className="grid grid-cols-[1fr_96px_34px] items-center gap-2">
              <input
                ref={i === 0 ? firstInput : undefined}
                value={r.label}
                onChange={(e) => patch(r.key, { label: e.target.value })}
                placeholder="如 A"
                aria-label={`第 ${i + 1} 档等级名`}
                className={`${field.base} ${field.solid}`}
              />
              <NumberInput
                value={r.min}
                onValue={(v) => patch(r.key, { min: v })}
                allowEmpty
                min={0}
                max={100}
                step="any"
                aria-label={`第 ${i + 1} 档下限`}
                className={`${field.base} ${field.solid} text-right`}
              />
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                disabled={rows.length <= 1}
                aria-label={`删除第 ${i + 1} 档`}
                className={`${btn.icon} border-transparent bg-transparent hover:border-bad-tint hover:bg-bad-tint hover:text-bad disabled:opacity-40`}
              >
                <IconTrash />
              </button>
            </div>
          ))}
          <button type="button" onClick={add} className={`${btn.base} ${btn.outline} self-start`}>
            <IconPlus />添加一档
          </button>
        </div>

        <div className="flex flex-col gap-2 rounded-[10px] bg-page px-3.5 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={asPreset} onChange={(e) => setAsPreset(e.target.checked)} className="accent-assume" />
            存为我的预设
            <span className="text-xs text-muted">所有课程的等级表下拉里都能选</span>
          </label>
          {asPreset && (
            <div className="flex flex-col gap-1">
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                maxLength={40}
                aria-label="预设名称"
                className={`${field.base} ${field.solid}`}
              />
              {presetNames.includes(presetTrim) && (
                <span className="text-xs text-bonus-dark">会更新已有的预设「{presetTrim}」；已经用它的课程不受影响</span>
              )}
            </div>
          )}
        </div>

        <div className="min-h-[18px] text-xs" aria-live="polite">
          {errors.length > 0 ? (
            <span className="text-bad">{errors.join('；')}</span>
          ) : lowest && lowest[1] > 0 ? (
            <span className="text-bonus-dark">低于 {lowest[1]} 分时没有等级，显示「—」</span>
          ) : null}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={`${btn.base} ${btn.outline}`}>取消</button>
          <button
            type="button"
            onClick={() => onSave(sorted, asPreset ? presetTrim : null)}
            disabled={errors.length > 0}
            className={`${btn.base} ${btn.primary}`}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
