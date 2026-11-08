# CHANGELOG

- 阶段 1 完成：Vite + React 18 + TS + Tailwind 骨架；`types.ts` 按方案 §5；`lib/grade.ts` 计算核心（当前 / 已锁定 / 预估 / 反推 / 假设 / Bonus / 子项 drop / 期末替代期中 / 可行性 / 结论句）和 `lib/scales.ts` 等级表预设；Vitest 33 个用例覆盖 §3 算例和边界表，全部通过。
- 阶段 2 完成：桌面主界面（顶栏、总览五段进度条 + 目标滑块 + 状态结论、评分表普通行 / 假设态 / Bonus 行、结论区四个数字 + 清除全部假设），useReducer + Context 接 `grade.ts`，内置示例课程（当前 83.5 / 预估 86.3 / 期末需要 81.0）；`grade.ts` 新增 `progressBreakdown`，新增 14 个用例（进度条、示例课程、reducer），共 47 个全部通过。
