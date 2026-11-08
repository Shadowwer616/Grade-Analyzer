// 阶段 4 的弹窗：新建课程、重命名、分享链接、分享链接同名导入。
import { useEffect, useState } from 'react';
import type { Course } from '../types';
import { TEMPLATES, type TemplateId } from '../data/templates';
import { buildShareUrl } from '../lib/share';
import { uniqueName } from '../state/appStore';
import { useApp } from '../state/CourseContext';
import { Modal } from './Modal';
import { btn, field } from './ui';

// ───────────────────────── 新建课程 ─────────────────────────

export function NewCourseDialog({ onClose }: { onClose: () => void }) {
  const { data, dispatch } = useApp();
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<TemplateId>('hw-mid-final');
  const taken = data.courses.map((c) => c.name);
  const finalName = uniqueName(name.trim() || '新课程', taken);

  const create = () => {
    dispatch({ type: 'createCourse', name: finalName, template });
    onClose();
  };

  return (
    <Modal title="新建课程" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          create();
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
            className={`${field.base} ${field.solid} h-9 text-[15px]`}
          />
          {name.trim() && finalName !== name.trim() && (
            <span className="text-xs font-normal text-bonus-dark">已有同名课程，会保存为「{finalName}」</span>
          )}
        </label>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[13px] font-medium text-muted">模板</legend>
          {TEMPLATES.map((t) => (
            <label
              key={t.id}
              className={`flex cursor-pointer items-center gap-3 rounded-[10px] border px-3.5 py-2.5 ${
                template === t.id ? 'border-assume bg-assume-row' : 'border-edge bg-white hover:bg-page'
              }`}
            >
              <input
                type="radio"
                name="template"
                value={t.id}
                checked={template === t.id}
                onChange={() => setTemplate(t.id)}
                className="accent-assume"
              />
              <span className="flex flex-col">
                <span className="text-sm font-semibold">{t.name}</span>
                <span className="text-xs text-muted">{t.detail}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={`${btn.base} ${btn.outline}`}>取消</button>
          <button type="submit" className={`${btn.base} ${btn.primary}`}>创建</button>
        </div>
      </form>
    </Modal>
  );
}

// ───────────────────────── 重命名 ─────────────────────────

export function RenameDialog({ course, onClose }: { course: Course; onClose: () => void }) {
  const { data, dispatch } = useApp();
  const [name, setName] = useState(course.name);
  const trimmed = name.trim();
  const clash = data.courses.some((c) => c.id !== course.id && c.name.trim() === trimmed);

  return (
    <Modal title="重命名课程" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!trimmed || clash) return;
          dispatch({ type: 'renameCourse', id: course.id, name: trimmed });
          onClose();
        }}
      >
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
          课程名称
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.target.select()}
            maxLength={60}
            className={`${field.base} ${field.solid} h-9 text-[15px]`}
          />
          <span className="min-h-4 text-xs font-normal text-bad">
            {!trimmed ? '名称不能为空' : clash ? '已有同名课程' : ''}
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={`${btn.base} ${btn.outline}`}>取消</button>
          <button type="submit" disabled={!trimmed || clash} className={`${btn.base} ${btn.primary}`}>保存</button>
        </div>
      </form>
    </Modal>
  );
}

// ───────────────────────── 分享链接 ─────────────────────────

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 非 https 或权限被拒时退回老办法
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function ShareDialog({ course, onClose }: { course: Course; onClose: () => void }) {
  const [url] = useState(() => buildShareUrl(course, window.location.href));
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [qr, setQr] = useState<{ svg: string } | { error: string } | null>(null);

  useEffect(() => {
    let alive = true;
    // 二维码库按需加载，不拖慢首屏
    import('qrcode')
      .then((QR) => QR.toString(url, { type: 'svg', errorCorrectionLevel: 'L', margin: 1, color: { dark: '#16181d', light: '#ffffff' } }))
      .then((svg) => alive && setQr({ svg }))
      .catch(() => alive && setQr({ error: '链接太长，生成不了二维码；请用复制链接' }));
    return () => {
      alive = false;
    };
  }, [url]);

  const copy = async () => setCopied((await copyText(url)) ? 'ok' : 'fail');

  return (
    <Modal title={`分享「${course.name}」`} onClose={onClose} width={480}>
      <p className="-mt-2 m-0 text-xs leading-relaxed text-muted">
        链接里包含这门课的全部设置和分数（含假设、子项、等级表）。对方打开后会导入为一门新课程，不会和你的数据同步。
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          aria-label="分享链接"
          data-testid="share-url"
          className={`${field.base} ${field.solid} min-w-0 flex-1 font-mono text-xs text-muted`}
        />
        <button type="button" onClick={copy} className={`${btn.base} ${btn.primary} shrink-0`}>
          {copied === 'ok' ? '已复制' : '复制链接'}
        </button>
      </div>
      {copied === 'fail' && <span className="-mt-2 text-xs text-bad">浏览器不让自动复制，请手动选中上面的链接复制</span>}

      <div className="flex flex-col items-center gap-2 rounded-[10px] bg-page px-4 py-4">
        {qr === null && <span className="py-16 text-xs text-muted">正在生成二维码…</span>}
        {qr && 'svg' in qr && (
          <div
            className="h-[200px] w-[200px] [&>svg]:h-full [&>svg]:w-full"
            role="img"
            aria-label="分享链接二维码"
            dangerouslySetInnerHTML={{ __html: qr.svg }}
          />
        )}
        {qr && 'error' in qr && <span className="py-6 text-xs text-muted">{qr.error}</span>}
        <span className="text-xs text-muted">手机扫码打开</span>
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={onClose} className={`${btn.base} ${btn.outline}`}>完成</button>
      </div>
    </Modal>
  );
}

// ───────────────────────── 同名导入 ─────────────────────────

export function ImportConflictDialog() {
  const { data, conflict, resolveConflict } = useApp();
  if (!conflict) return null;
  const newName = uniqueName(conflict.name, data.courses.map((c) => c.name));

  return (
    <Modal title="已有同名课程" onClose={() => resolveConflict(null)}>
      <p className="m-0 text-sm leading-relaxed">
        分享链接里的课程叫「<strong>{conflict.name}</strong>」，你这里已经有一门同名课程。要怎么导入？
      </p>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => resolveConflict('saveAs')}
          className="flex cursor-pointer flex-col items-start gap-0.5 rounded-[10px] border border-edge bg-white px-3.5 py-2.5 text-left hover:border-assume hover:bg-assume-row"
        >
          <span className="text-sm font-semibold">另存为「{newName}」</span>
          <span className="text-xs text-muted">保留你原来的课程，另外新建一门</span>
        </button>
        <button
          type="button"
          onClick={() => resolveConflict('overwrite')}
          className="flex cursor-pointer flex-col items-start gap-0.5 rounded-[10px] border border-edge bg-white px-3.5 py-2.5 text-left hover:border-bad hover:bg-bad-tint"
        >
          <span className="text-sm font-semibold text-bad">覆盖「{conflict.name}」</span>
          <span className="text-xs text-muted">原来那门课的设置和分数会被替换，不能撤销</span>
        </button>
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={() => resolveConflict(null)} className={`${btn.base} ${btn.outline}`}>不导入</button>
      </div>
    </Modal>
  );
}
