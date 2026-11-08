# 课程成绩计算器

一个纯前端的课程成绩计算器：录入每一项的权重和分数，马上看到当前成绩、含假设的预估，以及剩下的考试要考多少才能达到目标。没有账号、没有后端，数据只存在你自己的浏览器里。

在线使用：<https://shadowwer616.github.io/Grade-Analyzer/>（推到 `main` 后由 GitHub Actions 自动发布；需先在仓库 Settings → Pages 启用，见「部署」）

| 手机（390px） | 桌面（1280px） |
| --- | --- |
| <img src="docs/screenshots/mobile-390.png" width="260"> | <img src="docs/screenshots/desktop-1280.png" width="520"> |

## 能做什么

- **当前成绩与预估**：只按已出分的项算当前成绩；把「假设」的分数也算进去给出预估；五段进度条显示已拿到 / Bonus / 已失 / 还需 / 余量。
- **反推需求分**：设一个目标（按分数或直接选等级），每个未出分的项显示「需要 X%」，并判断可达 / 已达成 / 无法达到。
- **假设**：任何未出分的项点「假设」，填一个预计分数或拖滑块试算。
- **Bonus**：权重外的加分，直接加到总分。
- **多次子项**（「高级」）：作业、小测这类按次计分，可去掉最低 K 次、粘贴一串分数快速录入，并算出剩余每次至少要拿几分。
- **期末替代期中**（期末行的「高级」）：期末考得比某次期中好时用期末分代替，需求分自动取更有利的算法。
- **等级表**：美式 10 分制、美式整十、中国百分制，或自定义；自定义的表可以存成「我的预设」给所有课程用（可改名、删除）。
- **从 syllabus 导入**：粘贴 syllabus 文字或上传 PDF / .txt / .md，自动识别评分构成（名称、权重、次数、去掉最低 K 次、Bonus、期末），在可编辑的预览表里核对后建课；认不全时可以一键复制提示词给 Claude / ChatGPT，再把回复粘回来。全程在浏览器里完成，不连任何服务器。
- **多课程**：顶栏切换、新建（三个模板）、重命名、删除；评分项可以上移 / 下移，桌面端还能拖动排序。
- **手机端**：视口 ≤ 640px 时自动切成卡片布局，底部固定「添加评分项」和「清空假设」。

## 怎么用

1. 第一次打开会有一门示例课程「微积分 I」，可以直接拖目标滑块、点「假设」体验。
2. 「新建课程」选一个模板（作业 20 / 期中 30 / 期末 50 等），改成你这门课的权重；或者选「从 syllabus 导入」，把 syllabus 粘进来自动识别。
3. 出分了就把分数填进「已得分」（满分不是 100 也没关系，会自动换算成百分比）；没出分的留空。
4. 看总览和结论区：当前多少、预估多少、剩下的项各要多少。

## 数据存在哪

- 所有改动自动保存在当前浏览器的 **localStorage**，键 `grade-calculator:v1`，内容是 `{ version, currentId, courses, myScales }`。不上传任何服务器。
- 换浏览器、清除浏览器数据、用隐私模式都看不到之前的数据——需要带走时用分享链接。
- 读到损坏的数据时，页面会尽量逐字段恢复，并把原始内容备份到 `grade-calculator:v1:corrupt`（只保留最近一次）。页脚「关于」里可以一键复制这份备份，也可以在开发者工具 → Application → Local Storage 里查看。

## 分享链接

- 顶栏「分享链接」（手机端是右上角的分享图标）会把**当前这一门课**用 lz-string 压缩进地址的 hash：`…/#c=…`。数据只在链接里，不经过服务器。
- 弹窗里可以复制链接，也可以让手机扫二维码。
- 对方打开链接，这门课会导入为一门新课程；如果已有同名课程，可选「另存为」或「覆盖」。导入后两边各改各的，不会同步。
- 链接带上这门课的自定义等级表，但不带「我的预设」。

PDF 只在浏览器里读取。中文 PDF 常用未嵌入的字体，需要 pdf.js 的 CMap 文件：`vite.config.ts` 里的小插件在构建时把它们复制到 `dist/pdfjs/cmaps/`，开发时直接从 `node_modules` 提供，打开这类 PDF 时才按需下载。

## 本地开发

需要 Node.js 22.12+（Vitest 5 的要求；部署工作流用的也是 22）。

```bash
npm install
npm run dev       # 本地开发服务器
npm test          # 单元测试（Vitest）
npm run build     # 类型检查 + 生产构建到 dist/
npm run preview   # 本地预览 dist/
```

代码结构：

```
src/
  lib/grade.ts          计算核心（纯函数）：computeCourse(course) → 当前 / 预估 / 需求 / 可行性 / 结论句
  lib/advanced.ts       多次子项面板的编辑操作
  lib/scales.ts         等级表预设与自定义校验
  lib/storage.ts        localStorage 读写与坏数据兜底
  lib/share.ts          分享链接编解码
  lib/syllabusParser.ts syllabus 规则识别（纯函数；样本在 lib/__fixtures__/）
  lib/syllabusImport.ts 预览表归一化 / 校验 / 转课程、AI 提示词与回复解析
  lib/pdfText.ts        浏览器里用 pdf.js（legacy 构建）抽 PDF 文字
  state/courseReducer.ts  单门课的修改动作
  state/appStore.ts       多课程、我的预设
  state/CourseContext.tsx Provider：自动保存、处理分享链接
  hooks/useIsMobile.ts    手机端断点（≤ 640px）
  components/             界面（桌面表格与手机卡片共用 ItemParts）
  types.ts                数据模型
```

设计规范以项目文档《P1 设计方案》为准，各阶段进度见 `CHANGELOG.md`。

## 部署

`.github/workflows/deploy.yml`：每次推到 `main`，GitHub Actions 依次 `npm ci` → `npm test` → `npm run build`，再用 `actions/upload-pages-artifact` + `actions/deploy-pages` 把 `dist/` 发布到 GitHub Pages。测试不过就不会发布。

- 仓库 Settings → Pages → Source 要选 **GitHub Actions**。如果工作流在 `configure-pages` 这一步报「Get Pages site failed / Not Found」，说明 Pages 还没真正启用：私有仓库需要 GitHub Pro / Team 等付费方案才能开 Pages，否则要把仓库改成公开。启用后在 Actions 页面对失败的那次点「Re-run jobs」，或手动运行「Deploy to GitHub Pages」即可。
- `vite.config.ts` 里 `base: './'`，所有资源（包括分享弹窗按需加载的二维码 chunk）都用相对路径，所以部署在 `/grade-analyzer/` 这样的子路径下也能用；换到 Vercel 或别的静态托管同样不用改配置。
- 分享链接用的是当前页面地址，换域名后旧链接里的地址会变，但 `#c=` 后面的数据不受影响，粘到新地址后面照样能导入。
