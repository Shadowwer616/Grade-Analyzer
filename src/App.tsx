import { CourseProvider, useApp } from './state/CourseContext';
import { TopBar } from './components/TopBar';
import { Overview } from './components/Overview';
import { GradeTable } from './components/GradeTable';
import { Conclusion } from './components/Conclusion';
import { NoticeBar, WeightBanner } from './components/Banners';
import { ImportConflictDialog } from './components/CourseDialogs';

// 页面从上到下：顶栏 → 总览 → 评分表 → 结论（方案 §2、§4）。所有输入即时生效，没有「计算」按钮。
export default function App() {
  return (
    <CourseProvider>
      <Page />
    </CourseProvider>
  );
}

function Page() {
  const { course, storageStatus } = useApp();
  return (
    <div className="flex min-h-screen flex-col bg-page font-sans text-ink">
      <TopBar />
      <main className="mx-auto box-border flex w-full max-w-[1120px] flex-col gap-5 px-4 pt-6 pb-10 sm:px-8">
        <NoticeBar />
        {/* 按课程 id 加 key：换课程时总览、评分表整体重建，「高级」面板全部收起，输入框里的中间态也不会串到别的课 */}
        <Overview key={`o-${course.id}`} />
        <WeightBanner />
        <GradeTable key={`t-${course.id}`} />
        <Conclusion />
        <p className="m-0 text-center text-xs text-muted" data-testid="storage-note">
          {storageStatus === 'unavailable'
            ? '这个浏览器不允许本地保存（可能是隐私模式或存储已满），刷新后改动会丢失；可以用「分享链接」带走数据'
            : '所有改动自动保存在这个浏览器里；换设备或换浏览器请用「分享链接」'}
        </p>
      </main>
      <ImportConflictDialog />
    </div>
  );
}
