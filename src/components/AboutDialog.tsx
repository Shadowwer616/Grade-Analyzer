// 页脚「关于」小弹窗（阶段 5）：一句话用法、数据存哪、分享链接怎么用、坏数据备份怎么找回。
import { useState } from 'react';
import { BACKUP_KEY, STORAGE_KEY } from '../lib/storage';
import { Modal, ModalActions } from './Modal';
import { btn } from './ui';

function readBackup(): string | null {
  try {
    return window.localStorage.getItem(BACKUP_KEY);
  } catch {
    return null;
  }
}

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const [backup] = useState(readBackup);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');

  const copyBackup = async () => {
    if (!backup) return;
    try {
      await navigator.clipboard.writeText(backup);
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
  };

  const h = 'm-0 text-sm font-semibold text-ink';
  const p = 'm-0 text-[13px] leading-relaxed text-muted';
  const code = 'rounded bg-page px-1 py-0.5 font-mono text-[12px] text-ink';

  return (
    <Modal title="关于成绩计算器" onClose={onClose} width={480} testId="about-dialog">
      <section className="flex flex-col gap-1">
        <h3 className={h}>怎么用</h3>
        <p className={p}>
          填好每一项的权重和已得分，还没出分的留空；拖动目标滑块，就能看到剩下的项各要考多少。点「假设」可以先填一个预计分数试算。
        </p>
      </section>
      <section className="flex flex-col gap-1">
        <h3 className={h}>数据存在哪</h3>
        <p className={p}>
          只存在这台设备的这个浏览器里（localStorage，键 <code className={code}>{STORAGE_KEY}</code>），改动自动保存，不上传任何服务器，也没有账号。清除浏览器数据或用隐私模式会丢失。
        </p>
      </section>
      <section className="flex flex-col gap-1">
        <h3 className={h}>分享链接</h3>
        <p className={p}>
          「分享链接」把当前这门课压缩进链接 <code className={code}>#c=…</code> 后面，数据只在链接里，不经过服务器。对方打开（或手机扫二维码）就会导入为一门新课程，之后两边各改各的、不同步；遇到同名课程可以选「另存为」或「覆盖」。换设备、换浏览器时也用它把课程带过去。
        </p>
      </section>
      <section className="flex flex-col gap-1.5">
        <h3 className={h}>数据坏了怎么找回</h3>
        <p className={p}>
          如果打开时发现保存的数据有损坏，页面会尽量恢复，并把原始内容备份在 <code className={code}>{BACKUP_KEY}</code>（只保留最近一次）。找回方法：桌面浏览器按 F12 打开开发者工具 → Application（应用）→ Local Storage → 本站，复制这个键的值；或直接点下面的按钮复制，再发给能帮你修的人。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyBackup}
            disabled={!backup}
            className={`${btn.base} ${btn.outline} h-8! text-[13px] mobile:h-11!`}
            data-testid="copy-backup"
          >
            {copied === 'ok' ? '已复制备份' : '复制备份内容'}
          </button>
          <span className={`text-xs ${copied === 'fail' ? 'text-bad' : 'text-muted'}`}>
            {!backup ? '这个浏览器里目前没有备份，说明还没遇到过坏数据' : copied === 'fail' ? '浏览器不让自动复制，请用开发者工具查看' : `约 ${backup.length} 字符`}
          </span>
        </div>
      </section>
      <ModalActions>
        <button type="button" onClick={onClose} className={`${btn.base} ${btn.primary}`}>知道了</button>
      </ModalActions>
    </Modal>
  );
}
