import { useEffect } from 'react';
import { AdvancedCommandPalette } from '@/components/AdvancedCommandPalette';
import { AgentMemoryDialogHost } from '@/components/AgentMemoryDialogHost';
import { AgentQuickActionsHost } from '@/components/AgentQuickActionsHost';
import { AppLockGate } from '@/components/AppLockGate';
import { ChatRoom } from '@/components/ChatRoom';
import { CollapsibleCompanyDirectory } from '@/components/CollapsibleCompanyDirectory';
import { DevToolsMenu } from '@/components/DevToolsMenu';
import { FooterToolsMenu } from '@/components/FooterToolsMenu';
import { MemoryCenterDialogHost } from '@/components/MemoryCenterDialogHost';
import { MemoryV2Runtime } from '@/components/MemoryV2Runtime';
import { OperationsCompletionRuntime } from '@/components/OperationsCompletionRuntime';
import { OtherRoomsPanel } from '@/components/OtherRoomsPanel';
import { TopBar } from '@/components/TopBar';
import { getRoomLanguage } from '@/lib/languages';
import { ensureMeetingFacilitatorMembership } from '@/lib/roomMembershipActions';
import { bootstrapPersistence, startPersistence } from '@/lib/storage';
import { useWorkspaceStore } from '@/store/workspaceStore';

const APP_VERSION = import.meta.env.VITE_APP_VERSION?.trim() || '2.8.10';
// Dev diagnostics export room/session data, so keep them out of any build
// that opts out explicitly (a public deployment sets VITE_ENABLE_DEV_TOOLS=
// 'false'). Local `npm run dev` and any other build keep the current
// always-on behavior.
const devToolsEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_TOOLS !== 'false';

export default function App() {
  const hydrated = useWorkspaceStore(state => state.hydrated);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const rooms = useWorkspaceStore(state => state.rooms);
  const agents = useWorkspaceStore(state => state.agents);
  const roles = useWorkspaceStore(state => state.roles);
  const teams = useWorkspaceStore(state => state.teams);
  const projects = useWorkspaceStore(state => state.projects);
  const actionItems = useWorkspaceStore(state => state.actionItems);
  const seedDefaultCompany = useWorkspaceStore(state => state.seedDefaultCompany);

  useEffect(() => {
    let cancelled = false;

    void bootstrapPersistence().then(() => {
      if (cancelled) return;
      startPersistence();
      seedDefaultCompany();
    });

    return () => {
      cancelled = true;
    };
  }, [seedDefaultCompany]);

  useEffect(() => {
    if (!hydrated || rooms.length === 0 || agents.length === 0) return;
    ensureMeetingFacilitatorMembership();
  }, [hydrated, rooms, agents]);

  if (!hydrated) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f9fc] text-slate-500" role="status">
        Loading Virtual Company…
      </div>
    );
  }

  const activeRoom = rooms.find(room => room.id === activeRoomId);
  const roomLanguage = getRoomLanguage(activeRoom?.languageCode);
  const openActionCount = actionItems.filter(item => item.status !== 'done').length;

  return (
    <AppLockGate>
      <main
        dir="ltr"
        data-room-language={roomLanguage.code}
        className="flex h-screen min-w-0 flex-col overflow-hidden bg-[#f7f9fc] text-slate-900 lg:min-w-[1180px]"
      >
        <MemoryV2Runtime />
        <OperationsCompletionRuntime />
        <AdvancedCommandPalette />
        <AgentQuickActionsHost />
        <TopBar />

        <div className="flex min-h-0 flex-1">
          <CollapsibleCompanyDirectory />
          {activeRoomId ? (
            <ChatRoom roomId={activeRoomId} />
          ) : (
            <div className="grid min-w-0 flex-1 place-items-center text-slate-400">Create a room to start a discussion.</div>
          )}
          <OtherRoomsPanel />
        </div>

        <footer className="flex h-9 shrink-0 items-center border-t border-slate-200 bg-white px-4 text-[11px] text-slate-500">
          <div className="flex shrink-0 items-center gap-2">
            <span className="font-medium text-slate-600">▣ Virtual Company v{APP_VERSION}</span>
            <span className="h-3 w-px bg-slate-200" aria-hidden="true" />
            <FooterToolsMenu />
            {devToolsEnabled ? (
              <>
                <span className="h-3 w-px bg-slate-200" aria-hidden="true" />
                <DevToolsMenu />
              </>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-3 pe-1">
            <span className="rounded-md bg-slate-50 px-2 py-1" title="Projects in the current workspace">📁 {projects.length}</span>
            <span className="rounded-md bg-slate-50 px-2 py-1" title="Open action items">✓ {openActionCount}</span>
            <span
              className="rounded-md bg-slate-50 px-2 py-1"
              title={`${teams.length} teams · ${roles.length} professional matrices`}
            >
              💡 {agents.length}
            </span>
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" title="System ready" aria-label="System ready" />
          </div>
        </footer>
        <AgentMemoryDialogHost />
        <MemoryCenterDialogHost />
      </main>
    </AppLockGate>
  );
}
