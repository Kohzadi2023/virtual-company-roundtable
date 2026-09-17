import { useState } from 'react';
import { Toast, type ToastMessage } from '@/components/Toast';
import { copyText } from '@/lib/clipboard';
import { buildFullChatText } from '@/lib/fullChat';
import { useWorkspaceStore } from '@/store/workspaceStore';

function CompanyLogo() {
  return (
    <span className="grid h-10 w-10 place-items-center text-blue-600" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current" aria-hidden="true">
        <circle cx="12" cy="7" r="3" />
        <circle cx="5" cy="9" r="2.4" />
        <circle cx="19" cy="9" r="2.4" />
        <path d="M7.2 19.5v-2.4c0-2.6 2.1-4.7 4.8-4.7s4.8 2.1 4.8 4.7v2.4H7.2Z" />
        <path d="M1.4 19v-1.6c0-2.2 1.7-4 3.9-4 1 0 1.9.4 2.6 1-1.1 1.1-1.8 2.7-1.8 4.4v.2H1.4ZM22.6 19h-4.7v-.2c0-1.7-.7-3.3-1.8-4.4.7-.6 1.6-1 2.6-1 2.2 0 3.9 1.8 3.9 4V19Z" />
      </svg>
    </span>
  );
}

export function TopBar() {
  const rooms = useWorkspaceStore(state => state.rooms);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const setActiveRoom = useWorkspaceStore(state => state.setActiveRoom);
  const createRoom = useWorkspaceStore(state => state.createRoom);
  const activeRoom = rooms.find(room => room.id === activeRoomId);
  const [roomMenuOpen, setRoomMenuOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const copyFullChat = async () => {
    if (!activeRoom || activeRoom.messages.length === 0) return;
    try {
      await copyText(buildFullChatText(activeRoom));
      setToast({ id: Date.now(), text: 'Full chat copied to clipboard.', tone: 'success' });
    } catch {
      setToast({ id: Date.now(), text: 'Could not copy the chat.', tone: 'error' });
    }
  };

  return (
    <>
      <header className="relative z-40 flex h-16 shrink-0 border-b border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex w-[318px] shrink-0 items-center gap-3 border-e border-slate-200 px-5">
          <CompanyLogo />
          <div className="min-w-0">
            <div className="truncate text-[20px] font-bold tracking-tight text-[#111b3a]">Virtual Company</div>
            <div className="truncate text-[13px] text-slate-500">AI-Powered Team Collaboration</div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-3 px-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600" aria-hidden="true">▣</div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-bold text-[#111b3a]">{activeRoom?.name ?? 'Product Architecture Discussion'}</h1>
            <p className="truncate text-[13px] text-slate-500">Discuss · Analyze · Challenge · Build Better</p>
          </div>

          <div className="relative flex items-center gap-2">
            <button
              type="button"
              onClick={copyFullChat}
              disabled={!activeRoom || activeRoom.messages.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-500 bg-white px-3 py-2 text-[13px] font-semibold text-blue-600 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden="true">⧉</span> Copy Full Chat
            </button>

            <button
              type="button"
              onClick={() => setRoomMenuOpen(value => !value)}
              aria-expanded={roomMenuOpen}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <span aria-hidden="true">⚙</span> Room Settings
            </button>

            <button type="button" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-lg text-slate-500 hover:bg-slate-50" aria-label="More options">⋮</button>

            <div className="ms-2 flex items-center gap-2 border-s border-slate-200 ps-4">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">U</span>
              <div>
                <div className="text-[13px] font-semibold text-slate-900">User</div>
                <div className="text-[11px] text-slate-500">Owner</div>
              </div>
              <span className="text-slate-400" aria-hidden="true">⌄</span>
            </div>

            {roomMenuOpen && (
              <div className="absolute end-24 top-11 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                <div className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Rooms</div>
                {rooms.map(room => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => { setActiveRoom(room.id); setRoomMenuOpen(false); }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm ${room.id === activeRoomId ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    <span>{room.emoji}</span><span className="truncate">{room.name}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { createRoom(`Room ${rooms.length + 1}`); setRoomMenuOpen(false); }}
                  className="mt-1 w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  + New Room
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
