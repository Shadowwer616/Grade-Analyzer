// 示例课程：和画板、方案 §3 贯穿算例一致。
// 作业 85（20%）、期中一 78（20%）、期中二假设 90（20%）、期末未考（40%）、Bonus +2 / 最多 5、目标 85。
// 打开应显示：当前 83.5、预估 86.3、期末需要 81.0。
import type { Course } from '../types';

export function sampleCourse(): Course {
  return {
    id: 'c_sample',
    name: '微积分 I',
    target: 85,
    gradeScale: 'us-10',
    customScale: null,
    items: [
      { id: 'hw', name: '作业', weight: 20, max: 100, score: 85 },
      { id: 'm1', name: '期中一', weight: 20, max: 100, score: 78 },
      { id: 'm2', name: '期中二', weight: 20, max: 100, score: null, assumed: 90 },
      { id: 'final', name: '期末', weight: 40, max: 100, score: null },
    ],
    bonus: { name: '课堂参与 Bonus', max: 5, score: 2 },
    updatedAt: new Date().toISOString(),
  };
}
