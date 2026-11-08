// 共用小部件：图标、数字框、标签、按钮样式、状态配色。
import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import type { Feasibility } from '../lib/grade';

// ── 图标（和画板同一套线性图标） ──

const svgProps = {
  'aria-hidden': true,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export const IconPlus = ({ size = 14 }: { size?: number }) => (
  <svg {...svgProps} width={size} height={size} strokeWidth={2.4}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconClose = ({ size = 14 }: { size?: number }) => (
  <svg {...svgProps} width={size} height={size} strokeWidth={2.4}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const IconTrash = ({ size = 14 }: { size?: number }) => (
  <svg {...svgProps} width={size} height={size} strokeWidth={2.2}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);
export const IconPen = ({ size = 13 }: { size?: number }) => (
  <svg {...svgProps} width={size} height={size} strokeWidth={2.4}>
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
export const IconChevron = ({ size = 14 }: { size?: number }) => (
  <svg {...svgProps} width={size} height={size} strokeWidth={2.2}><path d="M6 9l6 6 6-6" /></svg>
);
export const IconTrend = ({ size = 18 }: { size?: number }) => (
  <svg {...svgProps} width={size} height={size} strokeWidth={2.4}><path d="M4 18 L10 10 L14 14 L20 6" /></svg>
);

// ── 数字框 ──

const toText = (v: number | null) => (v === null || !Number.isFinite(v) ? '' : String(Math.round(v * 100) / 100));
const parse = (t: string): number | null => (t.trim() === '' ? null : Number(t));

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | null;
  onValue: (v: number | null) => void;
  /** 允许清空（清空 = null，例如「已得分」留空 = 未完成）；不允许时清空后失焦恢复原值 */
  allowEmpty?: boolean;
};

/**
 * 受控数字框：本地保留正在输入的文字（「8.」「」这类中间态），每次合法输入即时回传。
 * 外部值变化（滑块、重置）时同步显示。
 */
export function NumberInput({ value, onValue, allowEmpty = false, onBlur, ...rest }: NumberInputProps) {
  const [text, setText] = useState(toText(value));

  useEffect(() => {
    setText((t) => (parse(t) === value ? t : toText(value)));
  }, [value]);

  return (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const v = parse(t);
        if (v === null ? allowEmpty : Number.isFinite(v)) onValue(v);
      }}
      onBlur={(e) => {
        const v = parse(text);
        if ((v === null && !allowEmpty) || (v !== null && !Number.isFinite(v))) setText(toText(value));
        onBlur?.(e);
      }}
    />
  );
}

// ── 标签与配色 ──

export function Pill({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

/** 可行性 → 状态标签配色（可达 / 已达成 / 达成 绿，无法达到 / 未达成 红） */
export function feasibilityTone(status: Feasibility): { pill: string; text: string } {
  switch (status) {
    case 'reachable':
    case 'secured':
    case 'met':
      return { pill: 'bg-ok-tint text-ok', text: 'text-ok' };
    case 'unreachable':
    case 'notMet':
      return { pill: 'bg-bad-tint text-bad', text: 'text-bad' };
    default:
      return { pill: 'bg-chip text-chip-ink', text: 'text-ink' };
  }
}

export const btn = {
  base: 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50',
  outline: 'border border-edge bg-white font-medium text-ink hover:bg-page',
  primary: 'bg-ink font-semibold text-white hover:bg-ink/85',
  icon: 'inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-edge bg-white text-muted cursor-pointer hover:bg-page hover:text-ink',
};

export const field = {
  base: 'h-[34px] rounded-lg border px-2 text-sm text-ink outline-none focus:border-assume focus:ring-2 focus:ring-assume/15',
  solid: 'border-edge bg-white',
};

/** 1.0 → "1"，92.6 → "92.6"（权重、满分这类不需要固定 1 位小数的地方） */
export const trim1 = (n: number) => String(Math.round(n * 10) / 10);

// ── 阶段 5 新增图标 ──

export const IconMenu = ({ size = 22 }: { size?: number }) => (
  <svg {...svgProps} width={size} height={size} strokeWidth={2.2}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const IconShare = ({ size = 20 }: { size?: number }) => (
  <svg {...svgProps} width={size} height={size} strokeWidth={2.2}>
    <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
  </svg>
);
export const IconArrowUp = ({ size = 14 }: { size?: number }) => (
  <svg {...svgProps} width={size} height={size} strokeWidth={2.4}><path d="M12 19V5M6 11l6-6 6 6" /></svg>
);
export const IconArrowDown = ({ size = 14 }: { size?: number }) => (
  <svg {...svgProps} width={size} height={size} strokeWidth={2.4}><path d="M12 5v14M6 13l6 6 6-6" /></svg>
);
export const IconGrip = ({ size = 14 }: { size?: number }) => (
  <svg {...svgProps} width={size} height={size} strokeWidth={3}>
    <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
  </svg>
);
export const IconChevronRight = ({ size = 16 }: { size?: number }) => (
  <svg {...svgProps} width={size} height={size} strokeWidth={2.2}><path d="M9 6l6 6-6 6" /></svg>
);

// ── 阶段 6 新增图标 ──

export const IconUpload = ({ size = 14 }: { size?: number }) => (
  <svg {...svgProps} width={size} height={size} strokeWidth={2.2}>
    <path d="M12 15V4M7 9l5-5 5 5M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" />
  </svg>
);
export const IconDoc = ({ size = 14 }: { size?: number }) => (
  <svg {...svgProps} width={size} height={size} strokeWidth={2.2}>
    <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7Z M14 3v4h4 M9 12h6M9 16h6" />
  </svg>
);
