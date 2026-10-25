import { ChevronLeft } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

export const money = (value: number, digits = 2) =>
  `${value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })} USDT`;

export function signed(value: number, digits = 2) {
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

/** Loads data with optional polling; keeps showing the last result while refreshing. */
export function usePolling<T>(load: () => Promise<T>, intervalMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    try { setData(await loadRef.current()); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong'); }
  }, []);

  useEffect(() => {
    void refresh();
    if (!intervalMs) return;
    const timer = window.setInterval(() => void refresh(), intervalMs);
    return () => window.clearInterval(timer);
  }, [refresh, intervalMs]);

  return { data, error, refresh, setData };
}

export function BrandMark({ size = 40 }: { size?: number }) {
  return <span style={{ width: size, height: size }} className="grid place-items-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-base font-black text-white shadow-sm">H</span>;
}

/** Sub-page header with a back button, for screens opened from Home or Mine. */
export function SubHeader({ title, right }: { title: string; right?: ReactNode }) {
  const navigate = useNavigate();
  return <header className="sticky top-0 z-20 flex items-center justify-between bg-white/95 px-4 py-3 backdrop-blur">
    <button type="button" aria-label="Back" onClick={() => navigate(-1)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-slate-100"><ChevronLeft className="h-6 w-6" /></button>
    <h1 className="text-lg font-semibold">{title}</h1>
    <div className="flex h-10 w-10 items-center justify-end">{right}</div>
  </header>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-white p-4 shadow-sm ${className}`}>{children}</section>;
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-slate-400">{children}</p>;
}

export function PrimaryButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={`rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 ${className}`}>{children}</button>;
}

export function SecondaryButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={`rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-40 ${className}`}>{children}</button>;
}

export function ConfirmSheet({ open, title, message, confirmLabel, busy, onCancel, onConfirm }: {
  open: boolean; title: string; message: string; confirmLabel: string; busy?: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40" role="dialog" aria-modal="true" onClick={() => !busy && onCancel()}>
    <div className="w-full max-w-[480px] rounded-t-3xl bg-white p-6 pb-8" onClick={(event) => event.stopPropagation()}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <SecondaryButton disabled={busy} onClick={onCancel}>Cancel</SecondaryButton>
        <PrimaryButton disabled={busy} onClick={onConfirm}>{busy ? 'Please wait…' : confirmLabel}</PrimaryButton>
      </div>
    </div>
  </div>;
}
