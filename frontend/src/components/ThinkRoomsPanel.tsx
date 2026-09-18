import { useEffect, useMemo, useRef } from 'react';
import { SyncBadge } from '@/components/SyncBadge';
import { defaultThinkRooms } from '@/lib/thinkRooms';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function ThinkRoomsPanel() {
  const rooms = useWorkspaceStore(state => state.rooms);
  const teams = useWorkspaceStore(state => state.teams);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const createRoom = useWorkspaceStore(state => state.createRoom);
  const setActiveRoom = useWorkspaceStore(state => state.setActiveRoom);

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
    <aside className="flex w-[286px] shrink-0 flex-col border-s border-slate-200 bg-[#fbfcfe]" aria-label="Think Rooms">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-bold text-[#111b3a]">Think Rooms</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">Specialized discussion rooms</p>
          </div>
          <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-600">{defaultThinkRooms.length}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
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
                {active ? <span className="text-[9px] font-semibold text-violet-600">ACTIVE</span> : null}
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
          <span>Think Rooms</span>
          <SyncBadge />
        </div>
      </div>
    </aside>
  );
}
