// 手机端判断（阶段 5）：视口 ≤ 640px 时切到手机布局。和 index.css 里的 `mobile:` 变体用同一个断点。
import { useSyncExternalStore } from 'react';

export const MOBILE_QUERY = '(max-width: 640px)';

function subscribe(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

const snapshot = () => typeof window !== 'undefined' && !!window.matchMedia?.(MOBILE_QUERY).matches;

/** 同一套组件按这个值切换布局，不复制组件 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
