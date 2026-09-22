import { AgentMemoryLauncher } from '@/components/AgentMemoryLauncher';
import { HelpTutorialLauncher } from '@/components/HelpTutorialLauncher';
import { IdeaMergeLauncher } from '@/components/IdeaMergeLauncher';
import { MemoryCenterLauncher } from '@/components/MemoryCenterLauncher';
import { OperationsCenterLauncher } from '@/components/OperationsCenterLauncher';
import { SecuritySettingsLauncher } from '@/components/SecuritySettingsLauncher';
import { TraceabilityCenterLauncher } from '@/components/TraceabilityCenterLauncher';

export function FooterToolsMenu() {
  return (
    <details className="group relative">
      <summary
        className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1 font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        title="Open workspace tools"
      >
        <span aria-hidden="true">⌘</span>
        <span>Tools</span>
        <span className="text-[9px] text-slate-400 transition group-open:rotate-180" aria-hidden="true">▴</span>
      </summary>
      <div className="absolute bottom-8 start-0 z-[80] w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-2xl">
        <div className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Workspace tools</div>
        <div className="grid gap-1 [&>button]:w-full [&>button]:justify-start [&>button]:px-2.5 [&>button]:py-2 [&>button]:text-xs">
          <AgentMemoryLauncher />
          <MemoryCenterLauncher />
          <OperationsCenterLauncher />
          <TraceabilityCenterLauncher />
          <IdeaMergeLauncher />
          <HelpTutorialLauncher />
          <SecuritySettingsLauncher />
        </div>
      </div>
    </details>
  );
}
