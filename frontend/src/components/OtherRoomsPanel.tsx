import { useEffect, useMemo, useRef, useState } from 'react';
import { MeetingMinutesDialog } from '@/components/MeetingMinutesDialog';
import { SyncBadge } from '@/components/SyncBadge';
import { Toast, type ToastMessage } from '@/components/Toast';
import { copyText } from '@/lib/clipboard';
import { buildFullChatText } from '@/lib/fullChat';
import { deleteRoom } from '@/lib/roomActions';
import { groupRoomsByProject } from '@/lib/roomGrouping';
import { useClickOutside } from '@/lib/useClickOutside';
import { useIsCompactViewport } from '@/lib/useIsCompactViewport';
import { DEFAULT_PROJECT_ID, useWorkspaceStore } from '@/store/workspaceStore';

const OPEN_ROOM_SETTINGS_EVENT = 'virtual-company:open-room-settings';
const OTHER_ROOMS_PIN_KEY = 'virtual-company:ui:other-rooms-pinned';

function initialPinnedState(): boolean {
  try {
    return localStorage.getItem(OTHER_ROOMS_PIN_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function OtherRoomsPanel() {
  const rooms = useWorkspaceStore(state => state.rooms);
  const projects = useWorkspaceStore(state => state.projects);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const setActiveRoom = useWorkspaceStore(state => state.setActiveRoom);
  const setRoomProject = useWorkspaceStore(state => state.setRoomProject);
  const compact = useIsCompactViewport();
  const [open, setOpen] = useState(!compact);
  const [pinned, setPinned] = useState(initialPinnedState);
  const [minutesRoomId, setMinutesRoomId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(() => new Set());
  const [draggedRoomId, setDraggedRoomId] = useState<string | null>(null);
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const visibleRooms = rooms.filter(room => !room.archivedAt);
  const archivedCount = rooms.length - visibleRooms.length;

  const groupedRooms = useMemo(
    () => groupRoomsByProject(visibleRooms, projects, DEFAULT_PROJECT_ID),
    [projects, visibleRooms],
  );

  const toggleProjectOpen = (projectId: string) => {
    setCollapsedProjectIds(current => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId); else next.add(projectId);
      return next;
    });
  };

  const handleDropOnProject = (projectId: string) => {
    if (draggedRoomId) setRoomProject(draggedRoomId, projectId);
    setDraggedRoomId(null);
    setDragOverProjectId(null);
  };

  useEffect(() => {
    if (compact) setOpen(false);
  }, [compact]);

  useEffect(() => {
    try {
      localStorage.setItem(OTHER_ROOMS_PIN_KEY, String(pinned));
    } catch {
      // Pinning is a UI preference; storage failure must not affect the panel.
    }
  }, [pinned]);

  useClickOutside(panelRef, open && !minutesRoomId && (compact || !pinned), () => setOpen(false));

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
      {compact ? <div className="fixed inset-0 z-40 bg-slate-950/40" onClick={() => setOpen(false)} aria-hidden="true" /> : null}
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
            <div className="flex items-center gap-2">
              {!compact ? (
                <button
                  type="button"
                  onClick={() => setPinned(value => !value)}
                  className={`grid h-8 w-8 place-items-center rounded-lg border text-sm shadow-sm transition ${pinned ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700'}`}
                  title={pinned ? 'Unpin Other Rooms' : 'Pin Other Rooms'}
                  aria-label={pinned ? 'Unpin Other Rooms' : 'Pin Other Rooms'}
                  aria-pressed={pinned}
                >
                  📌
                </button>
              ) : null}
              <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-600">{visibleRooms.length}</span>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {visibleRooms.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-400">No active rooms. Create one from Room Settings or restore an archived room from Workspace.</div>
          ) : (
            <div className="space-y-2">
              {groupedRooms.map(({ project, rooms: projectRooms }) => {
                const groupOpen = !collapsedProjectIds.has(project.id);
                const dropTarget = dragOverProjectId === project.id;
                return (
                  <div
                    key={project.id}
                    className={`rounded-lg transition ${dropTarget ? 'bg-blue-50 ring-2 ring-blue-300' : ''}`}
                    onDragOver={event => {
                      if (!draggedRoomId) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      if (dragOverProjectId !== project.id) setDragOverProjectId(project.id);
                    }}
                    onDragLeave={() => setDragOverProjectId(current => current === project.id ? null : current)}
                    onDrop={event => {
                      event.preventDefault();
                      handleDropOnProject(project.id);
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleProjectOpen(project.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-start hover:bg-slate-100"
                      aria-expanded={groupOpen}
                    >
                      <span className={`text-[10px] text-slate-400 transition-transform ${groupOpen ? 'rotate-90' : ''}`} aria-hidden="true">▸</span>
                      <span className="text-sm" aria-hidden="true">{project.emoji}</span>
                      <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wide text-slate-500">{project.name}</span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">{projectRooms.length}</span>
                    </button>

                    {groupOpen ? (
                      projectRooms.length === 0 ? (
                        <div className="ms-1 mt-1 rounded-lg border border-dashed border-slate-200 px-2.5 py-2 text-[10px] text-slate-400">
                          Drag a room here to move it into {project.name}.
                        </div>
                      ) : (
                        <div className="ms-1 mt-1 space-y-1.5">
                          {projectRooms.map(room => {
                            const active = room.id === activeRoomId;
                            const hasMessages = room.messages.length > 0;
                            return (
                              <div
                                key={room.id}
                                draggable
                                onDragStart={event => {
                                  event.dataTransfer.effectAllowed = 'move';
                                  event.dataTransfer.setData('text/plain', room.id);
                                  setDraggedRoomId(room.id);
                                }}
                                onDragEnd={() => {
                                  setDraggedRoomId(null);
                                  setDragOverProjectId(null);
                                }}
                                className={`cursor-grab rounded-lg border p-2.5 transition active:cursor-grabbing ${active ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/50'}`}
                              >
                                <div className="flex items-center gap-1">
                                  <button type="button" onClick={() => setActiveRoom(room.id)} className="min-w-0 flex flex-1 items-center gap-2 text-start" title={`Open ${room.name}`}>
                                    <span className="shrink-0 text-base" aria-hidden="true">{room.emoji}</span>
                                    <span dir="auto" className="min-w-0 flex-1 truncate text-start text-[12px] font-semibold text-slate-800">{room.name}</span>
                                  </button>
                                  <button type="button" onClick={() => setMinutesRoomId(room.id)} disabled={!hasMessages} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[13px] text-blue-600 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent" title={hasMessages ? 'Meeting Minutes' : 'No messages for Meeting Minutes'} aria-label={`Meeting Minutes for ${room.name}`}>▤</button>
                                  <button type="button" onClick={() => void handleCopyFullChat(room.id)} disabled={!hasMessages} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[13px] text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent" title={hasMessages ? 'Copy Full Chat' : 'No messages to copy'} aria-label={`Copy Full Chat for ${room.name}`}>⧉</button>
                                  <button type="button" onClick={() => handleOpenSettings(room.id)} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[13px] text-slate-500 transition hover:bg-slate-100 hover:text-slate-800" title="Room Settings" aria-label={`Room Settings for ${room.name}`}>⚙</button>
                                  <button type="button" onClick={() => handleDelete(room.id, room.name)} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[13px] text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" title="Delete Room" aria-label={`Delete ${room.name}`}>⌫</button>
                                </div>
                                <button type="button" onClick={() => setActiveRoom(room.id)} className="mt-1.5 flex w-full items-center justify-between gap-2 text-start"><span className="min-w-0 truncate text-[10px] text-slate-400">{room.agentIds.length} specialists · {room.messages.length} messages</span>{active ? <span className="text-[9px] font-semibold text-blue-600">ACTIVE</span> : null}</button>
                              </div>
                            );
                          })}
                        </div>
                      )
                    ) : null}
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
