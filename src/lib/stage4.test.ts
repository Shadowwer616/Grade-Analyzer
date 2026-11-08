// 阶段 4：本地保存、分享链接、多课程、同名导入、归一化、清空本课分数、改名清替代。
import { describe, expect, it } from 'vitest';
import type { Course, SavedData } from '../types';
import { sampleCourse } from '../data/sampleCourse';
import { courseFromTemplate, TEMPLATES } from '../data/templates';
import { computeCourse, isFinalItem } from './grade';
import {
  BACKUP_KEY, freshData, loadData, sanitizeCourse, sanitizeData, saveData, STORAGE_KEY, type KeyValueStore,
} from './storage';
import { buildShareUrl, decodeCourse, encodeCourse, readShareHash } from './share';
import { appReducer, bootstrap, currentCourse, sameScale, uniqueName } from '../state/appStore';
import { courseReducer } from '../state/courseReducer';

/** 内存版 localStorage */
function memoryStore(init: Record<string, string> = {}): KeyValueStore & { map: Map<string, string> } {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
}

/** 一门用到所有字段的课：子项面板、期末替代、自定义等级表、Bonus */
function richCourse(): Course {
  return {
    id: 'c_rich',
    name: '线性代数',
    target: 88,
    gradeScale: 'custom',
    customScale: [['A', 94], ['B', 84], ['C', 70], ['F', 0]],
    items: [
      {
        id: 'hw', name: '作业', weight: 20, max: 100, score: 85,
        advanced: {
          count: 10, maxEach: 10, dropLowest: 1,
          scores: [9, 8, 10, 6, 9, 7, 10, 9, null, null],
          assumed: [null, null, null, null, null, null, null, null, 9, null],
        },
      },
      { id: 'm1', name: '期中一', weight: 20, max: 100, score: 78 },
      { id: 'm2', name: '期中二', weight: 20, max: 50, score: null, assumed: 90 },
      { id: 'final', name: '期末', weight: 40, max: 100, score: null, replaces: 'm1' },
    ],
    bonus: { name: '课堂参与', max: 5, score: 2 },
    updatedAt: '2026-11-07T20:30:00-06:00',
  };
}

function richData(): SavedData {
  const s = sampleCourse();
  return {
    version: 1,
    currentId: 'c_rich',
    courses: [s, richCourse()],
    myScales: [{ id: 's_dept', name: '系里的表', entries: [['优', 85], ['良', 75], ['及格', 60], ['不及格', 0]] }],
  };
}

const dispatchCourse = (d: SavedData, action: Parameters<typeof courseReducer>[1]) =>
  appReducer(d, { type: 'course', action });

// ───────────────────────── storage ─────────────────────────

describe('storage：存读往返', () => {
  it('整体存进去再读出来完全一样（advanced / replaces / customScale / myScales 都在）', () => {
    const store = memoryStore();
    const data = richData();
    expect(saveData(store, data)).toBe(true);
    const { data: back, status } = loadData(store);
    expect(status).toBe('ok');
    expect(back).toEqual(data);
    const rich = back.courses.find((c) => c.id === 'c_rich')!;
    expect(rich.items[0].advanced?.assumed[8]).toBe(9);
    expect(rich.items[3].replaces).toBe('m1');
    expect(rich.customScale?.[0]).toEqual(['A', 94]);
    expect(back.myScales[0].name).toBe('系里的表');
    // 读回来的课程算出的结果和原来一致
    expect(computeCourse(rich)).toEqual(computeCourse(richCourse()));
  });

  it('第一次打开（空）：建示例课程，状态 empty', () => {
    const { data, status } = loadData(memoryStore());
    expect(status).toBe('empty');
    expect(data.courses).toHaveLength(1);
    expect(data.courses[0].name).toBe('微积分 I');
    expect(data.currentId).toBe(data.courses[0].id);
    expect(data.myScales).toEqual([]);
  });

  it('localStorage 不可用 / 读写抛错：不崩，退回示例课程', () => {
    expect(loadData(null).status).toBe('unavailable');
    const broken: KeyValueStore = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceeded'); },
      removeItem: () => {},
    };
    const r = loadData(broken);
    expect(r.status).toBe('unavailable');
    expect(r.data.courses[0].name).toBe('微积分 I');
    expect(saveData(broken, r.data)).toBe(false);
    expect(saveData(null, r.data)).toBe(false);
  });
});

describe('storage：坏数据兜底', () => {
  it('不是 JSON：退回示例课程，原文备份', () => {
    const store = memoryStore({ [STORAGE_KEY]: '{not json' });
    const { data, status } = loadData(store);
    expect(status).toBe('recovered');
    expect(data.courses[0].name).toBe('微积分 I');
    expect(store.map.get(BACKUP_KEY)).toBe('{not json');
  });

  it('结构不对（数组、null、courses 不是数组、课程全坏）：退回示例课程', () => {
    for (const raw of ['[]', 'null', '42', '{"version":1,"courses":"x"}', '{"version":1,"courses":[1,"a",null]}']) {
      const { data, status } = loadData(memoryStore({ [STORAGE_KEY]: raw }));
      expect(status).toBe('recovered');
      expect(data.courses).toHaveLength(1);
      expect(data.courses[0].name).toBe('微积分 I');
    }
  });

  it('逐字段兜底：坏字段换默认值，好字段保留', () => {
    const c = sanitizeCourse({
      id: 'c_x',
      name: '   ',
      target: 'abc',
      gradeScale: 'nope',
      customScale: [['A', 'x']],
      items: [
        { id: 'a', name: '作业', weight: -5, max: 0, score: 'NaN', assumed: 150 },
        'garbage',
        { id: 'a', name: '重复 id', weight: 30, max: 100, score: 70 },
        { name: '没有 id', weight: 20, max: 50, score: 40 },
        { id: 'final', name: '期末', weight: 50, max: 100, score: null, replaces: 'ghost' },
      ],
      bonus: { name: 3, max: 'x', score: -1 },
    })!;
    expect(c.name).toBe('未命名课程');
    expect(c.target).toBe(85);
    expect(c.gradeScale).toBe('us-10');
    expect(c.customScale).toBeNull();
    expect(c.items).toHaveLength(4);
    expect(c.items[0]).toMatchObject({ id: 'a', weight: 0, max: 100, score: null, assumed: 100 });
    // 重复 id、缺 id 的行换了新 id，内容保留
    expect(c.items[1].id).not.toBe('a');
    expect(c.items[1]).toMatchObject({ name: '重复 id', weight: 30, score: 70 });
    expect(c.items[2].id).toBeTruthy();
    expect(new Set(c.items.map((i) => i.id)).size).toBe(4);
    // 引用了不存在的项的 replaces 被清掉
    expect(c.items[3].replaces).toBeUndefined();
    expect(c.bonus).toEqual({ name: 'Bonus', max: 5, score: null });
    // 整理后的课程能正常计算
    expect(() => computeCourse(c)).not.toThrow();
  });

  it('子项数组长度不对时补齐 / 截断到 count，dropLowest 限在 0…N−1', () => {
    const c = sanitizeCourse({
      ...richCourse(),
      items: [{
        id: 'hw', name: '作业', weight: 100, max: 100, score: null,
        advanced: { count: 4, maxEach: [10, 'x', 20], dropLowest: 9, scores: [9, 8, 7, 6, 5, 4], assumed: 'bad' },
      }],
    })!;
    const adv = c.items[0].advanced!;
    expect(adv.count).toBe(4);
    expect(adv.maxEach).toEqual([10, 10, 20, 10]);
    expect(adv.dropLowest).toBe(3);
    expect(adv.scores).toEqual([9, 8, 7, 6]);
    expect(adv.assumed).toEqual([null, null, null, null]);
  });

  it('选了 custom 却没有合法 customScale：退回美式 10 分制', () => {
    const c = sanitizeCourse({ ...richCourse(), customScale: [['A', 90], ['A', 80]] })!;
    expect(c.gradeScale).toBe('us-10');
    expect(c.customScale).toBeNull();
  });

  it('混着坏课程：好的留下，坏的丢掉；重复课程 id 换新；currentId 找不到时打开第一门', () => {
    const good = richCourse();
    const { data, recovered } = sanitizeData({
      version: 1,
      currentId: 'c_gone',
      courses: [good, 'bad', { ...good, name: '同 id 的另一门' }],
      myScales: [{ id: 's1', name: '好的', entries: [['A', 90], ['F', 0]] }, { id: 's2', name: '', entries: [] }],
    });
    expect(recovered).toBe(true);
    expect(data.courses).toHaveLength(2);
    expect(data.courses[0].id).toBe('c_rich');
    expect(data.courses[1].id).not.toBe('c_rich');
    expect(data.currentId).toBe('c_rich');
    expect(data.myScales.map((s) => s.name)).toEqual(['好的']);
  });
});

// ───────────────────────── share ─────────────────────────

describe('share：编解码', () => {
  it('编码后解码得到同一门课（含 advanced / replaces / customScale）', () => {
    const c = richCourse();
    const r = decodeCourse(encodeCourse(c));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.course).toEqual(c);
  });

  it('链接只编码一门课，不带「我的预设」；URL 安全', () => {
    const code = encodeCourse(richCourse());
    expect(code).toMatch(/^[A-Za-z0-9+\-$]*$/);
    expect(code).not.toContain('系里的表');
    const url = buildShareUrl(richCourse(), 'https://x.github.io/grade/?a=1#old');
    expect(url.startsWith('https://x.github.io/grade/?a=1#c=')).toBe(true);
    const back = readShareHash(new URL(url).hash);
    expect(back?.ok).toBe(true);
    if (back?.ok) expect(JSON.stringify(back.course)).not.toContain('myScales');
  });

  it('解码失败给出原因，不抛错', () => {
    expect(decodeCourse('')).toMatchObject({ ok: false });
    expect(decodeCourse('这不是链接')).toMatchObject({ ok: false });
    const truncated = encodeCourse(richCourse()).slice(0, 20);
    const r = decodeCourse(truncated);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
  });

  it('readShareHash：没有 #c= 时返回 null', () => {
    expect(readShareHash('')).toBeNull();
    expect(readShareHash('#')).toBeNull();
    expect(readShareHash('#section-2')).toBeNull();
    expect(readShareHash('#c=')).toMatchObject({ ok: false });
  });
});

// ───────────────────────── 多课程与导入 ─────────────────────────

describe('多课程', () => {
  it('新建：三个模板的权重合计 100（空白除外），期末行 id 为 final；建好后切过去', () => {
    for (const t of TEMPLATES.filter((x) => x.id !== 'blank')) {
      const c = courseFromTemplate('c_t', '课', t.id);
      expect(c.items.reduce((s, i) => s + i.weight, 0)).toBe(100);
      const fin = c.items.find((i) => i.id === 'final')!;
      expect(isFinalItem(fin)).toBe(true);
      expect(c.items.every((i) => i.score === null && i.max === 100)).toBe(true);
    }
    expect(courseFromTemplate('c_b', '课', 'blank').items).toEqual([]);

    const d = appReducer(freshData(), { type: 'createCourse', name: '线性代数', template: 'hw-lab-final' });
    expect(d.courses).toHaveLength(2);
    expect(currentCourse(d).name).toBe('线性代数');
    expect(currentCourse(d).items.map((i) => i.name)).toEqual(['作业', '实验', '期末']);
  });

  it('切换、重命名、删除；删到一门不剩自动建示例课程', () => {
    let d = richData();
    d = appReducer(d, { type: 'switchCourse', id: 'c_sample' });
    expect(d.currentId).toBe('c_sample');
    d = appReducer(d, { type: 'renameCourse', id: 'c_sample', name: '  高数  ' });
    expect(currentCourse(d).name).toBe('高数');
    expect(appReducer(d, { type: 'renameCourse', id: 'c_sample', name: '   ' })).toBe(d);

    d = appReducer(d, { type: 'deleteCourse', id: 'c_sample' });
    expect(d.courses.map((c) => c.id)).toEqual(['c_rich']);
    expect(d.currentId).toBe('c_rich');
    d = appReducer(d, { type: 'deleteCourse', id: 'c_rich' });
    expect(d.courses).toHaveLength(1);
    expect(currentCourse(d).name).toBe('微积分 I');
    expect(d.myScales).toHaveLength(1);
  });

  it('课程动作只改当前课程', () => {
    const d = dispatchCourse(richData(), { type: 'setTarget', value: 70 });
    expect(d.courses.find((c) => c.id === 'c_rich')!.target).toBe(70);
    expect(d.courses.find((c) => c.id === 'c_sample')!.target).toBe(85);
  });

  it('我的预设：同名覆盖，不同名追加', () => {
    let d = appReducer(richData(), { type: 'saveMyScale', name: '系里的表', entries: [['A', 95], ['F', 0]] });
    expect(d.myScales).toHaveLength(1);
    expect(d.myScales[0].entries).toEqual([['A', 95], ['F', 0]]);
    d = appReducer(d, { type: 'saveMyScale', name: '另一张', entries: [['P', 60], ['NP', 0]] });
    expect(d.myScales.map((s) => s.name)).toEqual(['系里的表', '另一张']);
    expect(sameScale([['P', 60], ['NP', 0]], [['NP', 0], ['P', 60]])).toBe(true);
    expect(sameScale([['P', 60]], [['P', 61]])).toBe(false);
  });
});

describe('分享链接导入', () => {
  const shared = () => ({ ...richCourse(), id: 'c_from_friend' });

  it('不同名：新增一门、换新 id、切过去', () => {
    const d = appReducer(freshData(), { type: 'importCourse', course: shared(), mode: 'new' });
    expect(d.courses).toHaveLength(2);
    const cur = currentCourse(d);
    expect(cur.name).toBe('线性代数');
    expect(cur.id).not.toBe('c_from_friend');
    expect(cur.items).toEqual(richCourse().items);
    expect(cur.customScale).toEqual(richCourse().customScale);
  });

  it('同名「另存为」：自动加后缀，原课程不动', () => {
    const before = richData();
    const d = appReducer(before, { type: 'importCourse', course: { ...shared(), target: 60 }, mode: 'saveAs' });
    expect(d.courses).toHaveLength(3);
    expect(currentCourse(d).name).toBe('线性代数（2）');
    expect(currentCourse(d).target).toBe(60);
    expect(d.courses.find((c) => c.id === 'c_rich')).toEqual(before.courses[1]);
    expect(uniqueName('线性代数（2）', ['线性代数', '线性代数（2）'])).toBe('线性代数（3）');
  });

  it('同名「覆盖」：替换原位置那门课，课程数不变', () => {
    const d = appReducer(richData(), { type: 'importCourse', course: { ...shared(), target: 60 }, mode: 'overwrite' });
    expect(d.courses).toHaveLength(2);
    expect(d.courses[1].name).toBe('线性代数');
    expect(d.courses[1].target).toBe(60);
    expect(d.courses.some((c) => c.id === 'c_rich')).toBe(false);
    expect(d.currentId).toBe(d.courses[1].id);
  });

  it('打开页面：带不同名的分享链接直接导入；同名的等弹窗；坏链接给原因', () => {
    const store = memoryStore();
    saveData(store, richData());
    const fresh = { ...richCourse(), name: '概率论' };
    const b1 = bootstrap(store, '#c=' + encodeCourse(fresh));
    expect(b1.imported).toBe('概率论');
    expect(currentCourse(b1.data).name).toBe('概率论');
    expect(b1.conflict).toBeNull();

    const b2 = bootstrap(store, '#c=' + encodeCourse(richCourse()));
    expect(b2.conflict?.name).toBe('线性代数');
    expect(b2.data.courses).toHaveLength(2);

    const b3 = bootstrap(store, '#c=garbage');
    expect(b3.shareError).toBeTruthy();
    expect(b3.data.courses).toHaveLength(2);

    const b4 = bootstrap(memoryStore(), '');
    expect(b4.status).toBe('empty');
    expect(currentCourse(b4.data).name).toBe('微积分 I');
  });
});

// ───────────────────────── 课程动作 ─────────────────────────

describe('归一化、清空本课分数、改名清替代', () => {
  it('归一化后权重合计 100，比例不变', () => {
    const c: Course = { ...sampleCourse(), items: sampleCourse().items.map((i) => ({ ...i, weight: i.weight / 2 })) };
    expect(computeCourse(c).weightsOk).toBe(false);
    const n = courseReducer(c, { type: 'normalizeWeights' });
    expect(n.items.reduce((s, i) => s + i.weight, 0)).toBeCloseTo(100, 9);
    expect(n.items.map((i) => i.weight)).toEqual([20, 20, 20, 40]);
    expect(computeCourse(n).weightsOk).toBe(true);
    // 三等分这种除不尽的：一位小数，合计仍是 100
    const t: Course = { ...sampleCourse(), items: sampleCourse().items.slice(0, 3).map((i) => ({ ...i, weight: 10 })) };
    const tn = courseReducer(t, { type: 'normalizeWeights' });
    expect(tn.items.reduce((s, i) => s + i.weight, 0)).toBeCloseTo(100, 9);
    expect(computeCourse(tn).weightsOk).toBe(true);
    // 已经是 100 时什么都不变
    const s = sampleCourse();
    expect(courseReducer(s, { type: 'normalizeWeights' })).toBe(s);
  });

  it('清空本课分数：分数、子项分、假设、Bonus 已得清空，结构保留', () => {
    const c = courseReducer(richCourse(), { type: 'clearScores' });
    expect(c.items.every((i) => i.score === null && !i.assumed)).toBe(true);
    const adv = c.items[0].advanced!;
    expect(adv.scores.every((x) => x === null)).toBe(true);
    expect(adv.assumed.every((x) => x === null)).toBe(true);
    expect(adv).toMatchObject({ count: 10, maxEach: 10, dropLowest: 1 });
    expect(c.bonus).toEqual({ name: '课堂参与', max: 5, score: null });
    expect(c.items.map((i) => [i.id, i.name, i.weight, i.max])).toEqual(
      richCourse().items.map((i) => [i.id, i.name, i.weight, i.max]),
    );
    expect(c.items[3].replaces).toBe('m1');
    expect([c.target, c.gradeScale, c.customScale]).toEqual([88, 'custom', richCourse().customScale]);
    expect(computeCourse(c).current).toBeNull();
  });

  it('期末行改名：输入过程中不清 replaces，失焦（commit）时不再是期末才清', () => {
    const base: Course = { ...sampleCourse(), items: sampleCourse().items.map((i) => (i.id === 'final' ? { ...i, id: 'f2', replaces: 'm1' } : i)) };
    let c = courseReducer(base, { type: 'updateItem', id: 'f2', patch: { name: '期' } });
    expect(c.items[3].replaces).toBe('m1');
    c = courseReducer(c, { type: 'updateItem', id: 'f2', patch: { name: '期末考试' } });
    c = courseReducer(c, { type: 'updateItem', id: 'f2', patch: {}, commit: true });
    expect(c.items[3].replaces).toBe('m1');
    c = courseReducer(c, { type: 'updateItem', id: 'f2', patch: { name: '大作业' } });
    expect(c.items[3].replaces).toBe('m1');
    c = courseReducer(c, { type: 'updateItem', id: 'f2', patch: {}, commit: true });
    expect(c.items[3].replaces).toBeNull();
    // id 是 final 的行改什么名都还是期末行
    const s = courseReducer({ ...sampleCourse(), items: sampleCourse().items.map((i) => (i.id === 'final' ? { ...i, name: '大作业', replaces: 'm1' } : i)) },
      { type: 'updateItem', id: 'final', patch: {}, commit: true });
    expect(s.items[3].replaces).toBe('m1');
  });

  it('reset 套在多课程里时保留课程 id 和名字', () => {
    const d = dispatchCourse(richData(), { type: 'reset' });
    const cur = currentCourse(d);
    expect(cur.id).toBe('c_rich');
    expect(cur.name).toBe('线性代数');
    expect(cur.items.map((i) => i.id)).toEqual(['hw', 'm1', 'm2', 'final']);
  });
});
