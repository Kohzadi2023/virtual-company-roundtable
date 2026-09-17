import { useWorkspaceStore } from '@/store/workspaceStore';

const labels = {
  idle: 'آماده',
  saving: 'در حال ذخیره',
  saved: 'ذخیره شد',
  offline: 'آفلاین — ذخیره محلی فعال',
  error: 'خطای ذخیره محلی',
} as const;

export function SyncBadge() {
  const state = useWorkspaceStore(s => s.syncState);
  return (
    <span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300" role="status" aria-live="polite">
      {labels[state]}
    </span>
  );
}
