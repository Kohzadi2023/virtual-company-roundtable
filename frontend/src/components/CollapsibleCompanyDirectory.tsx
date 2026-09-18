import { useState } from 'react';
import { CompanyPanel } from '@/components/CompanyPanel';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function CollapsibleCompanyDirectory() {
  const [open, setOpen] = useState(true);
  const agents = useWorkspaceStore(state => state.agents);
  const teams = useWorkspaceStore(state => state.teams);

  if (!open) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center border-e border-slate-200 bg-white py-3" aria-label="Collapsed Company Directory">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-lg text-slate-500 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
          title="Open Company Directory"
          aria-label="Open Company Directory"
        >
          ›
        </button>
        <span className="mt-3 text-base" aria-hidden="true">👥</span>
        <span className="mt-2 [writing-mode:vertical-rl] rotate-180 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Company Directory
        </span>
        <span className="mt-3 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-600" title={`${agents.length} specialists · ${teams.length} teams`}>
          {agents.length}
        </span>
      </aside>
    );
  }

  return (
    <div className="relative flex w-[318px] shrink-0">
      <CompanyPanel />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="absolute -end-3 top-1/2 z-30 grid h-10 w-6 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-500 shadow-md transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
        title="Collapse Company Directory"
        aria-label="Collapse Company Directory"
      >
        ‹
      </button>
    </div>
  );
}
