import { useEffect } from 'react';
import { ChatRoom } from '@/components/ChatRoom';
import { CompanyPanel } from '@/components/CompanyPanel';
import { SyncBadge } from '@/components/SyncBadge';
import { bootstrapPersistence, startPersistence } from '@/lib/storage';
import { useWorkspaceStore } from '@/store/workspaceStore';

export default function App() {
  const hydrated = useWorkspaceStore(state => state.hydrated);
  const rooms = useWorkspaceStore(state => state.rooms);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const setActiveRoom = useWorkspaceStore(state => state.setActiveRoom);
  const createRoom = useWorkspaceStore(state => state.createRoom);
  const seedDefaultCompany = useWorkspaceStore(state => state.seedDefaultCompany);

  useEffect(() => {
    void bootstrapPersistence().finally(() => startPersistence());
  }, []);

  useEffect(() => {
    if (hydrated) seedDefaultCompany();
  }, [hydrated, seedDefaultCompany]);

  if (!hydrated) {
    return <div className="grid min-h-screen place-items-center bg-slate-950 text-slate-300" role="status">در حال بارگذاری شرکت مجازی…</div>;
  }

  return (
    <main className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-3 py-2">
        <div className="me-2">
          <strong className="block">Virtual Company Roundtable</strong>
          <span className="block text-[11px] text-slate-500">User directs fixed specialist Agents</span>
        </div>
        <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto" aria-label="اتاق‌ها">
          {rooms.map(room => (
            <button
              key={room.id}
              type="button"
              onClick={() => setActiveRoom(room.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs ${activeRoomId === room.id ? 'bg-indigo-600' : 'bg-slate-900 hover:bg-slate-800'}`}
            >
              {room.emoji} {room.name}
            </button>
          ))}
          <button type="button" onClick={() => createRoom(`Room ${rooms.length + 1}`)} className="whitespace-nowrap rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-900">+ Room</button>
        </nav>
        <SyncBadge />
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <CompanyPanel />
        {activeRoomId ? <ChatRoom roomId={activeRoomId} /> : <div className="grid flex-1 place-items-center text-slate-500">یک اتاق بسازید.</div>}
      </div>
    </main>
  );
}
