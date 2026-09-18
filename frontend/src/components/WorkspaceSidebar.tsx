import { useEffect, useMemo, useRef, useState } from 'react';
import { CompanyPanel } from '@/components/CompanyPanel';
import { SyncBadge } from '@/components/SyncBadge';
import { defaultThinkRooms } from '@/lib/thinkRooms';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function WorkspaceSidebar() {
  const rooms = useWorkspaceStore(state => state.rooms);
  const teams = useWorkspaceStore(state => state.teams);
  const agents = useWorkspaceStore(state => state.agents);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const createRoom = useWorkspaceStore(state => state.createRoom);
  const setActiveRoom = useWorkspaceStore(state => state.setActiveRoom);

  const [directoryOpen, setDirectoryOpen] = useState(false);
  const seededRef = useRef(false);

  const teamMap = useMemo(() => new Map(teams.map(team => [team.id, team])), [teams]);
  const thinkRoomNames = useMemo(() => new Set(defaultThinkRooms.map(room => room.name)), []);

  useEffect(() => {
    if (seededRef.current || teams.length === 0) return;

    const validTeamIds = new Set(teams.map(team => team.id));
    const missing = defaultThinkRooms.filter(preset => (
      validTeamIds.has(preset.teamId)
      && !rooms.some(room => room.name === preset.name)
    ));

    if (missing.length === 0) {
      seededRef.current = true;
      return;
    }

    seededRef.current = true;
    const previousActiveRoomId = activeRoomId;

    for (const preset of missing) {
      createRoom(preset.name, preset.emoji, [], [preset.teamId]);
    }

    if (previousActiveRoomId) setActiveRoom(previousActiveRoomId);
  }, [activeRoomId, createRoom, rooms, setActiveRoom, teams]);

  const thinkRooms = defaultThinkRooms.map(preset => ({
    preset,
    room: rooms.find(room => room.name === preset.name),
    team: teamMap.get(preset.teamId),
  }));

  const otherRooms = rooms.filter(room => !thinkRoomNames.has(room.name));

  return (
    <aside className="relative flex w-[318px] shrink-0 flex-col border-e border-slate-200 bg-[#fbfcfe]" aria-label="Workspace navigation">
      <div className="border-b border-slate-200 bg-white p-3">
        <button
          type="button"
          onClick={() => setDirectoryOpen(true)}
          className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-start shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
          aria-expanded={directoryOpen}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-base">👥</span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-bold text-[#111b3a]">Company Directory</span>
              <span className="block truncate text-[11px] text-slate-500">{agents.length} specialists · {teams.length} teams</span>
            </span>
          </span>
          <span className="ms-2 text-lg text-slate-400" aria-hidden="true">›</span>
        </button>
      </div>

      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <div>
          <h2 className="text-[14px] font-bold text-[#111b3a]">Think Rooms</h2>
          <p className="text-[11px] text-slate-400">Specialized rooms with the right team preloaded</p>
        </div>
        <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-600">{defaultThinkRooms.length}</span>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
        {thinkRooms.map(({ preset, room, team }) => {
          const active = room?.id === activeRoomId;
          return (
            <button
              key={preset.name}
              type="button"
              disabled={!room}
              onClick={() => room && setActiveRoom(room.id)}
              className={`w-full rounded-lg border p-2.5 text-start transition ${active ? 'border-violet-300 bg-violet-50 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50'} disabled:cursor-wait disabled:opacity-60`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex items-center gap-2">
                  <span className="text-lg" aria-hidden="true">{preset.emoji}</span>
                  <span className="truncate text-[12px] font-semibold text-slate-800">{preset.name.replace(' Think Room', '')}</span>
                </span>
                {active ? <span className="text-[10px] font-semibold text-violet-600">ACTIVE</span> : null}
              </span>
              <span className="mt-1 block line-clamp-2 text-[10px] leading-4 text-slate-500">{preset.description}</span>
              <span className="mt-1.5 block text-[10px] text-slate-400">{team?.agentIds.length ?? 0} specialists</span>
            </button>
          );
        })}

        {otherRooms.length > 0 && (
          <div className="pt-2">
            <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Other Rooms</div>
            <div className="space-y-1">
              {otherRooms.map(room => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => setActiveRoom(room.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-start text-xs transition ${room.id === activeRoomId ? 'bg-blue-50 font-semibold text-blue-700' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  <span className="truncate"><span className="me-2">{room.emoji}</span>{room.name}</span>
                  <span className="ms-2 shrink-0 text-[10px] text-slate-400">{room.agentIds.length}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>Virtual Company</span>
          <SyncBadge />
        </div>
      </div>

      {directoryOpen && (
        <div className="absolute inset-0 z-50 flex bg-white shadow-2xl">
          <CompanyPanel />
          <button
            type="button"
            onClick={() => setDirectoryOpen(false)}
            className="absolute end-12 top-3 grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-white text-base font-bold text-slate-500 shadow-sm hover:bg-slate-50 hover:text-blue-600"
            title="Close Company Directory"
            aria-label="Close Company Directory"
          >
            ‹
          </button>
        </div>
      )}
    </aside>
  );
}
