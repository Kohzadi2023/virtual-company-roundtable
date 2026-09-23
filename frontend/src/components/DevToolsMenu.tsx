import { useState } from 'react';
import { downloadDebugSnapshot } from '@/lib/devDebugSnapshot';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function DevToolsMenu() {
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const [lastExported, setLastExported] = useState<string | null>(null);

  const exportSnapshot = () => {
    const file = downloadDebugSnapshot(activeRoomId ?? undefined);
    setLastExported(file.filename);
  };

  return (
    <details className="group relative">
      <summary
        className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1 font-semibold text-amber-700 transition hover:bg-amber-50 hover:text-amber-900"
        title="Open developer diagnostics"
      >
        <span aria-hidden="true">🛠</span>
        <span>Dev</span>
        <span className="text-[9px] text-amber-500 transition group-open:rotate-180" aria-hidden="true">▴</span>
      </summary>
      <div className="absolute bottom-8 start-0 z-[90] w-72 rounded-xl border border-amber-200 bg-white p-2 shadow-2xl">
        <div className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-600">Developer diagnostics</div>
        <button
          type="button"
          onClick={exportSnapshot}
          className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-start text-xs text-slate-700 transition hover:bg-amber-50 hover:text-slate-950"
        >
          <span className="mt-0.5" aria-hidden="true">📄</span>
          <span>
            <span className="block font-bold">Export Debug Snapshot</span>
            <span className="mt-0.5 block leading-4 text-slate-500">Active room, messages, orchestration, Olivia staffing/readiness, workspace membership, sync state, and storage sizes.</span>
          </span>
        </button>
        <div className="mt-1 border-t border-slate-100 px-2.5 pt-2 text-[10px] leading-4 text-slate-400">
          Message text from the active room is included. Raw storage values and linked-chat URLs are not exported.
          {lastExported ? <span className="mt-1 block truncate text-emerald-600">✓ {lastExported}</span> : null}
        </div>
      </div>
    </details>
  );
}
