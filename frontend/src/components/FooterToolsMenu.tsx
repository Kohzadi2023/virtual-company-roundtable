import { useCallback, useState } from 'react';
import { AgentMemoryLauncher } from '@/components/AgentMemoryLauncher';
import { HelpTutorialLauncher } from '@/components/HelpTutorialLauncher';
import { IdeaMergeLauncher } from '@/components/IdeaMergeLauncher';
import { LlmSettingsLauncher } from '@/components/LlmSettingsLauncher';
import { MemoryCenterLauncher } from '@/components/MemoryCenterLauncher';
import { OperationsCenterLauncher } from '@/components/OperationsCenterLauncher';
import { SecuritySettingsLauncher } from '@/components/SecuritySettingsLauncher';
import { TraceabilityCenterLauncher } from '@/components/TraceabilityCenterLauncher';
import { useDismissibleMenu } from '@/lib/useDismissibleMenu';

export function FooterToolsMenu() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismissibleMenu<HTMLDivElement>(open, close);

  // The launchers render their own dialogs as siblings of their buttons inside
  // this panel, so the panel must stay mounted while a dialog is open. Closing
  // therefore hides only the menu chrome (heading and buttons), not the panel.
  const panelClass = open
    ? 'absolute bottom-8 start-0 z-[80] w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-2xl'
    : 'absolute bottom-8 start-0 [&>div>button]:hidden [&>.menu-heading]:hidden';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        title="Open workspace tools"
      >
        <span aria-hidden="true">⌘</span>
        <span>Tools</span>
        <span className={`text-[9px] text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true">▴</span>
      </button>
      <div className={panelClass}>
        <div className="menu-heading px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Workspace tools</div>
        <div
          className="grid gap-1 [&>button]:w-full [&>button]:justify-start [&>button]:px-2.5 [&>button]:py-2 [&>button]:text-xs"
          onClick={event => {
            // Choosing an item (which opens its own dialog) dismisses the menu.
            if (event.target instanceof Element && event.target.closest('button')) setOpen(false);
          }}
        >
          <AgentMemoryLauncher />
          <MemoryCenterLauncher />
          <OperationsCenterLauncher />
          <TraceabilityCenterLauncher />
          <IdeaMergeLauncher />
          <HelpTutorialLauncher />
          <LlmSettingsLauncher />
          <SecuritySettingsLauncher />
        </div>
      </div>
    </div>
  );
}
