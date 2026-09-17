import { useEffect } from 'react';
import { ChatRoom } from '@/components/ChatRoom';
import { CompanyPanel } from '@/components/CompanyPanel';
import { TopBar } from '@/components/TopBar';
import { bootstrapPersistence, startPersistence } from '@/lib/storage';
import { useWorkspaceStore } from '@/store/workspaceStore';

export default function App() {
  const hydrated = useWorkspaceStore(state => state.hydrated);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const agents = useWorkspaceStore(state => state.agents);
  const roles = useWorkspaceStore(state => state.roles);
  const seedDefaultCompany = useWorkspaceStore(state => state.seedDefaultCompany);

  useEffect(() => {
    let cancelled = false;

    void bootstrapPersistence().then(() => {
      if (cancelled) return;

      // Repair any stale persisted built-ins before persistence starts.
      // Starting persistence first guarantees that the canonical 15-person
      // workforce is immediately written back to local + remote storage.
      startPersistence();
      seedDefaultCompany();
    });

    return () => {
      cancelled = true;
    };
  }, [seedDefaultCompany]);

  if (!hydrated) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f9fc] text-slate-500" role="status">
        Loading Virtual Company…
      </div>
    );
  }

  return (
    <main className="flex h-screen min-w-[1180px] flex-col overflow-hidden bg-[#f7f9fc] text-slate-900">
      <TopBar />

      <div className="flex min-h-0 flex-1">
        <CompanyPanel />
        {activeRoomId ? (
          <ChatRoom roomId={activeRoomId} />
        ) : (
          <div className="grid flex-1 place-items-center text-slate-400">Create a room to start a discussion.</div>
        )}
      </div>

      <footer className="flex h-8 shrink-0 items-center border-t border-slate-200 bg-white px-4 text-[11px] text-slate-500">
        <div className="w-[318px] shrink-0">▣ &nbsp; Virtual Company &nbsp; v1.3.1</div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-5 pe-1">
          <span>💡 {agents.length} team members</span>
          <span className="h-3 w-px bg-slate-200" aria-hidden="true" />
          <span>{roles.length} roles active</span>
          <span className="h-3 w-px bg-slate-200" aria-hidden="true" />
          <span>Productive discussions build better products</span>
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" title="System ready" aria-label="System ready" />
        </div>
      </footer>
    </main>
  );
}
