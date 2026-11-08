// 阶段 6：syllabus 导入。规则识别（10 份样本）、AI 回复解析、归一化、导入后的课程结构。
import { describe, expect, it } from 'vitest';
import { parseSyllabus, toNumber, type SyllabusItem } from './syllabusParser';
import {
  buildAiPrompt, extractJson, itemsToCourse, normalizeItems, parseAiReply, validateItems, weightTotal, weightsOk,
} from './syllabusImport';
import { computeCourse, isFinalItem } from './grade';
import { sanitizeCourse } from './storage';
import { appReducer, freshData, currentCourse } from '../state/appStore';

import enList from './__fixtures__/en-list.txt?raw';
import enTable from './__fixtures__/en-table.txt?raw';
import enDropCount from './__fixtures__/en-drop-count.txt?raw';
import zh from './__fixtures__/zh.txt?raw';
import enExtraCredit from './__fixtures__/en-extra-credit.txt?raw';
import enPoints from './__fixtures__/en-points.txt?raw';
import enOptions from './__fixtures__/en-options.txt?raw';
import enPdfColumns from './__fixtures__/en-pdf-columns.txt?raw';
import zhMixed from './__fixtures__/zh-mixed.txt?raw';
import none from './__fixtures__/none.txt?raw';

/** 只比较关心的字段：名称、权重、类型、次数、K（+ 期末、Bonus、满分） */
type Row = [name: string, weight: number, kind: SyllabusItem['kind'], count: number | null, drop: number];
const rows = (items: SyllabusItem[]): Row[] => items.map((i) => [i.name, i.weight, i.kind, i.count, i.drop]);
const finals = (items: SyllabusItem[]) => items.filter((i) => i.final).map((i) => i.name);

describe('规则识别：10 份样本', () => {
  it('英文列表：Homework 20% / Midterm 1 …… 20% / Final Exam: 40%；忽略迟交和等级表', () => {
    const r = parseSyllabus(enList);
    expect(r.mode).toBe('percent');
    expect(rows(r.items)).toEqual([
      ['作业', 20, 'homework', null, 0],
      ['期中一', 20, 'midterm', null, 0],
      ['期中二', 20, 'midterm', null, 0],
      ['期末', 40, 'final', null, 0],
    ]);
    expect(finals(r.items)).toEqual(['期末']);
    expect(r.unrecognized).toEqual([]);
    expect(r.courseName).toBe('MATH 221 Calculus I');
    expect(r.items[1].source).toContain('Midterm 1');
  });

  it('英文表格：| Quizzes | 15% |；Total 行和含 late 的格子不当评分项；attendance policy 整行忽略', () => {
    const r = parseSyllabus(enTable);
    expect(rows(r.items)).toEqual([
      ['测验', 15, 'quiz', null, 0],
      ['实验', 20, 'lab', null, 0],
      ['期中', 25, 'midterm', null, 0],
      ['期末', 30, 'final', null, 0],
      ['出勤', 10, 'participation', null, 0],
    ]);
    expect(weightTotal(r.items)).toBe(100);
    expect(r.unrecognized).toEqual([]);
  });

  it('次数和 drop：11 problem sets + lowest two dropped、best 8 of 10、each lab out of 10 + lowest dropped', () => {
    const r = parseSyllabus(enDropCount);
    expect(rows(r.items)).toEqual([
      ['作业', 25, 'homework', 11, 2],
      ['测验', 15, 'quiz', 10, 2],
      ['实验', 20, 'lab', null, 1],
      ['期中', 15, 'midterm', null, 0],
      ['期末', 25, 'final', null, 0],
    ]);
    expect(r.items[2].max).toBe(10);
    // 实验写了 drop 没写次数：提示
    expect(r.notes.join()).toContain('没写次数');
  });

  it('中文：作业（10 次，去掉最低 1 次）20%、期中考试一 / 二、平时成绩（出勤）；迟交行忽略', () => {
    const r = parseSyllabus(zh);
    expect(rows(r.items)).toEqual([
      ['作业', 20, 'homework', 10, 1],
      ['期中一', 15, 'midterm', null, 0],
      ['期中二', 15, 'midterm', null, 0],
      ['实验', 10, 'lab', null, 0],
      ['出勤', 10, 'participation', null, 0],
      ['期末', 30, 'final', null, 0],
    ]);
    expect(r.courseName).toBe('数据结构');
    expect(r.unrecognized).toEqual([]);
  });

  it('extra credit → Bonus 行（up to 3%），不计入 100%；12 quizzes, lowest dropped', () => {
    const r = parseSyllabus(enExtraCredit);
    expect(rows(r.items.filter((i) => !i.bonus))).toEqual([
      ['测验', 10, 'quiz', 12, 1],
      ['作业', 20, 'homework', null, 0],
      ['期中', 25, 'midterm', null, 0],
      ['期末', 35, 'final', null, 0],
      ['出勤', 10, 'participation', null, 0],
    ]);
    const bonus = r.items.filter((i) => i.bonus);
    expect(bonus).toHaveLength(1);
    expect(bonus[0].weight).toBe(3);
    expect(bonus[0].kind).toBe('bonus');
    expect(weightTotal(r.items)).toBe(100);
  });

  it('按 points：各项按总分 1000 换算成百分比；10 × 15 pts → 10 次、每次满分 15；extra credit 20 分 → +2', () => {
    const r = parseSyllabus(enPoints);
    expect(r.mode).toBe('points');
    expect(rows(r.items.filter((i) => !i.bonus))).toEqual([
      ['作业', 15, 'homework', 10, 0],
      ['测验', 10, 'quiz', null, 0],
      ['期中', 25, 'midterm', null, 0],
      ['期末', 40, 'final', null, 0],
      ['项目', 10, 'project', null, 0],
    ]);
    expect(r.items[0].max).toBe(15);
    expect(r.items[2].max).toBe(250); // 按分数时该项总分就是满分
    expect(r.items.find((i) => i.bonus)?.weight).toBe(2);
    expect(r.notes.join()).toContain('1000');
  });

  it('两套方案（Option A / Option B）：只取第一套并提示', () => {
    const r = parseSyllabus(enOptions);
    expect(rows(r.items)).toEqual([
      ['作业', 20, 'homework', null, 0],
      ['期中', 30, 'midterm', null, 0],
      ['期末', 50, 'final', null, 0],
    ]);
    expect(r.notes.join()).toContain('只取了第一套');
  });

  it('PDF 抽出来的分列：名称一行、权重下一行；Two midterms (20% each) 拆成两行', () => {
    const r = parseSyllabus(enPdfColumns);
    expect(rows(r.items)).toEqual([
      ['作业', 20, 'homework', 10, 1],
      ['期中一', 20, 'midterm', null, 0],
      ['期中二', 20, 'midterm', null, 0],
      ['期末', 40, 'final', null, 0],
    ]);
    expect(r.items[3].source).toBe('Final exam / 40%');
  });

  it('中文一行多项：平时作业 20%，测验 10%，…；后文「测验共 6 次，取最好 5 次」；加分最多 2 分', () => {
    const r = parseSyllabus(zhMixed);
    expect(rows(r.items.filter((i) => !i.bonus))).toEqual([
      ['作业', 20, 'homework', null, 0],
      ['测验', 10, 'quiz', 6, 1],
      ['期中', 30, 'midterm', null, 0],
      ['期末', 40, 'final', null, 0],
    ]);
    expect(r.items.find((i) => i.bonus)?.weight).toBe(2);
    expect(r.courseName).toBe('线性代数');
  });

  it('一项都识别不到：mode = none，items 为空', () => {
    const r = parseSyllabus(none);
    expect(r.mode).toBe('none');
    expect(r.items).toEqual([]);
    expect(parseSyllabus('').items).toEqual([]);
  });
});

describe('规则识别：零散写法', () => {
  const one = (text: string) => rows(parseSyllabus(text).items);

  it('一行里多个百分比取最后一个；一行多项按逗号拆', () => {
    expect(one('Midterm 1 (covers 20% of chapters) 25%\nFinal 75%')[0]).toEqual(['期中一', 25, 'midterm', null, 0]);
    expect(one('Homework 20%, Midterm 30%, Final 50%')).toEqual([
      ['作业', 20, 'homework', null, 0],
      ['期中', 30, 'midterm', null, 0],
      ['期末', 50, 'final', null, 0],
    ]);
  });

  it('名称映射：hw / assignment / problem set / lab / attendance / Final Project 不算期末', () => {
    const r = parseSyllabus('HW 10%\nAssignments 10%\nPsets 10%\nLabs 10%\nAttendance 10%\nFinal Project 20%\nFinal 30%');
    expect(r.items.map((i) => [i.name, i.kind])).toEqual([
      ['作业', 'homework'], ['作业', 'homework'], ['作业', 'homework'], ['实验', 'lab'], ['出勤', 'participation'],
      ['项目', 'project'], ['期末', 'final'],
    ]);
    expect(finals(r.items)).toEqual(['期末']);
  });

  it('drop 的写法：drop the lowest / lowest two dropped / drop your 3 lowest / 去掉最低两次 / 最低的一次不计', () => {
    const k = (t: string) => parseSyllabus(t).items[0];
    expect(k('Quizzes 20% (10 quizzes, we drop the lowest)')).toMatchObject({ count: 10, drop: 1 });
    expect(k('Quizzes 20%: 10 quizzes, lowest two dropped')).toMatchObject({ count: 10, drop: 2 });
    expect(k('Labs 20%: 8 labs; we drop your 3 lowest')).toMatchObject({ count: 8, drop: 3 });
    expect(k('测验 20%（共 8 次，去掉最低两次）')).toMatchObject({ count: 8, drop: 2 });
    expect(k('实验 20%：6 次实验，最低的一次不计')).toMatchObject({ count: 6, drop: 1 });
  });

  it('满分：out of 50 / /50 / 满分 50', () => {
    expect(parseSyllabus('Midterm (out of 50) 30%').items[0].max).toBe(50);
    expect(parseSyllabus('Midterm /50 30%').items[0].max).toBe(50);
    expect(parseSyllabus('期中考试（满分 50）30%').items[0].max).toBe(50);
  });

  it('全文里的说明句补 drop / 次数：Your two lowest quiz scores will be dropped. There are 12 quizzes.', () => {
    expect(one('Quizzes 20%\nFinal 80%\n\nYour two lowest quiz scores will be dropped. There are 12 quizzes.')[0]).toEqual([
      '测验', 20, 'quiz', 12, 2,
    ]);
  });

  it('不认识的短名字保留原名；像句子的进「未识别」', () => {
    const r = parseSyllabus('Peer review 5%\nReading responses (weekly): 10%\nStudents who miss more than 20% of classes will fail.\nFinal 85%');
    expect(rows(r.items)).toEqual([
      ['Peer review', 5, 'other', null, 0],
      ['Reading responses', 10, 'other', null, 0],
      ['期末', 85, 'final', null, 0],
    ]);
    expect(r.unrecognized).toEqual(['Students who miss more than 20% of classes will fail.']);
  });

  it('「no extra credit」不生成 Bonus；只提到加分没写数时提示', () => {
    expect(parseSyllabus('There is no extra credit.\nHomework 50%\nFinal 50%').items.some((i) => i.bonus)).toBe(false);
    const r = parseSyllabus('Homework 50%\nFinal 50%\nExtra credit opportunities may be announced in class.');
    expect(r.items.some((i) => i.bonus)).toBe(false);
    expect(r.notes.join()).toContain('没写最多加多少');
  });

  it('同一项在表格和正文各写一遍：去重', () => {
    const r = parseSyllabus('Homework 20%\nFinal 80%\n\nHomework (20%): 10 assignments, lowest dropped.');
    expect(rows(r.items)).toEqual([
      ['作业', 20, 'homework', 10, 1],
      ['期末', 80, 'final', null, 0],
    ]);
  });

  it('等级表行（A: 93%、90% and above）不当评分项也不进未识别', () => {
    const r = parseSyllabus('A: 93%\nB+: 87%\n90% and above: A\nHomework 40%\nFinal 60%');
    expect(rows(r.items)).toEqual([
      ['作业', 40, 'homework', null, 0],
      ['期末', 60, 'final', null, 0],
    ]);
    expect(r.unrecognized).toEqual([]);
  });

  it('中英文数字', () => {
    expect([toNumber('8'), toNumber('eight'), toNumber('八'), toNumber('两'), toNumber('十二'), toNumber('二十'), toNumber('x')]).toEqual([
      8, 8, 8, 2, 12, 20, null,
    ]);
  });
});

// ───────────────────────── AI 回复 ─────────────────────────

const AI_JSON = `{
  "name": "MATH 221 Calculus I",
  "items": [
    { "id": "hw", "name": "作业", "weight": 20, "max": 100, "score": null,
      "advanced": { "count": 10, "maxEach": 10, "dropLowest": 1 } },
    { "id": "mid1", "name": "期中一", "weight": 20, "max": 100, "score": null, "advanced": null },
    { "id": "mid2", "name": "期中二", "weight": 20, "max": 100, "score": null, "advanced": null },
    { "id": "final", "name": "期末", "weight": 40, "max": 100, "score": null, "advanced": null }
  ],
  "bonus": { "name": "Extra credit", "max": 3, "score": null }
}`;

describe('AI 兜底', () => {
  it('提示词：带 syllabus 原文、字段说明和 final id 要求', () => {
    const p = buildAiPrompt('  Homework 20%\nFinal 80%  ');
    expect(p).toContain('Homework 20%\nFinal 80%');
    expect(p).toContain('"final"');
    expect(p).toContain('dropLowest');
    expect(p).toContain('"bonus"');
  });

  it('纯 JSON：解析成预览表的行', () => {
    const r = parseAiReply(AI_JSON);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.courseName).toBe('MATH 221 Calculus I');
    expect(r.items.map((i) => [i.name, i.weight, i.count, i.drop, i.max, i.final, i.bonus])).toEqual([
      ['作业', 20, 10, 1, 10, false, false],
      ['期中一', 20, null, 0, 100, false, false],
      ['期中二', 20, null, 0, 100, false, false],
      ['期末', 40, null, 0, 100, true, false],
      ['Extra credit', 3, null, 0, 100, false, true],
    ]);
  });

  it('带 ```json 围栏和前后文字', () => {
    const reply = `好的，这是根据 syllabus 整理的评分构成：\n\n\`\`\`json\n${AI_JSON}\n\`\`\`\n\n如有需要可以再调整。`;
    const r = parseAiReply(reply);
    expect(r.ok && r.items.length).toBe(5);
  });

  it('没有围栏、只有前后文字；还有结尾多余逗号、弯引号', () => {
    const messy = `Here you go: { "name": "X", "items": [ { “name”: "Homework", "weight": "30%", }, { "id": "final", "name": "Final", "weight": 70 }, ], "bonus": null } Hope this helps!`;
    const r = parseAiReply(messy);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items.map((i) => [i.name, i.weight, i.final, i.max])).toEqual([
      ['Homework', 30, false, 100],
      ['Final', 70, true, 100],
    ]);
  });

  it('权重写成小数（0.2）：乘 100 并提示；直接给了 items 数组也行', () => {
    const r = parseAiReply('[{"name":"作业","weight":0.3},{"name":"期末","weight":0.7}]');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items.map((i) => i.weight)).toEqual([30, 70]);
    expect(r.warnings.join()).toContain('小数');
    expect(r.items[1].final).toBe(true);
  });

  it('坏 JSON：说明哪里不对', () => {
    const cut = parseAiReply('```json\n{ "name": "X", "items": [ { "name": "作业", "weight": 20 }\n```');
    expect(cut.ok).toBe(false);
    if (!cut.ok) expect(cut.errors[0]).toContain('格式不对');

    const noJson = parseAiReply('抱歉，我无法读取这个文件。');
    expect(noJson.ok).toBe(false);
    if (!noJson.ok) expect(noJson.errors[0]).toContain('没找到 JSON');

    expect(parseAiReply('')).toEqual({ ok: false, errors: ['粘贴框是空的'] });
  });

  it('字段不对：逐条说明（缺 items、weight 不是数字、drop ≥ 次数、bonus.max 不对）', () => {
    const a = parseAiReply('{"name":"X"}');
    expect(a).toEqual({ ok: false, errors: ['缺少 items 数组（评分项列表）'] });

    const b = parseAiReply(
      '{"items":[{"name":"作业","weight":"二十"},{"name":"测验","weight":10,"advanced":{"count":5,"dropLowest":5}},{"weight":10}],"bonus":{"max":"很多"}}',
    );
    expect(b.ok).toBe(false);
    if (b.ok) return;
    expect(b.errors).toEqual([
      'items[0].weight（作业）不是数字',
      'items[1].advanced.dropLowest（测验）要少于次数 5',
      'items[2].name 缺失或不是文字',
      'bonus.max 不是 ≥ 0 的数字',
    ]);
  });

  it('extractJson 跳过字符串里的括号', () => {
    const r = extractJson('说明 {"name":"a } b","items":[]} 结束');
    expect('value' in r && (r.value as { name: string }).name).toBe('a } b');
  });
});

// ───────────────────────── 预览表与导入 ─────────────────────────

describe('预览表：合计、归一化、校验', () => {
  const base = parseSyllabus('Homework 20%\nMidterm 20%\nFinal 40%\nExtra credit up to 2%').items;

  it('权重合计不含 Bonus；归一化后合计 100，Bonus 不动', () => {
    expect(weightTotal(base)).toBe(80);
    expect(weightsOk(base)).toBe(false);
    const n = normalizeItems(base);
    expect(n.map((i) => i.weight)).toEqual([25, 25, 50, 2]);
    expect(weightsOk(n)).toBe(true);
  });

  it('归一化除不尽：1 位小数，差额补到最大项', () => {
    const n = normalizeItems(parseSyllabus('Homework 10%\nQuiz 10%\nFinal 10%').items);
    expect(n.map((i) => i.weight)).toEqual([33.4, 33.3, 33.3]);
    expect(weightTotal(n)).toBe(100);
  });

  it('校验：空名、负权重、drop ≥ 次数、没有普通项', () => {
    const items: SyllabusItem[] = [
      { ...base[0], name: ' ', count: 3, drop: 3 },
      { ...base[1], weight: -1 },
    ];
    const v = validateItems(items);
    expect(v.rows[0]).toEqual(['名称不能为空', '去掉的次数要少于总次数']);
    expect(v.rows[1]).toEqual(['权重要 ≥ 0']);
    expect(validateItems([base[3]]).errors).toEqual(['至少要有一个评分项（Bonus 不算）']);
    expect(validateItems(base).errors).toEqual([]);
  });
});

describe('导入后的课程结构', () => {
  it('drop-count 样本 → 课程：子项面板、期末 id = final、能算', () => {
    const { items } = parseSyllabus(enDropCount);
    const c = itemsToCourse(items, { id: 'c_test', name: 'ECON 201' });
    expect(c.items.map((i) => i.id)).toEqual(['hw', 'quiz', 'lab', 'mid', 'final']);
    expect(c.items[0].advanced).toEqual({
      count: 11, maxEach: 100, dropLowest: 2, scores: Array(11).fill(null), assumed: Array(11).fill(null),
    });
    expect(c.items[1].advanced?.dropLowest).toBe(2);
    // 实验没次数：普通行，满分 10
    expect(c.items[2].advanced).toBeUndefined();
    expect(c.items[2].max).toBe(10);
    expect(c.items.every((i) => i.score === null)).toBe(true);
    expect(isFinalItem(c.items[4])).toBe(true);
    expect(c.bonus).toBeNull();
    expect(c.gradeScale).toBe('us-10');
    // 存储的兜底不会改动它（数据模型合法）
    expect(sanitizeCourse(c)).toEqual(c);
    const r = computeCourse(c);
    expect(r.weightsOk).toBe(true);
    expect(r.required).toBeCloseTo(85, 6);
  });

  it('points 样本 → 课程：每次满分 15、期中满分 250、Bonus 上限 2', () => {
    const c = itemsToCourse(parseSyllabus(enPoints).items, { id: 'c_p', name: 'CS 101' });
    expect(c.items[0].advanced).toMatchObject({ count: 10, maxEach: 15, dropLowest: 0 });
    expect(c.items.find((i) => i.name === '期中')?.max).toBe(250);
    expect(c.bonus).toEqual({ name: 'Bonus', max: 2, score: null });
  });

  it('id 不重复：两行作业 → hw、hw2；勾了期末的那行 id = final', () => {
    const items = parseSyllabus('HW 10%\nAssignments 10%\nFinal 80%').items;
    const c = itemsToCourse(items, { id: 'x', name: 'y' });
    expect(c.items.map((i) => i.id)).toEqual(['hw', 'hw2', 'final']);
    // 用户把期末勾到别的行
    const moved = items.map((i, k) => ({ ...i, final: k === 0 }));
    expect(itemsToCourse(moved, { id: 'x', name: 'y' }).items.map((i) => i.id)).toEqual(['final', 'hw', 'final2']);
  });

  it('多条 Bonus 合成一行，上限相加', () => {
    const items: SyllabusItem[] = [
      ...parseSyllabus('Homework 100%').items,
      { name: 'EC 1', kind: 'bonus', weight: 1, max: 100, count: null, drop: 0, bonus: true, final: false, source: '' },
      { name: 'EC 2', kind: 'bonus', weight: 1.5, max: 100, count: null, drop: 0, bonus: true, final: false, source: '' },
    ];
    expect(itemsToCourse(items, { id: 'x', name: 'y' }).bonus).toEqual({ name: 'EC 1', max: 2.5, score: null });
  });

  it('AI 回复 → 课程 → importCourse：新建并切过去，同名自动加（2）', () => {
    const r = parseAiReply(AI_JSON);
    if (!r.ok) throw new Error('parse failed');
    let data = freshData();
    const course = itemsToCourse(r.items, { id: 'tmp', name: '微积分 I' });
    data = appReducer(data, { type: 'importCourse', course, mode: 'new' });
    const cur = currentCourse(data);
    expect(data.courses).toHaveLength(2);
    expect(cur.name).toBe('微积分 I（2）'); // 示例课程也叫「微积分 I」
    expect(cur.id).not.toBe('tmp');
    expect(cur.items.map((i) => i.id)).toEqual(['hw', 'mid', 'mid2', 'final']);
    expect(cur.items[0].advanced).toMatchObject({ count: 10, maxEach: 10, dropLowest: 1 });
    expect(cur.bonus).toEqual({ name: 'Extra credit', max: 3, score: null });
  });
});
