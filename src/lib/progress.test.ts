// 阶段 2 新增：示例课程打开时的数字、进度条五段。
import { describe, expect, it } from 'vitest';
import type { Course } from '../types';
import { computeCourse, formatScore, progressBreakdown } from './grade';
import { sampleCourse } from '../data/sampleCourse';

const fmt = formatScore;

describe('示例课程（和画板一致）', () => {
  const r = computeCourse(sampleCourse());

  it('当前 83.5（B）、预估 86.3（B）、期末需要 81.0、可达', () => {
    expect(fmt(r.current!)).toBe('83.5');
    expect(r.currentGrade).toBe('B');
    expect(fmt(r.projected!)).toBe('86.3');
    expect(r.projectedGrade).toBe('B');
    expect(fmt(r.required!)).toBe('81.0');
    expect(r.status).toBe('reachable');
    expect(r.items.find((i) => i.id === 'final')!.required).toBeCloseTo(81, 6);
  });

  it('四个数字：已锁定 52.6、最低 52.6、最高 92.6（A-）、还需 32.4', () => {
    expect(fmt(r.locked + r.bonusPoints)).toBe('52.6');
    expect(fmt(r.minPossible)).toBe('52.6');
    expect(fmt(r.maxPossible)).toBe('92.6');
    expect(r.maxGrade).toBe('A-');
    expect(fmt(r.gap)).toBe('32.4');
  });
});

describe('progressBreakdown 进度条五段', () => {
  it('示例课程：已拿到 50.6 / Bonus 2 / 已失 9.4 / 还需 32.4 / 余量 7.6', () => {
    const b = progressBreakdown(computeCourse(sampleCourse()));
    expect(fmt(b.earned)).toBe('50.6');
    expect(fmt(b.bonus)).toBe('2.0');
    expect(fmt(b.lost)).toBe('9.4');
    expect(fmt(b.need)).toBe('32.4');
    expect(fmt(b.slack)).toBe('7.6');
    expect(b.total).toBeCloseTo(102, 6);
  });

  it('无法达到：还需限在剩余容量内，余量 0', () => {
    const c: Course = { ...sampleCourse(), target: 98 };
    const r = computeCourse(c);
    expect(r.status).toBe('unreachable');
    const b = progressBreakdown(r);
    expect(b.need).toBeCloseTo(40, 6);
    expect(b.slack).toBe(0);
  });

  it('已达成：还需 0，剩余全是余量', () => {
    const r = computeCourse({ ...sampleCourse(), target: 50 });
    expect(r.status).toBe('secured');
    const b = progressBreakdown(r);
    expect(b.need).toBe(0);
    expect(b.slack).toBeCloseTo(40, 6);
  });

  it('全部完成或假设：剩余容量 0，已拿到 + 已失 = 100', () => {
    const c = sampleCourse();
    c.items = c.items.map((i) => (i.id === 'final' ? { ...i, assumed: 80 } : i));
    const b = progressBreakdown(computeCourse(c));
    expect(b.need + b.slack).toBe(0);
    expect(b.earned + b.lost).toBeCloseTo(100, 6);
  });
});
