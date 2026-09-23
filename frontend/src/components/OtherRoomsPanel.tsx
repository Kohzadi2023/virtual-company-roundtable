import { useEffect, useRef, useState } from 'react';
import { MeetingMinutesDialog } from '@/components/MeetingMinutesDialog';
import { SyncBadge } from '@/components/SyncBadge';
import { Toast, type ToastMessage } from '@/components/Toast';
import { copyText } from '@/lib/clipboard';
import { buildFullChatText } from '@/lib/fullChat';
import { deleteRoom } from '@/lib/roomActions';
import { useClickOutside } from '@/lib/useClickOutside';
import { useIsCompactViewport } from '@/lib/useIsCompactViewport';
import { useWorkspaceStore } from '@/store/workspaceStore';

const OPEN_ROOM_SETTINGS_EVENT = 'virtual-company:open-room-settings';

export function OtherRoomsPanel() {
  const rooms = useWorkspaceStore(state => state.rooms);
  const projects = useWorkspaceStore(state => state.projects);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const setActiveRoom = useWorkspaceStore(state => state.setActiveRoom);
  const compact = useIsCompactViewport();
  const [open, setOpen] = useState(!compact);
  const [minutesRoomId, setMinutesRoomId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const visibleRooms = rooms.filter(room => !room.archivedAt);
  const archivedCount = rooms.length - visibleRooms.length;

  // Same reasoning as CollapsibleCompanyDirectory: on a phone-width viewport
  // this panel's fixed width doesn't fit beside the room content, so it
  // starts closed and opens as a full overlay instead of an in-flow column.
  useEffect(() => {
    if (compact) setOpen(false);
  }, [compact]);

  useClickOutside(panelRef, open && !minutesRoomId, () => setOpen(false));

  const handleDelete = (roomId: string, roomName: string) => {
    if (!window.confirm(`Delete room “${roomName}” and all of its messages? This cannot be undone.`)) return;
    if (minutesRoomId === roomId) setMinutesRoomId(null);
    deleteRoom(roomId);
  };

  const handleCopyFullChat = async (roomId: string) => {
    const room = rooms.find(item => item.id === roomId);
    if (!room || room.messages.length === 0) return;

    try {
      await copyText(buildFullChatText(room));
      setToast({ id: Date.now(), text: `${room.name}: full chat copied.`, tone: 'success' });
    } catch {
      setToast({ id: Date.now(), text: 'Could not copy the full chat.', tone: 'error' });
    }
  };

  const handleOpenSettings = (roomId: string) => {
    setActiveRoom(roomId);
    window.dispatchEvent(new CustomEvent(OPEN_ROOM_SETTINGS_EVENT, { detail: { roomId } }));
  };

  if (!open) {
    return (
      <aside className="flex w-12 shrink-0 border-s border-slate-200 bg-white" aria-label="Collapsed Other Rooms">
        <button type="button" onClick={() => setOpen(true)} className="group flex h-full w-full flex-col items-center py-3 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500" title="Open Other Rooms" aria-label="Open Other Rooms">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-lg text-slate-500 shadow-sm transition group-hover:border-blue-200 group-hover:text-blue-600" aria-hidden="true">‹</span>
          <span className="mt-3 text-base" aria-hidden="true">🗂️</span>
          <span className="mt-2 [writing-mode:vertical-rl] text-[10px] font-semibold uppercase tracking-wide">Other Rooms</span>
          <span className="mt-3 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">{visibleRooms.length}</span>
        </button>
      </aside>
    );
  }

  return (
    <>
      {compact ? (
        <div className="fixed inset-0 z-40 bg-slate-950/40" onClick={() => setOpen(false)} aria-hidden="true" />
      ) : null}
      <aside
        ref={panelRef}
        className={compact
          ? 'fixed inset-y-0 end-0 z-50 flex w-[85vw] max-w-[338px] flex-col bg-[#fbfcfe] shadow-2xl'
          : 'relative flex w-[338px] shrink-0 flex-col border-s border-slate-200 bg-[#fbfcfe]'}
        aria-label="Other Rooms"
      >
        <button type="button" onClick={() => setOpen(false)} className="absolute -start-3 top-1/2 z-30 grid h-10 w-6 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-500 shadow-md transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600" title="Collapse Other Rooms" aria-label="Collapse Other Rooms">›</button>

        <div className="border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-[14px] font-bold text-[#111b3a]">Other Rooms</h2><p className="mt-0.5 text-[11px] text-slate-400">Active discussion rooms</p></div>
            <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-600">{visibleRooms.length}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {visibleRooms.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-400">No active rooms. Create one from Room Settings or restore an archived room from Workspace.</div>
          ) : (
            <div className="space-y-1.5">
              {visibleRooms.map(room => {
                const active = room.id === activeRoomId;
                const hasMessages = room.messages.length > 0;
                const project = projects.find(item => item.id === room.projectId);
                return (
                  <div key={room.id} className={`rounded-lg border p-2.5 transition ${active ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/50'}`}>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setActiveRoom(room.id)} className="min-w-0 flex flex-1 items-center gap-2 text-start" title={`Open ${room.name}`}><span className="text-base" aria-hidden="true">{room.emoji}</span><span className="truncate text-[12px] font-semibold text-slate-800">{room.name}</span></button>
                      <button type="button" onClick={() => setMinutesRoomId(room.id)} disabled={!hasMessages} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[13px] text-blue-600 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent" title={hasMessages ? 'Meeting Minutes' : 'No messages for Meeting Minutes'} aria-label={`Meeting Minutes for ${room.name}`}>▤</button>
                      <button type="button" onClick={() => void handleCopyFullChat(room.id)} disabled={!hasMessages} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[13px] text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent" title={hasMessages ? 'Copy Full Chat' : 'No messages to copy'} aria-label={`Copy Full Chat for ${room.name}`}>⧉</button>
                      <button type="button" onClick={() => handleOpenSettings(room.id)} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[13px] text-slate-500 transition hover:bg-slate-100 hover:text-slate-800" title="Room Settings" aria-label={`Room Settings for ${room.name}`}>⚙</button>
                      <button type="button" onClick={() => handleDelete(room.id, room.name)} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[13px] text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" title="Delete Room" aria-label={`Delete ${room.name}`}>⌫</button>
                    </div>
                    <button type="button" onClick={() => setActiveRoom(room.id)} className="mt-1.5 flex w-full items-center justify-between gap-2 text-start"><span className="min-w-0 truncate text-[10px] text-slate-400">{project ? `${project.emoji} ${project.name} · ` : ''}{room.agentIds.length} specialists · {room.messages.length} messages</span>{active ? <span className="text-[9px] font-semibold text-blue-600">ACTIVE</span> : null}</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 bg-white px-3 py-2">
          <div className="flex items-center justify-between text-[11px] text-slate-500"><span>{visibleRooms.length} active · {archivedCount} archived · {projects.length} projects</span><SyncBadge /></div>
        </div>
      </aside>

      <MeetingMinutesDialog roomId={minutesRoomId} onClose={() => setMinutesRoomId(null)} />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}