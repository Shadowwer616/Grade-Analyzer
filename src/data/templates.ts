// 新建课程的模板（方案 §2.1）。期末行 id 用 final，这样「可替代」会出现。
import type { Course, GradeItem } from '../types';

export type TemplateId = 'hw-mid-final' | 'hw-lab-final' | 'blank';

export const TEMPLATES: { id: TemplateId; name: string; detail: string; items: Omit<GradeItem, 'score' | 'max'>[] }[] = [
  {
    id: 'hw-mid-final',
    name: '作业 20 / 期中 30 / 期末 50',
    detail: '最常见的三段式',
    items: [
      { id: 'hw', name: '作业', weight: 20 },
      { id: 'mid', name: '期中', weight: 30 },
      { id: 'final', name: '期末', weight: 50 },
    ],
  },
  {
    id: 'hw-lab-final',
    name: '作业 30 / 实验 20 / 期末 50',
    detail: '理工科带实验的课',
    items: [
      { id: 'hw', name: '作业', weight: 30 },
      { id: 'lab', name: '实验', weight: 20 },
      { id: 'final', name: '期末', weight: 50 },
    ],
  },
  { id: 'blank', name: '空白', detail: '自己添加评分项', items: [] },
];

/** 模板的评分项（满分 100、未出分）；空白模板返回空数组 */
export function templateItems(template: TemplateId): GradeItem[] {
  const t = TEMPLATES.find((x) => x.id === template) ?? TEMPLATES[TEMPLATES.length - 1];
  return t.items.map((i) => ({ ...i, max: 100, score: null }));
}

export function courseFromTemplate(id: string, name: string, template: TemplateId): Course {
  return {
    id,
    name: name.trim() || '新课程',
    target: 85,
    gradeScale: 'us-10',
    customScale: null,
    items: templateItems(template),
    bonus: null,
    updatedAt: new Date().toISOString(),
  };
}
