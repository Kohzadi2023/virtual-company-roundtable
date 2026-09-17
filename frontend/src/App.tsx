import { useEffect } from 'react';
import { ChatRoom } from '@/components/ChatRoom';
import { CompanyPanel } from '@/components/CompanyPanel';
import { TopBar } from '@/components/TopBar';
import { bootstrapPersistence, startPersistence } from '@/lib/storage';
import { useWorkspaceStore } from '@/store/workspaceStore';

export default function App() {
  const hydrated = useWorkspaceStore(state => state.hydrated);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const seedDefaultCompany = useWorkspaceStore(state => state.seedDefaultCompany);

  useEffect(() => {
    void bootstrapPersistence().finally(() => startPersistence());
  }, []);

  useEffect(() => {
    if (hydrated) seedDefaultCompany();
  }, [hydrated, seedDefaultCompany]);

  if (!hydrated) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 text-slate-500" role="status">
        Loading Virtual Company…
      </div>
    );
  }

  return (
    <main className="flex h-screen min-w-[320px] flex-col overflow-hidden bg-slate-50 text-slate-900">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <CompanyPanel />
        {activeRoomId ? (
          <ChatRoom roomId={activeRoomId} />
        ) : (
          <div className="grid flex-1 place-items-center text-slate-400">Create a room to start a discussion.</div>
        )}
      </div>
    </main>
  );
}
