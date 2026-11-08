import { useCourse } from '../state/CourseContext';
import { btn, IconChevron, IconTrend } from './ui';

const LATER = '第 4 阶段加入';

export function TopBar() {
  const { course, dispatch } = useCourse();

  const reset = () => {
    if (window.confirm('重置会丢掉当前所有修改，回到示例课程。确定吗？')) dispatch({ type: 'reset' });
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-edge bg-white px-4 py-3.5 sm:px-8">
      <div className="flex flex-wrap items-center gap-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white">
          <IconTrend />
        </div>
        <span className="text-[17px] font-bold">成绩计算器</span>
        {/* 课程下拉：多课程切换在第 4 阶段，先只显示课程名 */}
        <button
          type="button"
          title={`切换课程 · ${LATER}`}
          className="flex h-9 cursor-default items-center gap-1.5 rounded-lg border border-edge bg-page px-3 text-sm font-semibold"
        >
          {course.name}
          <span className="text-muted"><IconChevron /></span>
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled title={LATER} className={`${btn.base} ${btn.outline}`}>新建课程</button>
        <button type="button" disabled title={LATER} className={`${btn.base} ${btn.outline}`}>分享链接</button>
        <button type="button" onClick={reset} className={`${btn.base} border border-edge bg-white font-medium text-muted hover:bg-page hover:text-ink`}>重置</button>
      </div>
    </header>
  );
}
