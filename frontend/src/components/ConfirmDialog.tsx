import { useEffect, useRef } from 'react';

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'default',
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const actionClass = tone === 'danger'
    ? 'bg-rose-400 text-slate-950 hover:bg-rose-300'
    : 'bg-cyan-400 text-slate-950 hover:bg-cyan-300';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a1728] p-5 shadow-2xl sm:p-6"
      >
        <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${tone === 'danger' ? 'bg-rose-400/10 text-rose-300' : 'bg-cyan-400/10 text-cyan-300'}`} aria-hidden="true">
          <span className="text-xl">{tone === 'danger' ? '!' : '→'}</span>
        </div>
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-slate-100">{title}</h2>
        <p id="confirm-dialog-description" className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-400">{description}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] disabled:opacity-50">Cancel</button>
          <button type="button" disabled={busy} onClick={onConfirm} className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${actionClass}`}>{busy ? 'Working…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
