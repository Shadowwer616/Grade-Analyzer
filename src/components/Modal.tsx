// 通用弹窗外壳（阶段 4）：遮罩、居中卡片、标题 + 关闭按钮；Esc 或点遮罩关闭。样式同 ScaleEditor。
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { btn, IconClose } from './ui';

export function Modal({
  title, onClose, children, width = 440,
}: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    // 没有自动聚焦的输入框时，把焦点放进弹窗，方便键盘操作
    if (!box.current?.contains(document.activeElement)) box.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={box}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ maxWidth: width }}
        className="flex max-h-[90vh] w-full flex-col gap-4 overflow-y-auto rounded-[14px] bg-white px-6 py-5 shadow-xl outline-none"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="m-0 text-base font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="关闭" className={btn.icon}><IconClose /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
