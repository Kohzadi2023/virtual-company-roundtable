import { useWorkspaceStore } from '@/store/workspaceStore';

const labels = {
  idle: 'Ready',
  saving: 'Saving',
  saved: 'Saved',
  offline: 'Offline',
  error: 'Error',
} as const;

const tones = {
  idle: 'bg-slate-400',
  saving: 'bg-amber-400',
  saved: 'bg-emerald-500',
  offline: 'bg-slate-400',
  error: 'bg-rose-500',
} as const;

export function SyncBadge() {
  const state = useWorkspaceStore(s => s.syncState);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500" role="status" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${tones[state]}`} aria-hidden="true" />
      {labels[state]}
    </span>
  );
}
