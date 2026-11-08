# 课程成绩计算器

纯前端成绩计算器（P1）。设计以项目文档《P1 设计方案》为准，进度见 `CHANGELOG.md`。

```bash
npm install
npm run dev     # 本地开发
npm test        # 单元测试（Vitest）
npm run build   # 生产构建到 dist/
```

计算核心在 `src/lib/grade.ts`：`computeCourse(course)` 输入一门课（`src/types.ts`），输出当前成绩、预估、需求分、可行性、结论句和逐项结果。

数据保存在浏览器 localStorage（键 `grade-calculator:v1`，`src/lib/storage.ts`）；分享链接把一门课用 lz-string 压缩进 URL hash `#c=…`（`src/lib/share.ts`）。多课程状态在 `src/state/appStore.ts`。
