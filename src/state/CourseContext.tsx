import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import type { Course } from '../types';
import { computeCourse, type CourseResult } from '../lib/grade';
import { sampleCourse } from '../data/sampleCourse';
import { courseReducer, type CourseAction } from './courseReducer';

interface CourseContextValue {
  course: Course;
  result: CourseResult;
  dispatch: Dispatch<CourseAction>;
}

const CourseContext = createContext<CourseContextValue | null>(null);

export function CourseProvider({ children, initial }: { children: ReactNode; initial?: Course }) {
  const [course, dispatch] = useReducer(courseReducer, initial ?? null, (c) => c ?? sampleCourse());
  // 所有派生值即时由 grade.ts 算出，不存
  const result = useMemo(() => computeCourse(course), [course]);
  const value = useMemo(() => ({ course, result, dispatch }), [course, result]);
  return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>;
}

export function useCourse(): CourseContextValue {
  const ctx = useContext(CourseContext);
  if (!ctx) throw new Error('useCourse 必须在 CourseProvider 内使用');
  return ctx;
}
