import { useMemo, useState } from 'react';
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
  const teams = useWorkspaceStore(state => state.teams);
  const agents = useWorkspaceStore(state => state.agents);
  const roles = useWorkspaceStore(state => state.roles);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const setActiveRoom = useWorkspaceStore(state => state.setActiveRoom);
  const createRoom = useWorkspaceStore(state => state.createRoom);
  const toggleTeamInRoom = useWorkspaceStore(state => state.toggleTeamInRoom);
  const toggleAgentInRoom = useWorkspaceStore(state => state.toggleAgentInRoom);

  const activeRoom = rooms.find(room => room.id === activeRoomId);
  const roleMap = useMemo(() => new Map(roles.map(role => [role.id, role])), [roles]);
  const teamMap = useMemo(() => new Map(teams.map(team => [team.id, team])), [teams]);
  const [roomMenuOpen, setRoomMenuOpen] = useState(false);
  const [newRoomOpen, setNewRoomOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomTeamId, setNewRoomTeamId] = useState('');
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

  const submitNewRoom = () => {
    const team = teams.find(item => item.id === newRoomTeamId);
    const id = createRoom(
      newRoomName || `Room ${rooms.length + 1}`,
      '🏢',
      [],
      team ? [team.id] : [],
    );
    setActiveRoom(id);
    setNewRoomName('');
    setNewRoomTeamId('');
    setNewRoomOpen(false);
    setRoomMenuOpen(false);
    setToast({ id: Date.now(), text: team ? `Room created with ${team.name}.` : 'Empty room created.', tone: 'success' });
  };

  const handleTeamToggle = (teamId: string) => {
    if (!activeRoom) return;
    const selected = activeRoom.teamIds?.includes(teamId) ?? false;
    const team = teamMap.get(teamId);
    toggleTeamInRoom(activeRoom.id, teamId);
    if (team) {
      setToast({
        id: Date.now(),
        text: selected ? `${team.name} removed from this room.` : `${team.name} added to this room.`,
        tone: 'success',
      });
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
            <h1 className="truncate text-[17px] font-bold text-[#111b3a]">{activeRoom?.name ?? 'Company Roundtable'}</h1>
            <p className="truncate text-[13px] text-slate-500">{activeRoom ? `${activeRoom.agentIds.length} specialists in this room` : 'Discuss · Analyze · Challenge · Build Better'}</p>
          </div>

          <div className="relative flex items-center gap-2">
            <button type="button" onClick={copyFullChat} disabled={!activeRoom || activeRoom.messages.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-blue-500 bg-white px-3 py-2 text-[13px] font-semibold text-blue-600 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"><span aria-hidden="true">⧉</span> Copy Full Chat</button>

            <button type="button" onClick={() => setRoomMenuOpen(value => !value)} aria-expanded={roomMenuOpen} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"><span aria-hidden="true">⚙</span> Room Settings</button>

            <div className="ms-2 flex items-center gap-2 border-s border-slate-200 ps-4">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">U</span>
              <div><div className="text-[13px] font-semibold text-slate-900">User</div><div className="text-[11px] text-slate-500">Owner</div></div>
            </div>

            {roomMenuOpen && (
              <div className="absolute end-0 top-12 w-[430px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                <div className="border-b border-slate-200 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Rooms</div>
                  <div className="max-h-32 space-y-1 overflow-y-auto">
                    {rooms.map(room => (
                      <button key={room.id} type="button" onClick={() => setActiveRoom(room.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-start text-sm ${room.id === activeRoomId ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}>
                        <span className="truncate"><span className="me-2">{room.emoji}</span>{room.name}</span>
                        <span className="text-[11px] text-slate-400">{room.agentIds.length} members</span>
                      </button>
                    ))}
                  </div>
                  {!newRoomOpen ? (
                    <button type="button" onClick={() => setNewRoomOpen(true)} className="mt-2 w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">+ New Room</button>
                  ) : (
                    <div className="mt-2 space-y-2 rounded-lg border border-blue-100 bg-blue-50/50 p-2">
                      <input autoFocus value={newRoomName} onChange={event => setNewRoomName(event.target.value)} placeholder="Room name" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
                      <select value={newRoomTeamId} onChange={event => setNewRoomTeamId(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                        <option value="">Start empty — add specialists later</option>
                        {teams.map(team => <option key={team.id} value={team.id}>{team.emoji} {team.name} ({team.agentIds.length})</option>)}
                      </select>
                      <div className="flex gap-2">
                        <button type="button" onClick={submitNewRoom} className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Create Room</button>
                        <button type="button" onClick={() => setNewRoomOpen(false)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-600">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>

                {activeRoom && (
                  <div className="grid max-h-[55vh] grid-cols-2 divide-x divide-slate-200">
                    <div className="p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Add or remove a team</div>
                      <div className="space-y-1.5">
                        {teams.map(team => {
                          const selected = activeRoom.teamIds?.includes(team.id) ?? false;
                          return (
                            <button
                              key={team.id}
                              type="button"
                              onClick={() => handleTeamToggle(team.id)}
                              title={selected ? `Remove ${team.name} from this room` : `Add ${team.name} to this room`}
                              className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-start text-xs transition ${selected ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700' : 'border-slate-200 hover:border-blue-200 hover:bg-blue-50'}`}
                            >
                              <span className="truncate"><span className="me-1">{team.emoji}</span>{team.name}</span>
                              <span className="ms-2 font-bold">{selected ? '−' : '+'}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Individual specialists</div>
                      <div className="max-h-72 space-y-1 overflow-y-auto">
                        {agents.map(agent => {
                          const present = activeRoom.agentIds.includes(agent.id);
                          const selectedTeamIds = activeRoom.teamIds ?? [];
                          const suppliedByTeam = selectedTeamIds.some(teamId => teamMap.get(teamId)?.agentIds.includes(agent.id));
                          const explicitlySelected = activeRoom.individualAgentIds?.includes(agent.id) ?? false;
                          const lockedByTeam = suppliedByTeam && !explicitlySelected;
                          return (
                            <label
                              key={agent.id}
                              title={lockedByTeam ? 'Included by an active team. Remove the team first to remove this specialist.' : undefined}
                              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${lockedByTeam ? 'cursor-not-allowed bg-emerald-50/50' : 'cursor-pointer hover:bg-slate-50'}`}
                            >
                              <input type="checkbox" checked={present} disabled={lockedByTeam} onChange={() => toggleAgentInRoom(activeRoom.id, agent.id)} />
                              <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{agent.name}</span>
                              {suppliedByTeam ? <span className="rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-semibold text-emerald-700">TEAM</span> : null}
                              <span className="max-w-24 truncate text-[10px] text-slate-400">{roleMap.get(agent.roleId)?.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
