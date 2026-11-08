// 自己的确认弹窗（阶段 5），代替 window.confirm：样式统一，手机上是底部抽屉。
// 用法：const confirm = useConfirm(); if (await confirm({ title, message, confirmLabel, danger: true })) …
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Modal, ModalActions } from './Modal';
import { btn } from './ui';

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 删除、清空这类不能撤销的操作：确认按钮红色 */
  danger?: boolean;
}

type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    resolver.current?.(false);
    setPending(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const done = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <Modal title={pending.title} onClose={() => done(false)} width={400} testId="confirm-dialog">
          <div className="m-0 text-sm leading-relaxed whitespace-pre-line text-ink">{pending.message}</div>
          <ModalActions>
            <button type="button" onClick={() => done(false)} className={`${btn.base} ${btn.outline}`}>
              {pending.cancelLabel ?? '取消'}
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => done(true)}
              data-testid="confirm-ok"
              className={`${btn.base} ${pending.danger ? 'bg-bad font-semibold text-white hover:bg-bad/85' : btn.primary}`}
            >
              {pending.confirmLabel ?? '确定'}
            </button>
          </ModalActions>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm 必须在 ConfirmProvider 内使用');
  return ctx;
}
