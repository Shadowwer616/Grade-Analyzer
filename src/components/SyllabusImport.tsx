// 阶段 6：从 syllabus 导入。三步弹窗（手机上是底部抽屉，Modal 自带）：
//   1 粘贴 / 上传（PDF 在浏览器里抽文字，不发到任何服务器）
//   2 识别预览（可编辑表格 + 原文片段 + 权重合计 / 归一化 + AI 兜底）
//   3 导入（课程名 → 创建课程并切过去）
import { useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { parseSyllabus, type ParseResult, type SyllabusItem } from '../lib/syllabusParser';
import {
  blankItem, buildAiPrompt, itemsToCourse, normalizeItems, parseAiReply, validateItems, weightTotal, weightsOk,
} from '../lib/syllabusImport';
import { readSyllabusFile } from '../lib/pdfText';
import { uniqueName } from '../state/appStore';
import { useApp } from '../state/CourseContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { copyText } from './CourseDialogs';
import { Modal, ModalActions } from './Modal';
import { btn, field, IconClose, IconPlus, IconTrash, IconUpload, NumberInput, trim1 } from './ui';

type Row = SyllabusItem & { key: number };
type Step = 1 | 2 | 3;

let keySeq = 0;
const withKeys = (items: SyllabusItem[]): Row[] => items.map((i) => ({ ...i, key: ++keySeq }));

const PLACEHOLDER = `把 syllabus 里讲成绩构成的部分粘到这里（整份粘进来也行），例如：

Homework (10 assignments, lowest dropped) 20%
Midterm 1 ........ 20%
Midterm 2 ........ 20%
Final Exam: 40%
Extra credit: up to 3%`;

export function SyllabusImportDialog({ onClose, initialName = '' }: { onClose: () => void; initialName?: string }) {
  const { data, dispatch, setNotice } = useApp();
  const mobile = useIsMobile();
  const [step, setStep] = useState<Step>(1);
  const [text, setText] = useState('');
  const [file, setFile] = useState<{ name: string; state: 'loading' | 'ok' | 'error'; msg?: string } | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [origin, setOrigin] = useState<'rules' | 'ai'>('rules');
  const [aiOpen, setAiOpen] = useState(false);
  const [name, setName] = useState(initialName);
  /** 用户自己填过名称（或从「新建课程」带来）就不再自动覆盖；否则跟着最新的识别结果走 */
  const [nameTouched, setNameTouched] = useState(initialName.trim() !== '');
  const editName = (n: string) => {
    setName(n);
    setNameTouched(true);
  };

  const runParse = () => {
    const r = parseSyllabus(text);
    setParsed(r);
    setRows(withKeys(r.items));
    setOrigin('rules');
    setAiOpen(r.items.length === 0);
    if (!nameTouched) setName(r.courseName ?? '');
    setStep(2);
  };

  const validation = useMemo(() => validateItems(rows), [rows]);
  const rowErrorCount = Object.keys(validation.rows).length;
  const canNext = rowErrorCount === 0 && validation.errors.length === 0;

  const finalName = uniqueName(name.trim() || '新课程', data.courses.map((c) => c.name));

  const create = () => {
    const course = itemsToCourse(rows, { id: 'import', name: finalName });
    dispatch({ type: 'importCourse', course, mode: 'new' });
    setNotice({ tone: 'info', text: `已从 syllabus 创建「${finalName}」` });
    onClose();
  };

  return (
    <Modal title="从 syllabus 导入" onClose={onClose} width={step === 2 ? 880 : 640} testId="syllabus-dialog">
      <Steps step={step} />

      {step === 1 && (
        <StepInput
          text={text}
          setText={setText}
          file={file}
          setFile={setFile}
        />
      )}

      {step === 2 && parsed && (
        <>
          <ParseSummary parsed={parsed} rows={rows} origin={origin} />
          <AiHelper
            syllabus={text}
            open={aiOpen}
            setOpen={setAiOpen}
            onItems={(items, courseName) => {
              setRows(withKeys(items));
              setOrigin('ai');
              if (!nameTouched && courseName) setName(courseName);
            }}
          />
          <PreviewTable rows={rows} setRows={setRows} rowErrors={validation.rows} mobile={mobile} />
          {parsed.unrecognized.length > 0 && origin === 'rules' && (
            <details className="rounded-[10px] bg-page px-3.5 py-2.5 text-xs text-muted" data-testid="unrecognized">
              <summary className="cursor-pointer font-medium">{parsed.unrecognized.length} 段带数字但没认出来的文字</summary>
              <ul className="mt-2 mb-0 flex list-none flex-col gap-1 pl-0">
                {parsed.unrecognized.map((u, k) => (
                  <li key={k} className="break-words font-mono">{u}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {step === 3 && (
        <StepCreate rows={rows} name={name} setName={editName} finalName={finalName} onSubmit={create} />
      )}

      <ModalActions>
        {step === 1 ? (
          <button type="button" onClick={onClose} className={`${btn.base} ${btn.outline}`}>取消</button>
        ) : (
          <button type="button" onClick={() => setStep((s) => (s - 1) as Step)} className={`${btn.base} ${btn.outline}`}>
            上一步
          </button>
        )}
        {step === 1 && (
          <button
            type="button"
            onClick={runParse}
            disabled={!text.trim() || file?.state === 'loading'}
            className={`${btn.base} ${btn.primary}`}
            data-testid="syllabus-parse"
          >
            识别
          </button>
        )}
        {step === 2 && (
          <button
            type="button"
            onClick={() => setStep(3)}
            disabled={!canNext}
            title={!canNext ? [...validation.errors, rowErrorCount ? `有 ${rowErrorCount} 行需要修改` : ''].filter(Boolean).join('；') : undefined}
            className={`${btn.base} ${btn.primary}`}
            data-testid="syllabus-next"
          >
            下一步
          </button>
        )}
        {step === 3 && (
          <button type="button" onClick={create} className={`${btn.base} ${btn.primary}`} data-testid="syllabus-create">
            创建课程
          </button>
        )}
      </ModalActions>
      {step === 2 && !canNext && (
        <p className="-mt-2 m-0 text-right text-xs text-bad mobile:text-left" data-testid="syllabus-block">
          {[...validation.errors, rowErrorCount ? `有 ${rowErrorCount} 行需要修改（见红字）` : ''].filter(Boolean).join('；')}
        </p>
      )}
    </Modal>
  );
}

// ───────────────────────── 步骤条 ─────────────────────────

function Steps({ step }: { step: Step }) {
  const names = ['粘贴 / 上传', '识别预览', '导入'];
  return (
    <ol className="m-0 -mt-1 flex list-none items-center gap-2 p-0 text-xs" aria-label="导入步骤">
      {names.map((n, k) => {
        const s = (k + 1) as Step;
        const state = s === step ? 'now' : s < step ? 'done' : 'todo';
        return (
          <li key={n} className="flex items-center gap-2" aria-current={state === 'now' ? 'step' : undefined}>
            {k > 0 && <span aria-hidden className="h-px w-4 bg-line mobile:w-2" />}
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                state === 'now' ? 'bg-ink text-white' : state === 'done' ? 'bg-assume-tint text-assume-dark' : 'bg-chip text-muted'
              }`}
            >
              {s}
            </span>
            <span className={state === 'now' ? 'font-semibold text-ink' : 'text-muted'}>{n}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ───────────────────────── 第 1 步 ─────────────────────────

function StepInput({
  text, setText, file, setFile,
}: {
  text: string;
  setText: (t: string) => void;
  file: { name: string; state: 'loading' | 'ok' | 'error'; msg?: string } | null;
  setFile: (f: { name: string; state: 'loading' | 'ok' | 'error'; msg?: string } | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const id = useId();

  const load = async (f: File) => {
    setFile({ name: f.name, state: 'loading' });
    try {
      const t = await readSyllabusFile(f);
      setText(t);
      setFile({ name: f.name, state: 'ok', msg: `已读取 ${t.length} 个字符，可以在上面检查或删改` });
    } catch (e) {
      setFile({ name: f.name, state: 'error', msg: e instanceof Error ? e.message : '读取失败' });
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) void load(f);
  };

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="text-[13px] font-medium text-muted">
        粘贴 syllabus 文字，或上传 PDF / .txt / .md
      </label>
      <div
        className={`relative rounded-[10px] ${drag ? 'ring-2 ring-assume' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        <textarea
          id={id}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          data-testid="syllabus-text"
          className={`${field.base} ${field.solid} block h-[260px] w-full resize-y px-3 py-2.5 font-mono text-[13px] leading-relaxed mobile:h-[220px]`}
        />
        {drag && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[10px] bg-assume-row/90 text-sm font-semibold text-assume-dark">
            松开即可读取文件
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <input
          ref={input}
          type="file"
          accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
          className="hidden"
          data-testid="syllabus-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void load(f);
            e.target.value = '';
          }}
        />
        <button type="button" onClick={() => input.current?.click()} className={`${btn.base} ${btn.outline} mobile:h-11`}>
          <IconUpload />
          上传文件
        </button>
        {text && (
          <button type="button" onClick={() => setText('')} className={`${btn.base} border-0 bg-transparent px-2 text-muted hover:text-ink`}>
            清空
          </button>
        )}
        <span className="text-xs text-muted">PDF 在你的浏览器里读取，不会上传到任何服务器。</span>
      </div>
      {file && (
        <p
          role={file.state === 'error' ? 'alert' : 'status'}
          data-testid="syllabus-file-status"
          className={`m-0 text-xs ${file.state === 'error' ? 'text-bad' : 'text-muted'}`}
        >
          {file.state === 'loading' ? `正在读取「${file.name}」…` : `「${file.name}」：${file.msg}`}
        </p>
      )}
    </div>
  );
}

// ───────────────────────── 第 2 步：识别结果 / 提示 ─────────────────────────

function ParseSummary({ parsed, rows, origin }: { parsed: ParseResult; rows: Row[]; origin: 'rules' | 'ai' }) {
  if (origin === 'rules' && parsed.items.length === 0) {
    return (
      <div role="alert" data-testid="syllabus-empty" className="rounded-[12px] border border-bad/30 bg-bad-tint px-4 py-3 text-sm text-bad">
        <strong>一项评分构成都没认出来。</strong>
        <span className="ml-1 text-xs">
          规则只认「名称 + 百分比 / 分数」这类写法。可以用下面的「让 AI 帮忙」：复制提示词给 Claude 或 ChatGPT，再把回复粘回来；也可以手动加行。
        </span>
      </div>
    );
  }
  const regular = rows.filter((r) => !r.bonus).length;
  const bonus = rows.length - regular;
  const notes = origin === 'rules' ? parsed.notes : [];
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-sm" data-testid="syllabus-summary">
        {origin === 'ai' ? '已用 AI 回复填入' : '识别出'} <strong>{regular}</strong> 个评分项{bonus ? ` + ${bonus} 行 Bonus` : ''}
        {parsed.mode === 'points' && origin === 'rules' ? '（按分数换算）' : ''}。每一格都可以改，灰字是识别依据的原文。
      </p>
      {notes.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 rounded-[10px] border border-assume-edge bg-assume-tint px-3.5 py-2.5 pl-3.5 text-xs text-assume-dark" data-testid="syllabus-notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ───────────────────────── AI 兜底 ─────────────────────────

function AiHelper({
  syllabus, open, setOpen, onItems,
}: {
  syllabus: string;
  open: boolean;
  setOpen: (o: boolean) => void;
  onItems: (items: SyllabusItem[], courseName: string | null) => void;
}) {
  const [reply, setReply] = useState('');
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [result, setResult] = useState<{ ok: true; n: number; warnings: string[] } | { ok: false; errors: string[] } | null>(null);
  const prompt = useMemo(() => buildAiPrompt(syllabus), [syllabus]);

  const apply = (t: string) => {
    if (!t.trim()) {
      setResult(null);
      return;
    }
    const r = parseAiReply(t);
    if (r.ok) {
      onItems(r.items, r.courseName);
      setResult({ ok: true, n: r.items.length, warnings: r.warnings });
    } else setResult(r);
  };

  return (
    <section className="rounded-[12px] border border-edge bg-head" data-testid="ai-helper">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-[12px] border-0 bg-transparent px-4 py-3 text-left mobile:min-h-12"
      >
        <span className="text-sm font-semibold">识别得不对？让 AI 帮忙</span>
        <span className="text-xs text-muted">{open ? '收起' : '展开'}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-divide px-4 pt-3 pb-4">
          <ol className="m-0 flex flex-col gap-1 pl-4 text-xs leading-relaxed text-muted">
            <li>点「复制提示词」，粘到 Claude 或 ChatGPT（提示词里已经带着你的 syllabus 原文）。</li>
            <li>把 AI 的整段回复粘到下面，会自动找出里面的 JSON 填进预览表。</li>
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => setCopied((await copyText(prompt)) ? 'ok' : 'fail')}
              className={`${btn.base} ${btn.primary} mobile:h-11`}
              data-testid="ai-copy"
            >
              {copied === 'ok' ? '已复制提示词' : '复制提示词'}
            </button>
            <span className="text-xs text-muted">不会连接任何 AI 服务，你自己粘过去。</span>
          </div>
          {copied === 'fail' && (
            <details open className="text-xs">
              <summary className="cursor-pointer text-bad">浏览器不让自动复制，请手动全选下面的提示词复制</summary>
              <textarea
                readOnly
                value={prompt}
                onFocus={(e) => e.target.select()}
                className={`${field.base} ${field.solid} mt-2 block h-32 w-full resize-y px-2 py-1.5 font-mono text-[11px]`}
              />
            </details>
          )}
          <textarea
            value={reply}
            onChange={(e) => {
              setReply(e.target.value);
              if (result) setResult(null);
            }}
            onPaste={(e) => {
              const t = e.clipboardData.getData('text');
              // 粘贴后立即解析；整段替换时 onChange 之后的值就是这段
              const el = e.currentTarget;
              setTimeout(() => apply(el.value || t), 0);
            }}
            placeholder="把 AI 的回复粘到这里（带 ```json 围栏、前后有说明文字都没关系）"
            spellCheck={false}
            data-testid="ai-reply"
            className={`${field.base} ${field.solid} block h-28 w-full resize-y px-3 py-2 font-mono text-xs`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => apply(reply)} disabled={!reply.trim()} className={`${btn.base} ${btn.outline} mobile:h-11`} data-testid="ai-apply">
              填入预览表
            </button>
            {result?.ok && (
              <span className="text-xs text-ok" role="status" data-testid="ai-ok">
                已填入 {result.n} 行，下面的表格已替换为 AI 的结果
              </span>
            )}
          </div>
          {result && !result.ok && (
            <ul role="alert" data-testid="ai-errors" className="m-0 flex flex-col gap-0.5 rounded-[10px] bg-bad-tint px-3.5 py-2.5 pl-7 text-xs text-bad">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {result?.ok && result.warnings.length > 0 && (
            <ul className="m-0 flex flex-col gap-0.5 pl-4 text-xs text-bonus-dark">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// ───────────────────────── 预览表 ─────────────────────────

function PreviewTable({
  rows, setRows, rowErrors, mobile,
}: {
  rows: Row[];
  setRows: (f: (r: Row[]) => Row[]) => void;
  rowErrors: Record<number, string[]>;
  mobile: boolean;
}) {
  const total = weightTotal(rows);
  const ok = weightsOk(rows);
  const hasRegular = rows.some((r) => !r.bonus);

  const update = (key: number, patch: Partial<SyllabusItem>) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.key === key) {
          const next = { ...r, ...patch };
          if (patch.bonus) next.final = false;
          return next;
        }
        // 期末只能有一行
        return patch.final ? { ...r, final: false } : r;
      }),
    );
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));
  const addRow = () => setRows((rs) => [...rs, ...withKeys([blankItem()])]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">评分构成</span>
        <span
          data-testid="preview-total"
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ok ? 'bg-ok-tint text-ok' : 'bg-bonus-tint text-bonus-dark'}`}
        >
          权重合计 {trim1(total)}%{ok ? '' : ' · 应为 100%'}
        </span>
      </div>

      {!ok && hasRegular && (
        <div role="status" data-testid="preview-weight-banner" className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-bonus-edge bg-bonus-tint px-4 py-2.5">
          <span className="text-xs text-bonus-dark">
            <strong className="text-sm">权重合计 {trim1(total)}%，应为 100%。</strong>
            <span className="ml-1">{total > 0 ? '可以一键按比例改成合计 100%（Bonus 不算在内）。' : '先给评分项填上权重。'}</span>
          </span>
          <button
            type="button"
            onClick={() => setRows((rs) => normalizeItems(rs))}
            disabled={total <= 0}
            className={`${btn.base} border border-bonus-edge bg-white font-semibold text-bonus-dark hover:bg-bonus-row mobile:h-11`}
            data-testid="preview-normalize"
          >
            按比例归一化
          </button>
        </div>
      )}

      {mobile ? (
        <div className="flex flex-col gap-2.5">
          {rows.map((r, k) => (
            <RowCard key={r.key} row={r} errors={rowErrors[k]} update={update} remove={remove} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-edge">
          <table className="w-full min-w-[760px] border-collapse text-sm" data-testid="preview-table">
            <thead>
              <tr className="bg-head text-left text-xs font-semibold text-muted">
                <th className="px-3 py-2 font-semibold">名称</th>
                <th className="w-[92px] px-2 py-2 font-semibold">权重 %</th>
                <th className="w-[84px] px-2 py-2 font-semibold" title="有次数时为每次满分">满分</th>
                <th className="w-[72px] px-2 py-2 font-semibold" title="留空 = 只有一次">次数</th>
                <th className="w-[80px] px-2 py-2 font-semibold">去掉最低</th>
                <th className="w-[56px] px-2 py-2 text-center font-semibold">Bonus</th>
                <th className="w-[48px] px-2 py-2 text-center font-semibold">期末</th>
                <th className="w-[44px] px-2 py-2" aria-label="删除" />
              </tr>
            </thead>
            {rows.map((r, k) => (
              <RowLine key={r.key} row={r} errors={rowErrors[k]} update={update} remove={remove} />
            ))}
          </table>
        </div>
      )}
      <button type="button" onClick={addRow} className={`${btn.base} ${btn.outline} self-start mobile:h-11 mobile:self-stretch`} data-testid="preview-add">
        <IconPlus />
        加一行
      </button>
    </div>
  );
}

const cell = `${field.base} ${field.solid} w-full`;

interface RowProps {
  row: Row;
  errors?: string[];
  update: (key: number, patch: Partial<SyllabusItem>) => void;
  remove: (key: number) => void;
}

function Source({ row, errors }: { row: Row; errors?: string[] }) {
  return (
    <>
      {row.source && (
        <span className="block break-words text-xs text-muted" title="识别来源">
          {row.source}
        </span>
      )}
      {errors && errors.length > 0 && <span className="block text-xs text-bad">{errors.join('；')}</span>}
      {!row.bonus && row.count === null && row.drop > 0 && !errors?.length && (
        <span className="block text-xs text-bonus-dark">写了去掉最低 {row.drop} 次，但没有次数：填上次数才会生效</span>
      )}
    </>
  );
}

function RowLine({ row: r, errors, update, remove }: RowProps) {
  const bad = !!errors?.length;
  return (
    <tbody className={`border-t border-divide ${r.bonus ? 'bg-bonus-row' : ''}`} data-testid="preview-row">
      <tr>
        <td className="px-3 pt-2.5 pb-1">
          <input
            value={r.name}
            onChange={(e) => update(r.key, { name: e.target.value })}
            placeholder="名称"
            aria-label="名称"
            className={`${cell} ${bad && !r.name.trim() ? 'border-bad' : ''}`}
          />
        </td>
        <td className="px-2 pt-2.5 pb-1">
          <NumberInput
            value={r.weight}
            onValue={(v) => update(r.key, { weight: v ?? 0 })}
            aria-label={r.bonus ? '最多加分' : '权重'}
            title={r.bonus ? 'Bonus：最多给总评加几分，不计入 100%' : undefined}
            className={cell}
          />
        </td>
        <td className="px-2 pt-2.5 pb-1">
          <NumberInput value={r.bonus ? null : r.max} onValue={(v) => update(r.key, { max: v ?? 100 })} disabled={r.bonus} aria-label="满分" className={`${cell} disabled:bg-page`} />
        </td>
        <td className="px-2 pt-2.5 pb-1">
          <NumberInput
            value={r.bonus ? null : r.count}
            allowEmpty
            onValue={(v) => update(r.key, { count: v === null || v <= 0 ? null : v })}
            disabled={r.bonus}
            placeholder="—"
            aria-label="次数"
            className={`${cell} disabled:bg-page`}
          />
        </td>
        <td className="px-2 pt-2.5 pb-1">
          <NumberInput
            value={r.bonus ? null : r.drop}
            onValue={(v) => update(r.key, { drop: v ?? 0 })}
            disabled={r.bonus}
            aria-label="去掉最低几次"
            className={`${cell} disabled:bg-page`}
          />
        </td>
        <td className="px-2 pt-2.5 pb-1 text-center">
          <input type="checkbox" checked={r.bonus} onChange={(e) => update(r.key, { bonus: e.target.checked })} aria-label="是 Bonus" className="h-4 w-4 accent-bonus" />
        </td>
        <td className="px-2 pt-2.5 pb-1 text-center">
          <input type="checkbox" checked={r.final} disabled={r.bonus} onChange={(e) => update(r.key, { final: e.target.checked })} aria-label="是期末" className="h-4 w-4 accent-assume" />
        </td>
        <td className="px-2 pt-2.5 pb-1">
          <button type="button" onClick={() => remove(r.key)} aria-label={`删除 ${r.name || '这一行'}`} className={btn.icon}>
            <IconTrash />
          </button>
        </td>
      </tr>
      <tr>
        <td colSpan={8} className="px-3 pt-0 pb-2.5">
          <Source row={r} errors={errors} />
        </td>
      </tr>
    </tbody>
  );
}

function MiniField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
      {label}
      {children}
    </label>
  );
}

function RowCard({ row: r, errors, update, remove }: RowProps) {
  const f = `${cell} h-11! disabled:bg-page`;
  return (
    <div className={`flex flex-col gap-2.5 rounded-[12px] border px-3 py-3 ${r.bonus ? 'border-bonus-edge bg-bonus-row' : 'border-edge bg-white'}`} data-testid="preview-row">
      <div className="flex items-center gap-2">
        <input value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} placeholder="名称" aria-label="名称" className={`${cell} h-11! flex-1`} />
        <button type="button" onClick={() => remove(r.key)} aria-label={`删除 ${r.name || '这一行'}`} className={`${btn.icon} h-11! w-11!`}>
          <IconClose />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MiniField label={r.bonus ? '最多加分' : '权重 %'}>
          <NumberInput value={r.weight} onValue={(v) => update(r.key, { weight: v ?? 0 })} className={f} />
        </MiniField>
        <MiniField label={r.count !== null ? '每次满分' : '满分'}>
          <NumberInput value={r.bonus ? null : r.max} onValue={(v) => update(r.key, { max: v ?? 100 })} disabled={r.bonus} className={f} />
        </MiniField>
        <MiniField label="次数（空 = 一次）">
          <NumberInput value={r.bonus ? null : r.count} allowEmpty onValue={(v) => update(r.key, { count: v === null || v <= 0 ? null : v })} disabled={r.bonus} placeholder="—" className={f} />
        </MiniField>
        <MiniField label="去掉最低">
          <NumberInput value={r.bonus ? null : r.drop} onValue={(v) => update(r.key, { drop: v ?? 0 })} disabled={r.bonus} className={f} />
        </MiniField>
      </div>
      <div className="flex gap-5 text-sm">
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={r.bonus} onChange={(e) => update(r.key, { bonus: e.target.checked })} className="h-5 w-5 accent-bonus" />
          Bonus
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={r.final} disabled={r.bonus} onChange={(e) => update(r.key, { final: e.target.checked })} className="h-5 w-5 accent-assume" />
          期末
        </label>
      </div>
      <Source row={r} errors={errors} />
    </div>
  );
}

// ───────────────────────── 第 3 步 ─────────────────────────

function summarize(r: SyllabusItem): string {
  if (r.bonus) return `${r.name} · 最多 +${trim1(r.weight)}`;
  const parts = [`${r.name} ${trim1(r.weight)}%`];
  if (r.count !== null) parts.push(`${r.count} 次${r.drop ? ` · 去掉最低 ${r.drop} 次` : ''}${r.max !== 100 ? ` · 每次满分 ${trim1(r.max)}` : ''}`);
  else if (r.max !== 100) parts.push(`满分 ${trim1(r.max)}`);
  if (r.final) parts.push('期末');
  return parts.join(' · ');
}

function StepCreate({
  rows, name, setName, finalName, onSubmit,
}: {
  rows: Row[];
  name: string;
  setName: (n: string) => void;
  finalName: string;
  onSubmit: () => void;
}) {
  const ok = weightsOk(rows);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
        课程名称
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如 线性代数"
          maxLength={60}
          data-testid="syllabus-name"
          className={`${field.base} ${field.solid} h-9 text-[15px] mobile:h-11 mobile:text-base`}
        />
        {finalName !== name.trim() && (
          <span className="text-xs font-normal text-bonus-dark">
            {name.trim() ? `已有同名课程，会保存为「${finalName}」` : `没填名称，会叫「${finalName}」`}
          </span>
        )}
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">将创建 {rows.filter((r) => !r.bonus).length} 个评分项</span>
        <ul className="m-0 flex list-none flex-col gap-1 rounded-[10px] bg-page px-3.5 py-2.5 pl-3.5 text-sm" data-testid="syllabus-final-list">
          {rows.map((r) => (
            <li key={r.key} className={r.bonus ? 'text-bonus-dark' : ''}>{summarize(r)}</li>
          ))}
        </ul>
        {!ok && (
          <span className="text-xs text-bonus-dark">
            权重合计 {trim1(weightTotal(rows))}%，不是 100%。导入后评分表上方会有黄色提示条，也可以回上一步归一化。
          </span>
        )}
        <span className="text-xs text-muted">分数都留空（未完成），目标默认 85，等级表默认美式 10 分制，导入后都能改。</span>
      </div>
    </form>
  );
}
