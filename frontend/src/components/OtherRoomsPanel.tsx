import { useRef, useState } from 'react';
import { SyncBadge } from '@/components/SyncBadge';
import { useClickOutside } from '@/lib/useClickOutside';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function OtherRoomsPanel() {
  const rooms = useWorkspaceStore(state => state.rooms);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const setActiveRoom = useWorkspaceStore(state => state.setActiveRoom);
  const [open, setOpen] = useState(true);
  const panelRef = useRef<HTMLElement>(null);

  useClickOutside(panelRef, open, () => setOpen(false));

  if (!open) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center border-s border-slate-200 bg-white py-3" aria-label="Collapsed Other Rooms">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-lg text-slate-500 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
          title="Open Other Rooms"
          aria-label="Open Other Rooms"
        >
          ‹
        </button>
        <span className="mt-3 text-base" aria-hidden="true">🗂️</span>
        <span className="mt-2 [writing-mode:vertical-rl] text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Other Rooms
        </span>
        <span className="mt-3 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">{rooms.length}</span>
      </aside>
    );
  }

  return (
    <aside ref={panelRef} className="relative flex w-[286px] shrink-0 flex-col border-s border-slate-200 bg-[#fbfcfe]" aria-label="Other Rooms">
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="absolute -start-3 top-1/2 z-30 grid h-10 w-6 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-500 shadow-md transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
        title="Collapse Other Rooms"
        aria-label="Collapse Other Rooms"
      >
        ›
      </button>

      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-bold text-[#111b3a]">Other Rooms</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">Your discussion rooms</p>
          </div>
          <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-600">{rooms.length}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {rooms.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-400">
            No rooms yet. Create one from Room Settings.
          </div>
        ) : (
          <div className="space-y-1.5">
            {rooms.map(room => {
              const active = room.id === activeRoomId;
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => setActiveRoom(room.id)}
                  className={`w-full rounded-lg border p-2.5 text-start transition ${active ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50'}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex items-center gap-2">
                      <span className="text-base" aria-hidden="true">{room.emoji}</span>
                      <span className="truncate text-[12px] font-semibold text-slate-800">{room.name}</span>
                    </span>
                    {active ? <span className="text-[9px] font-semibold text-blue-600">ACTIVE</span> : null}
                  </span>
                  <span className="mt-1.5 block text-[10px] text-slate-400">{room.agentIds.length} specialists · {room.messages.length} messages</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>{rooms.length} rooms</span>
          <SyncBadge />
        </div>
      </div>
    </aside>
  );
}
