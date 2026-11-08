// 分享链接（阶段 4，方案 §2.6、§5「分享链接」）：
// { v: 1, course } → JSON → lz-string compressToEncodedURIComponent → URL hash「#c=…」。
// 只带这一门课（含 customScale），不带「我的预设」。导入时重新分配课程 id（见 state/appStore.ts）。
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Course } from '../types';
import { sanitizeCourse } from './storage';

export const HASH_KEY = 'c';

export function encodeCourse(course: Course): string {
  return compressToEncodedURIComponent(JSON.stringify({ v: 1, course }));
}

export type DecodeResult = { ok: true; course: Course } | { ok: false; error: string };

export function decodeCourse(code: string): DecodeResult {
  const bad = (error: string): DecodeResult => ({ ok: false, error });
  if (!code.trim()) return bad('链接里没有课程数据');
  let json: string | null;
  try {
    json = decompressFromEncodedURIComponent(code.trim());
  } catch {
    json = null;
  }
  if (!json) return bad('链接不完整或被改动过，没能解压出课程数据');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return bad('链接里的课程数据格式不对');
  }
  // 兼容直接放课程对象（没有 { v, course } 外壳）的写法
  const body = parsed && typeof parsed === 'object' && 'course' in parsed ? (parsed as { course: unknown }).course : parsed;
  if (parsed && typeof parsed === 'object' && 'v' in parsed && (parsed as { v: unknown }).v !== 1) {
    return bad('这个链接来自更新的版本，当前页面认不出来');
  }
  const course = sanitizeCourse(body);
  if (!course) return bad('链接里的课程数据格式不对');
  return { ok: true, course };
}

/** 页面地址（去掉原有 hash）+ #c=… */
export function buildShareUrl(course: Course, href: string): string {
  return href.split('#')[0] + `#${HASH_KEY}=` + encodeCourse(course);
}

/**
 * 读 location.hash：没有 c= 参数时返回 null（不是分享链接，什么都不做）；
 * 有的话返回解码结果（成功或失败原因）。
 */
export function readShareHash(hash: string): DecodeResult | null {
  const h = hash.replace(/^#/, '');
  if (!h) return null;
  // 不用 URLSearchParams：它会把「+」当空格，而 lz-string 的 URI 编码里有「+」
  const m = h.match(new RegExp(`(?:^|&)${HASH_KEY}=([^&]*)`));
  return m ? decodeCourse(m[1]) : null;
}
