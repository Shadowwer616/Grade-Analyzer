// 顶栏（阶段 4）：课程下拉（切换 / 新建 / 重命名 / 删除）、新建课程、分享链接、清空本课分数。
// 阶段 5：手机端改成 左菜单图标（课程列表）· 中间课程名 · 右分享图标；课程列表是底部抽屉里的全宽列表；
// window.confirm 换成自己的确认弹窗。
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/CourseContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { NewCourseDialog, RenameDialog, ShareDialog } from './CourseDialogs';
import { SyllabusImportDialog } from './SyllabusImport';
import { useConfirm } from './Confirm';
import { Modal } from './Modal';
import { btn, IconChevron, IconClose, IconDoc, IconMenu, IconPen, IconPlus, IconShare, IconTrash, IconTrend } from './ui';

type Dialog = 'new' | 'rename' | 'share' | 'courses' | 'import' | null;

/** 清空本课分数、删除课程：两种布局共用，都走确认弹窗 */
function useCourseActions() {
  const { data, course, dispatch } = useApp();
  const confirm = useConfirm();

  const clearScores = async () => {
    const ok = await confirm({
      title: '清空本课分数',
      message: `清空「${course.name}」的所有已得分、子项分、假设和 Bonus 已得？\n评分项、权重、等级表和目标都会保留。`,
      confirmLabel: '清空',
      danger: true,
    });
    if (ok) dispatch({ type: 'course', action: { type: 'clearScores' } });
  };

  const remove = async () => {
    const last = data.courses.length === 1;
    const ok = await confirm({
      title: '删除课程',
      message: last
        ? `删除「${course.name}」？这是最后一门课，删除后会自动建一门示例课程。`
        : `删除「${course.name}」？这门课的所有设置和分数都会删掉，不能撤销。`,
      confirmLabel: '删除',
      danger: true,
    });
    if (ok) dispatch({ type: 'deleteCourse', id: course.id });
  };

  return { clearScores, remove };
}

export function TopBar() {
  const { course } = useApp();
  const mobile = useIsMobile();
  const [dialog, setDialog] = useState<Dialog>(null);
  /** 从「新建课程」弹窗转过来时带上已填的名称 */
  const [importName, setImportName] = useState('');
  const { clearScores } = useCourseActions();
  const close = () => setDialog(null);
  const openImport = (name = '') => {
    setImportName(name);
    setDialog('import');
  };

  const dialogs = (
    <>
      {dialog === 'new' && <NewCourseDialog onClose={close} onImport={openImport} />}
      {dialog === 'import' && <SyllabusImportDialog onClose={close} initialName={importName} />}
      {dialog === 'rename' && <RenameDialog course={course} onClose={close} />}
      {dialog === 'share' && <ShareDialog course={course} onClose={close} />}
      {dialog === 'courses' && (
        <CourseSheet onClose={close} onNew={() => setDialog('new')} onImport={() => openImport()} onRename={() => setDialog('rename')} />
      )}
    </>
  );

  if (mobile) {
    const icon = 'flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border-0 bg-transparent text-ink active:bg-page';
    return (
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-edge bg-white px-3 py-3.5 pt-[max(14px,env(safe-area-inset-top))]">
        <button type="button" onClick={() => setDialog('courses')} aria-label="课程列表" className={icon} data-testid="m-menu">
          <IconMenu />
        </button>
        <button
          type="button"
          onClick={() => setDialog('courses')}
          aria-haspopup="dialog"
          title="切换课程"
          data-testid="course-menu"
          className="flex h-11 min-w-0 cursor-pointer items-center gap-1.5 rounded-[10px] border-0 bg-transparent px-3 text-[17px] font-bold text-ink active:bg-page"
        >
          <span className="truncate">{course.name}</span>
          <span className="shrink-0 text-muted"><IconChevron /></span>
        </button>
        <button type="button" onClick={() => setDialog('share')} aria-label="分享链接" className={icon} data-testid="m-share">
          <IconShare />
        </button>
        {dialogs}
      </header>
    );
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-edge bg-white px-4 py-3.5 sm:px-8">
      <div className="flex min-w-0 flex-wrap items-center gap-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white">
          <IconTrend />
        </div>
        <span className="text-[17px] font-bold">成绩计算器</span>
        <CourseMenu onNew={() => setDialog('new')} onImport={() => openImport()} onRename={() => setDialog('rename')} />
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
      {dialogs}
    </header>
  );
}

// ───────────────────────── 桌面：课程下拉 ─────────────────────────

function CourseMenu({ onNew, onImport, onRename }: { onNew: () => void; onImport: () => void; onRename: () => void }) {
  const { data, course, dispatch } = useApp();
  const { remove } = useCourseActions();
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
          <button type="button" role="menuitem" onClick={pick(onImport)} className={item} data-testid="menu-import">
            <span className="w-3.5 shrink-0 text-muted"><IconDoc size={13} /></span>从 syllabus 导入…
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

// ───────────────────────── 手机：课程列表（底部抽屉，全宽） ─────────────────────────

function CourseSheet({
  onClose, onNew, onImport, onRename,
}: { onClose: () => void; onNew: () => void; onImport: () => void; onRename: () => void }) {
  const { data, course, dispatch } = useApp();
  const { clearScores, remove } = useCourseActions();
  const row = 'flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-[10px] border-0 bg-transparent px-3 text-left text-[15px] text-ink active:bg-page';
  // 先关列表再做事：确认弹窗、新建 / 重命名弹窗都不叠在列表上面
  const then = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <Modal title={`我的课程 · ${data.courses.length}`} onClose={onClose} testId="course-sheet">
      <div className="-mx-1 flex flex-col" role="list">
        {data.courses.map((c) => (
          <button
            key={c.id}
            type="button"
            role="listitem"
            aria-current={c.id === course.id ? 'true' : undefined}
            onClick={then(() => dispatch({ type: 'switchCourse', id: c.id }))}
            className={`${row} ${c.id === course.id ? 'bg-assume-row font-semibold' : ''}`}
          >
            <span className={`w-4 shrink-0 text-assume ${c.id === course.id ? '' : 'invisible'}`}>✓</span>
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
          </button>
        ))}
      </div>
      <div className="-mx-1 flex flex-col border-t border-divide pt-2">
        <button type="button" onClick={then(onNew)} className={row}>
          <span className="w-4 shrink-0 text-muted"><IconPlus /></span>新建课程
        </button>
        <button type="button" onClick={then(onImport)} className={row} data-testid="sheet-import">
          <span className="w-4 shrink-0 text-muted"><IconDoc /></span>从 syllabus 导入
        </button>
        <button type="button" onClick={then(onRename)} className={row}>
          <span className="w-4 shrink-0 text-muted"><IconPen /></span>重命名「{course.name}」
        </button>
        <button type="button" onClick={then(clearScores)} className={row}>
          <span className="w-4 shrink-0 text-muted"><IconClose /></span>清空本课分数
        </button>
        <button type="button" onClick={then(remove)} className={`${row} text-bad`}>
          <span className="w-4 shrink-0"><IconTrash /></span>删除这门课
        </button>
      </div>
    </Modal>
  );
}
