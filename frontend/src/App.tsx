import { useEffect } from 'react';
import { AppLockGate } from '@/components/AppLockGate';
import { ChatRoom } from '@/components/ChatRoom';
import { CollapsibleCompanyDirectory } from '@/components/CollapsibleCompanyDirectory';
import { OtherRoomsPanel } from '@/components/OtherRoomsPanel';
import { TopBar } from '@/components/TopBar';
import { ensureMeetingFacilitatorMembership } from '@/lib/roomMembershipActions';
import { bootstrapPersistence, startPersistence } from '@/lib/storage';
import { useWorkspaceStore } from '@/store/workspaceStore';

const APP_VERSION = import.meta.env.VITE_APP_VERSION?.trim() || '1.10.0';

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

  return (
    <AppLockGate>
      <main className="flex h-screen min-w-[1180px] flex-col overflow-hidden bg-[#f7f9fc] text-slate-900">
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

        <footer className="flex h-8 shrink-0 items-center border-t border-slate-200 bg-white px-4 text-[11px] text-slate-500">
          <div className="shrink-0">▣ &nbsp; Virtual Company &nbsp; v{APP_VERSION}</div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-5 pe-1">
            <span>📁 {projects.length} projects</span>
            <span className="h-3 w-px bg-slate-200" aria-hidden="true" />
            <span>✓ {actionItems.filter(item => item.status !== 'done').length} open actions</span>
            <span className="h-3 w-px bg-slate-200" aria-hidden="true" />
            <span>💡 {agents.length} specialists</span>
            <span className="h-3 w-px bg-slate-200" aria-hidden="true" />
            <span>{teams.length} teams</span>
            <span className="h-3 w-px bg-slate-200" aria-hidden="true" />
            <span>{roles.length} professional matrices</span>
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" title="System ready" aria-label="System ready" />
          </div>
        </footer>
      </main>
    </AppLockGate>
  );
}
