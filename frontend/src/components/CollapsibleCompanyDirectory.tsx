import { useEffect, useRef, useState } from 'react';
import { CompanyPanel } from '@/components/CompanyPanel';
import { useClickOutside } from '@/lib/useClickOutside';
import { useIsCompactViewport } from '@/lib/useIsCompactViewport';
import { useWorkspaceStore } from '@/store/workspaceStore';

const COMPANY_DIRECTORY_PIN_KEY = 'virtual-company:ui:company-directory-pinned';

function initialPinnedState(): boolean {
  try {
    return localStorage.getItem(COMPANY_DIRECTORY_PIN_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function CollapsibleCompanyDirectory() {
  const compact = useIsCompactViewport();
  const [open, setOpen] = useState(!compact);
  const [pinned, setPinned] = useState(initialPinnedState);
  const panelRef = useRef<HTMLDivElement>(null);
  const agents = useWorkspaceStore(state => state.agents);
  const teams = useWorkspaceStore(state => state.teams);

  useEffect(() => {
    if (compact) setOpen(false);
  }, [compact]);

  useEffect(() => {
    try {
      localStorage.setItem(COMPANY_DIRECTORY_PIN_KEY, String(pinned));
    } catch {
      // Pinning is a UI preference; storage failure must not affect the panel.
    }
  }, [pinned]);

  useClickOutside(panelRef, open && (compact || !pinned), () => setOpen(false));

  if (!open) {
    return (
      <aside className="flex w-12 shrink-0 border-e border-slate-200 bg-white" aria-label="Collapsed Company Directory">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex h-full w-full flex-col items-center py-3 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
          title="Open Company Directory"
          aria-label="Open Company Directory"
        >
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-lg text-slate-500 shadow-sm transition group-hover:border-blue-200 group-hover:text-blue-600" aria-hidden="true">›</span>
          <span className="mt-3 text-base" aria-hidden="true">👥</span>
          <span className="mt-2 [writing-mode:vertical-rl] rotate-180 text-[10px] font-semibold uppercase tracking-wide">Company Directory</span>
          <span className="mt-3 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-600" title={`${agents.length} specialists · ${teams.length} teams`}>{agents.length}</span>
        </button>
      </aside>
    );
  }

  return (
    <>
      {compact ? <div className="fixed inset-0 z-40 bg-slate-950/40" onClick={() => setOpen(false)} aria-hidden="true" /> : null}
      <div
        ref={panelRef}
        className={compact
          ? 'fixed inset-y-0 start-0 z-50 flex w-[85vw] max-w-[318px] shadow-2xl'
          : 'relative flex w-[318px] shrink-0'}
      >
        <CompanyPanel />
        {!compact ? (
          <button
            type="button"
            onClick={() => setPinned(value => !value)}
            className={`absolute end-3 top-3 z-40 grid h-8 w-8 place-items-center rounded-lg border text-sm shadow-sm transition ${pinned ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700'}`}
            title={pinned ? 'Unpin Company Directory' : 'Pin Company Directory'}
            aria-label={pinned ? 'Unpin Company Directory' : 'Pin Company Directory'}
            aria-pressed={pinned}
          >
            📌
          </button>
        ) : null}
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
    </>
  );
}
