import { useEffect } from 'react';

export type ToastMessage = {
  id: number;
  text: string;
  tone?: 'success' | 'error' | 'info';
};

export function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, 2400);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;
  const toneClass = toast.tone === 'error'
    ? 'border-rose-700 bg-rose-950 text-rose-100'
    : toast.tone === 'info'
      ? 'border-sky-700 bg-sky-950 text-sky-100'
      : 'border-emerald-700 bg-emerald-950 text-emerald-100';

  return (
    <div className={`fixed bottom-5 start-1/2 z-[100] -translate-x-1/2 rounded-xl border px-4 py-3 text-sm shadow-2xl ${toneClass}`} role="status" aria-live="polite">
      {toast.text}
    </div>
  );
}
