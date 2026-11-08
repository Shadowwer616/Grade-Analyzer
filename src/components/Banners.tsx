// 阶段 4 的提示条：权重合计 ≠ 100%（方案 §2.1），以及导入 / 存储相关的一次性通知。
import { useApp, useCourse } from '../state/CourseContext';
import { btn, IconClose, trim1 } from './ui';

/** 评分表上方的黄色提示条；复用 computeCourse 的 weightsOk / weightTotal */
export function WeightBanner() {
  const { course, result: r, dispatch } = useCourse();
  if (r.weightsOk || course.items.length === 0) return null;
  const canNormalize = r.weightTotal > 0;

  return (
    <div
      role="status"
      data-testid="weight-banner"
      className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-bonus-edge bg-bonus-tint px-5 py-3"
    >
      <span className="text-sm text-bonus-dark">
        <strong>权重合计 {trim1(r.weightTotal)}%，应为 100%。</strong>
        <span className="ml-1.5 text-xs">
          {canNormalize ? '计算时已按比例折算；可一键把各项权重改成合计 100%。' : '先给评分项填上权重。'}
        </span>
      </span>
      <button
        type="button"
        onClick={() => dispatch({ type: 'normalizeWeights' })}
        disabled={!canNormalize}
        className={`${btn.base} border border-bonus-edge bg-white font-semibold text-bonus-dark hover:bg-bonus-row`}
      >
        按比例归一化
      </button>
    </div>
  );
}

export function NoticeBar() {
  const { notice, setNotice } = useApp();
  if (!notice) return null;
  const tone = notice.tone === 'error' ? 'border-bad/30 bg-bad-tint text-bad' : 'border-assume-edge bg-assume-tint text-assume-dark';
  return (
    <div role={notice.tone === 'error' ? 'alert' : 'status'} data-testid="notice" className={`flex items-center justify-between gap-3 rounded-[12px] border px-5 py-2.5 text-sm ${tone}`}>
      <span>{notice.text}</span>
      <button type="button" onClick={() => setNotice(null)} aria-label="关闭提示" className={`${btn.icon} h-7! w-7! border-transparent bg-transparent`}>
        <IconClose size={12} />
      </button>
    </div>
  );
}
