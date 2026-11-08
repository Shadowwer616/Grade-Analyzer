// 状态入口。阶段 4 起整个 SavedData（多门课 + 我的预设）放在 appReducer 里，每次变化写 localStorage；
// useCourse() 仍然只给「当前课程」，阶段 2–3 的组件不用改。
import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState,
  type Dispatch, type ReactNode,
} from 'react';
import type { Course, SavedData } from '../types';
import { computeCourse, type CourseResult } from '../lib/grade';
import { browserStorage, saveData, BACKUP_KEY, type KeyValueStore, type LoadStatus } from '../lib/storage';
import type { CourseAction } from './courseReducer';
import { readShareHash } from '../lib/share';
import { appReducer, bootstrap, currentCourse, findSameName, type AppAction } from './appStore';

export interface Notice {
  tone: 'info' | 'error';
  text: string;
}

interface AppContextValue {
  data: SavedData;
  course: Course;
  dispatch: Dispatch<AppAction>;
  /** unavailable = 浏览器不让存，刷新会丢 */
  storageStatus: LoadStatus;
  notice: Notice | null;
  setNotice: (n: Notice | null) => void;
  /** 分享链接里的同名课程，等用户选择 */
  conflict: Course | null;
  resolveConflict: (mode: 'saveAs' | 'overwrite' | null) => void;
}

interface CourseContextValue {
  course: Course;
  result: CourseResult;
  dispatch: Dispatch<CourseAction>;
}

const AppContext = createContext<AppContextValue | null>(null);
const CourseContext = createContext<CourseContextValue | null>(null);

/** 去掉地址里的 #c=…，不留历史记录 */
function clearHash() {
  if (!window.location.hash) return;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

function bootNotice(b: ReturnType<typeof bootstrap>): Notice | null {
  if (b.shareError) return { tone: 'error', text: `分享链接打不开：${b.shareError}` };
  if (b.imported) return { tone: 'info', text: `已从分享链接导入「${b.imported}」` };
  if (b.status === 'recovered')
    return { tone: 'error', text: `本地保存的数据有损坏，已尽量恢复；原始数据备份在 localStorage「${BACKUP_KEY}」` };
  return null;
}

export function CourseProvider({ children, store: storeProp }: { children: ReactNode; store?: KeyValueStore | null }) {
  const [boot] = useState(() => {
    const store = storeProp === undefined ? browserStorage() : storeProp;
    return { store, ...bootstrap(store, window.location.hash) };
  });
  const [data, dispatch] = useReducer(appReducer, boot.data);
  const [notice, setNotice] = useState<Notice | null>(() => bootNotice(boot));
  const [conflict, setConflict] = useState<Course | null>(boot.conflict);
  const [storageStatus, setStorageStatus] = useState<LoadStatus>(boot.status);

  // 打开时带的分享 hash 已经读过了，清掉，免得刷新时再导入一次
  useEffect(clearHash, []);

  // 每次状态变化就写；写失败（存储满 / 被禁用）时提示一次
  useEffect(() => {
    if (!boot.store) return;
    if (!saveData(boot.store, data)) setStorageStatus('unavailable');
  }, [boot.store, data]);

  // 页面开着时又粘贴了一个分享链接（只改了 hash，不会刷新）
  const dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => {
    const onHash = () => {
      const share = readShareHash(window.location.hash);
      if (!share) return;
      clearHash();
      if (!share.ok) setNotice({ tone: 'error', text: `分享链接打不开：${share.error}` });
      else if (findSameName(dataRef.current, share.course.name)) setConflict(share.course);
      else {
        dispatch({ type: 'importCourse', course: share.course, mode: 'new' });
        setNotice({ tone: 'info', text: `已从分享链接导入「${share.course.name}」` });
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const resolveConflict = useCallback(
    (mode: 'saveAs' | 'overwrite' | null) => {
      if (conflict && mode) {
        dispatch({ type: 'importCourse', course: conflict, mode });
        setNotice({ tone: 'info', text: mode === 'overwrite' ? `已用分享链接覆盖「${conflict.name}」` : '已另存为一门新课程' });
      }
      setConflict(null);
    },
    [conflict],
  );

  const course = currentCourse(data);
  const appValue = useMemo<AppContextValue>(
    () => ({ data, course, dispatch, storageStatus, notice, setNotice, conflict, resolveConflict }),
    [data, course, storageStatus, notice, conflict, resolveConflict],
  );

  // 所有派生值即时由 grade.ts 算出，不存
  const result = useMemo(() => computeCourse(course), [course]);
  const courseDispatch = useCallback((action: CourseAction) => dispatch({ type: 'course', action }), []);
  const courseValue = useMemo(() => ({ course, result, dispatch: courseDispatch }), [course, result, courseDispatch]);

  return (
    <AppContext.Provider value={appValue}>
      <CourseContext.Provider value={courseValue}>{children}</CourseContext.Provider>
    </AppContext.Provider>
  );
}

export function useCourse(): CourseContextValue {
  const ctx = useContext(CourseContext);
  if (!ctx) throw new Error('useCourse 必须在 CourseProvider 内使用');
  return ctx;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp 必须在 CourseProvider 内使用');
  return ctx;
}
