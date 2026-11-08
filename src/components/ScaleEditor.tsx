// 自定义等级表编辑器（方案 §2.4，阶段 3）：改每档名称和下限、增删档位，保存为课程的 customScale。
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
  initial, onSave, onCancel,
}: { initial: ScaleEntry[]; onSave: (entries: ScaleEntry[]) => void; onCancel: () => void }) {
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
  const { errors, entries: sorted } = checkScale(entries);
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
            onClick={() => onSave(sorted)}
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
