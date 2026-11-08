import { formatScore as f } from '../lib/grade';
import { useCourse } from '../state/CourseContext';
import { hasAssumptions } from '../state/courseReducer';
import { useIsMobile } from '../hooks/useIsMobile';
import { btn, feasibilityTone, Pill, trim1 } from './ui';

export function Conclusion() {
  const { course, result: r, dispatch } = useCourse();
  const tone = feasibilityTone(r.status);
  const anyAssumed = hasAssumptions(course);
  const mobile = useIsMobile();
  const decidedWeight = 100 - r.remainingWeight;

  const cards = [
    { label: '已锁定', value: f(r.locked + r.bonusPoints), note: `${trim1(decidedWeight)}% 权重已出分或假设 · 含 Bonus` },
    { label: '最低可能', value: f(r.minPossible), note: '剩余全部 0 分' },
    { label: '最高可能', value: f(r.maxPossible), grade: r.maxGrade, note: '剩余全部满分' },
  ];

  const numbers = (
    <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4 mobile:gap-2.5" data-testid="four-numbers">
      {cards.map((c) => (
        <div key={c.label} className="flex flex-col gap-1 rounded-[10px] bg-page px-4 py-3.5 mobile:px-3 mobile:py-3">
          <span className="text-xs text-muted">{c.label}</span>
          <span className="text-[22px] font-bold mobile:text-xl">
            {c.value}
            {c.grade && <span className="text-[13px] font-medium text-muted"> · {c.grade}</span>}
          </span>
          <span className="text-xs text-muted">{c.note}</span>
        </div>
      ))}
      <div className="flex flex-col gap-1 rounded-[10px] bg-assume-tint px-4 py-3.5 text-assume-dark mobile:px-3 mobile:py-3">
        <span className="text-xs">距目标还需</span>
        <span className="text-[22px] font-bold mobile:text-xl">
          {f(r.gap)} <span className="text-[13px] font-medium">分</span>
        </span>
        <span className="text-xs">剩余权重 {trim1(r.remainingWeight)} 分</span>
      </div>
    </div>
  );

  // 手机端：状态和结论句已在顶部横条，「清空假设」在底部固定栏，这里只放四个数字
  if (mobile) {
    return (
      <section className="flex flex-col gap-3 rounded-[14px] border border-edge bg-white p-4">
        <span className="text-[13px] font-semibold text-ink">成绩区间</span>
        {numbers}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-[18px] rounded-[14px] border border-edge bg-white px-7 py-[22px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-1.5">
          <span className="flex items-center gap-2 text-[13px] font-medium text-muted">
            结论 <Pill className={tone.pill}>{r.statusLabel}</Pill>
          </span>
          <span className="text-xl leading-snug font-bold" data-testid="conclusion">{r.conclusion}</span>
        </div>
        <button
          type="button"
          onClick={() => dispatch({ type: 'clearAllAssumptions' })}
          disabled={!anyAssumed}
          className={`${btn.base} ${btn.outline}`}
        >
          清除全部假设
        </button>
      </div>

      {numbers}
    </section>
  );
}
