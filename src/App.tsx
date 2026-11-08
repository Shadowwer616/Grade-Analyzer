import { useState } from 'react';
import { CourseProvider, useApp } from './state/CourseContext';
import { useIsMobile } from './hooks/useIsMobile';
import { TopBar } from './components/TopBar';
import { Overview, StatusBar } from './components/Overview';
import { GradeTable } from './components/GradeTable';
import { MobileBottomBar } from './components/MobileItems';
import { Conclusion } from './components/Conclusion';
import { NoticeBar, WeightBanner } from './components/Banners';
import { ImportConflictDialog } from './components/CourseDialogs';
import { ConfirmProvider } from './components/Confirm';
import { AboutDialog } from './components/AboutDialog';

// 页面从上到下：顶栏 → 总览 → 评分表 → 结论（方案 §2、§4）。所有输入即时生效，没有「计算」按钮。
// 阶段 5：视口 ≤ 640px 时同一套组件切到手机布局（画板 Mobile）：总览 → 状态横条 → 评分卡片 → 区间，底部固定栏。
export default function App() {
  return (
    <CourseProvider>
      <ConfirmProvider>
        <Page />
      </ConfirmProvider>
    </CourseProvider>
  );
}

function Page() {
  const { course, storageStatus } = useApp();
  const mobile = useIsMobile();
  const [about, setAbout] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-page font-sans text-ink">
      <TopBar />
      <main
        className={`mx-auto box-border flex w-full max-w-[1120px] flex-col gap-5 px-4 pt-6 pb-10 sm:px-8 ${
          // 手机端给底部固定栏留出位置
          mobile ? 'gap-3! pt-3! pb-[calc(110px+env(safe-area-inset-bottom))]!' : ''
        }`}
      >
        <NoticeBar />
        {/* 按课程 id 加 key：换课程时总览、评分表整体重建，「高级」面板全部收起，输入框里的中间态也不会串到别的课 */}
        <Overview key={`o-${course.id}`} />
        {mobile && <StatusBar />}
        <WeightBanner />
        <GradeTable key={`t-${course.id}`} />
        <Conclusion />
        <footer className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-muted">
          <span data-testid="storage-note">
            {storageStatus === 'unavailable'
              ? '这个浏览器不允许本地保存（可能是隐私模式或存储已满），刷新后改动会丢失；可以用「分享链接」带走数据'
              : '所有改动自动保存在这个浏览器里；换设备或换浏览器请用「分享链接」'}
          </span>
          <button
            type="button"
            onClick={() => setAbout(true)}
            className="cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-assume underline-offset-2 hover:underline mobile:min-h-11"
            data-testid="about-link"
          >
            关于
          </button>
        </footer>
      </main>
      {mobile && <MobileBottomBar />}
      <ImportConflictDialog />
      {about && <AboutDialog onClose={() => setAbout(false)} />}
    </div>
  );
}
