// 「我的预设」管理（阶段 5）：改名、删除。
// 课程选用预设时是把档位复制进 customScale 的，所以改名 / 删除预设都不影响已经用它的课程。
import { useState } from 'react';
import type { MyScale } from '../types';
import { useApp } from '../state/CourseContext';
import { useConfirm } from './Confirm';
import { Modal, ModalActions } from './Modal';
import { btn, field, IconTrash, trim1 } from './ui';

export function MyScalesDialog({ onClose }: { onClose: () => void }) {
  const { data } = useApp();
  return (
    <Modal title="我的预设" onClose={onClose} testId="my-scales">
      <p className="-mt-2 m-0 text-xs leading-relaxed text-muted">
        预设是所有课程共用的等级表。课程选用时会把档位复制一份，所以这里改名或删除，不影响已经在用它的课程。
      </p>
      {data.myScales.length === 0 ? (
        <p className="m-0 rounded-[10px] bg-page px-4 py-6 text-center text-sm text-muted">
          还没有预设。在自定义等级表里勾「存为我的预设」就会出现在这里。
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {data.myScales.map((s) => (
            <PresetRow key={s.id} scale={s} others={data.myScales.filter((x) => x.id !== s.id).map((x) => x.name)} />
          ))}
        </ul>
      )}
      <ModalActions>
        <button type="button" onClick={onClose} className={`${btn.base} ${btn.outline}`}>完成</button>
      </ModalActions>
    </Modal>
  );
}

function PresetRow({ scale, others }: { scale: MyScale; others: string[] }) {
  const { dispatch } = useApp();
  const confirm = useConfirm();
  const [name, setName] = useState(scale.name);
  const trimmed = name.trim();
  const error = !trimmed ? '名称不能为空' : others.includes(trimmed) ? '已有同名预设' : '';

  // 失焦或回车时保存；不合法就退回原名
  const commit = () => {
    if (error) setName(scale.name);
    else if (trimmed !== scale.name) dispatch({ type: 'renameMyScale', id: scale.id, name: trimmed });
  };

  const remove = async () => {
    const ok = await confirm({
      title: '删除预设',
      message: `删除预设「${scale.name}」？\n已经用它的课程会保留自己的等级表，不受影响。`,
      confirmLabel: '删除',
      danger: true,
    });
    if (ok) dispatch({ type: 'deleteMyScale', id: scale.id });
  };

  return (
    <li className="flex flex-col gap-1.5 rounded-[10px] border border-edge px-3 py-2.5" data-testid={`preset-${scale.id}`}>
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          maxLength={40}
          aria-label={`预设「${scale.name}」的名称`}
          aria-invalid={!!error}
          className={`${field.base} ${field.solid} min-w-0 flex-1 font-semibold mobile:h-11 ${error ? 'border-bad' : ''}`}
        />
        <button
          type="button"
          onClick={remove}
          aria-label={`删除预设「${scale.name}」`}
          title="删除预设"
          className={`${btn.icon} hover:border-bad-tint hover:bg-bad-tint hover:text-bad mobile:h-11 mobile:w-11`}
        >
          <IconTrash />
        </button>
      </div>
      <span className={`text-xs ${error ? 'text-bad' : 'text-muted'}`}>
        {error || scale.entries.map(([l, m]) => `${l} ≥${trim1(m)}`).join(' · ')}
      </span>
    </li>
  );
}
