// 通用弹窗外壳（阶段 4）：遮罩、标题 + 关闭按钮；Esc 或点遮罩关闭。
// 阶段 5：手机端（≤ 640px）变成底部抽屉：贴底、全宽、上圆角、顶部有把手、避开底部安全区。
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { btn, IconClose } from './ui';

export function Modal({
  title, onClose, children, width = 440, testId,
}: { title: string; onClose: () => void; children: ReactNode; width?: number; testId?: string }) {
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 叠了两层弹窗（如预设管理里的删除确认）时只关最上面一层
      if (e.key !== 'Escape') return;
      const dialogs = document.querySelectorAll('[data-modal]');
      if (dialogs[dialogs.length - 1] === box.current) closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    // 没有自动聚焦的输入框时，把焦点放进弹窗，方便键盘操作
    if (!box.current?.contains(document.activeElement)) box.current?.focus({ preventScroll: true });
    // 弹窗开着时背后的页面不滚动（手机上尤其明显）
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  // 挂到 body 上：不受顶栏（sticky）等祖先层叠上下文影响，总是盖在底部固定栏上面
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 mobile:items-end mobile:px-0"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={box}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-modal
        data-testid={testId}
        style={{ maxWidth: width }}
        className="sheet-in flex max-h-[90vh] w-full flex-col gap-4 overflow-y-auto overscroll-contain rounded-[14px] bg-white px-6 py-5 shadow-xl outline-none mobile:max-h-[88dvh] mobile:max-w-none! mobile:rounded-t-[18px] mobile:rounded-b-none mobile:px-4 mobile:pt-2 mobile:pb-[max(20px,env(safe-area-inset-bottom))]"
      >
        <span aria-hidden className="mx-auto hidden h-1 w-10 shrink-0 rounded-full bg-line mobile:block" />
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="m-0 min-w-0 truncate text-base font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="关闭" className={`${btn.icon} mobile:h-11 mobile:w-11`}>
            <IconClose />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** 弹窗底部按钮排：桌面靠右；手机端撑满、主按钮在右 */
export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-2 mobile:[&>*]:h-11 mobile:[&>*]:flex-1">{children}</div>;
}
