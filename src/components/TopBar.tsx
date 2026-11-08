// 顶栏（阶段 4）：课程下拉（切换 / 新建 / 重命名 / 删除）、新建课程、分享链接、清空本课分数。
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/CourseContext';
import { NewCourseDialog, RenameDialog, ShareDialog } from './CourseDialogs';
import { btn, IconChevron, IconPen, IconPlus, IconTrash, IconTrend } from './ui';

type Dialog = 'new' | 'rename' | 'share' | null;

export function TopBar() {
  const { course, dispatch } = useApp();
  const [dialog, setDialog] = useState<Dialog>(null);

  const clearScores = () => {
    if (
      window.confirm(
        `清空「${course.name}」的所有已得分、子项分、假设和 Bonus 已得？\n评分项、权重、等级表和目标都会保留。`,
      )
    )
      dispatch({ type: 'course', action: { type: 'clearScores' } });
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-edge bg-white px-4 py-3.5 sm:px-8">
      <div className="flex min-w-0 flex-wrap items-center gap-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white">
          <IconTrend />
        </div>
        <span className="text-[17px] font-bold">成绩计算器</span>
        <CourseMenu onNew={() => setDialog('new')} onRename={() => setDialog('rename')} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setDialog('new')} className={`${btn.base} ${btn.outline}`}>新建课程</button>
        <button type="button" onClick={() => setDialog('share')} className={`${btn.base} ${btn.outline}`}>分享链接</button>
        <button
          type="button"
          onClick={clearScores}
          className={`${btn.base} border border-edge bg-white font-medium text-muted hover:bg-page hover:text-ink`}
        >
          清空本课分数
        </button>
      </div>

      {dialog === 'new' && <NewCourseDialog onClose={() => setDialog(null)} />}
      {dialog === 'rename' && <RenameDialog course={course} onClose={() => setDialog(null)} />}
      {dialog === 'share' && <ShareDialog course={course} onClose={() => setDialog(null)} />}
    </header>
  );
}

// ───────────────────────── 课程下拉 ─────────────────────────

function CourseMenu({ onNew, onRename }: { onNew: () => void; onRename: () => void }) {
  const { data, course, dispatch } = useApp();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const remove = () => {
    const last = data.courses.length === 1;
    const msg = last
      ? `删除「${course.name}」？这是最后一门课，删除后会自动建一门示例课程。`
      : `删除「${course.name}」？这门课的所有设置和分数都会删掉，不能撤销。`;
    if (window.confirm(msg)) dispatch({ type: 'deleteCourse', id: course.id });
  };

  const item = 'flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 py-2 text-left text-sm text-ink hover:bg-page';

  return (
    <div ref={wrap} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="切换课程"
        data-testid="course-menu"
        className="flex h-9 max-w-[280px] cursor-pointer items-center gap-1.5 rounded-lg border border-edge bg-page px-3 text-sm font-semibold text-ink hover:border-dash"
      >
        <span className="truncate">{course.name}</span>
        <span className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`}><IconChevron /></span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-[calc(100%+6px)] left-0 z-40 flex w-[260px] flex-col rounded-[12px] border border-edge bg-white p-1.5 shadow-lg"
        >
          <div className="px-2.5 pt-1 pb-1.5 text-xs font-semibold text-muted">我的课程 · {data.courses.length}</div>
          <div className="flex max-h-[280px] flex-col overflow-y-auto">
            {data.courses.map((c) => (
              <button
                key={c.id}
                type="button"
                role="menuitemradio"
                aria-checked={c.id === course.id}
                onClick={pick(() => dispatch({ type: 'switchCourse', id: c.id }))}
                className={`${item} ${c.id === course.id ? 'font-semibold' : ''}`}
              >
                <span className={`w-3.5 shrink-0 text-assume ${c.id === course.id ? '' : 'invisible'}`}>✓</span>
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
          <div className="my-1.5 h-px bg-divide" />
          <button type="button" role="menuitem" onClick={pick(onNew)} className={item}>
            <span className="w-3.5 shrink-0 text-muted"><IconPlus size={13} /></span>新建课程…
          </button>
          <button type="button" role="menuitem" onClick={pick(onRename)} className={item}>
            <span className="w-3.5 shrink-0 text-muted"><IconPen size={13} /></span>重命名当前课程…
          </button>
          <button type="button" role="menuitem" onClick={pick(remove)} className={`${item} text-bad hover:bg-bad-tint`}>
            <span className="w-3.5 shrink-0"><IconTrash size={13} /></span>删除这门课…
          </button>
        </div>
      )}
    </div>
  );
}
