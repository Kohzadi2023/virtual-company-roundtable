import { useWorkspaceStore } from '@/store/workspaceStore';

const labels = {
  idle: 'Ready',
  saving: 'Saving',
  saved: 'Saved',
  offline: 'Offline',
  error: 'Not saved',
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
    <span
      className="inline-flex items-center gap-1.5 text-[12px] text-slate-500"
      role="status"
      aria-live="polite"
      title={state === 'error' ? 'Your latest changes could not be saved in this browser. Export a backup (Settings) and free some storage.' : undefined}
    >
      <span className={`h-2 w-2 rounded-full ${tones[state]}`} aria-hidden="true" />
      {labels[state]}
    </span>
  );
}
