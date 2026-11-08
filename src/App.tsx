import { CourseProvider } from './state/CourseContext';
import { TopBar } from './components/TopBar';
import { Overview } from './components/Overview';
import { GradeTable } from './components/GradeTable';
import { Conclusion } from './components/Conclusion';

// 页面从上到下：顶栏 → 总览 → 评分表 → 结论（方案 §2、§4）。所有输入即时生效，没有「计算」按钮。
export default function App() {
  return (
    <CourseProvider>
      <div className="flex min-h-screen flex-col bg-page font-sans text-ink">
        <TopBar />
        <main className="mx-auto box-border flex w-full max-w-[1120px] flex-col gap-5 px-4 pt-6 pb-10 sm:px-8">
          <Overview />
          <GradeTable />
          <Conclusion />
          <p className="m-0 text-center text-xs text-muted">当前版本还不保存数据，刷新后回到示例课程</p>
        </main>
      </div>
    </CourseProvider>
  );
}
