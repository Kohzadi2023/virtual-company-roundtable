import { useMemo, useState } from 'react';
import { AgentAvatar } from '@/components/AgentAvatar';
import { SyncBadge } from '@/components/SyncBadge';
import { getAgentRoomMembership } from '@/lib/roomMembership';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function CompanyPanel() {
  const roles = useWorkspaceStore(state => state.roles);
  const agents = useWorkspaceStore(state => state.agents);
  const teams = useWorkspaceStore(state => state.teams);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const rooms = useWorkspaceStore(state => state.rooms);
  const addRole = useWorkspaceStore(state => state.addRole);
  const addAgent = useWorkspaceStore(state => state.addAgent);
  const addTeam = useWorkspaceStore(state => state.addTeam);
  const removeTeam = useWorkspaceStore(state => state.removeTeam);
  const toggleTeamInRoom = useWorkspaceStore(state => state.toggleTeamInRoom);
  const toggleAgentInRoom = useWorkspaceStore(state => state.toggleAgentInRoom);

  const room = rooms.find(item => item.id === activeRoomId);
  const roleMap = useMemo(() => new Map(roles.map(role => [role.id, role])), [roles]);
  const agentMap = useMemo(() => new Map(agents.map(agent => [agent.id, agent])), [agents]);
  const [directoryTab, setDirectoryTab] = useState<'members' | 'teams'>('members');
  const [openTeamIds, setOpenTeamIds] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState(agents[0]?.id ?? '');
  const [manageOpen, setManageOpen] = useState(false);
  const [mode, setMode] = useState<'agent' | 'role' | 'team'>('agent');

  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [roleSkills, setRoleSkills] = useState('');
  const [rolePrompt, setRolePrompt] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentEmoji, setAgentEmoji] = useState('🤖');
  const [agentRoleId, setAgentRoleId] = useState(roles[0]?.id ?? '');
  const [teamName, setTeamName] = useState('');
  const [teamEmoji, setTeamEmoji] = useState('👥');
  const [teamDescription, setTeamDescription] = useState('');
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([]);

  const visibleAgents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return agents;
    return agents.filter(agent => {
      const role = roleMap.get(agent.roleId);
      return [agent.name, role?.name, role?.skills.join(' ')]
        .filter((value): value is string => Boolean(value))
        .some(value => value.toLocaleLowerCase().includes(query));
    });
  }, [agents, roleMap, search]);

  const isSearching = search.trim().length > 0;

  const groupedMembers = useMemo(() => {
    const groupedAgentIds = new Set(teams.flatMap(team => team.agentIds));
    const groups = teams
      .map(team => ({ team, agents: visibleAgents.filter(agent => team.agentIds.includes(agent.id)) }))
      .filter(group => group.agents.length > 0);
    const unassigned = visibleAgents.filter(agent => !groupedAgentIds.has(agent.id));
    return { groups, unassigned };
  }, [teams, visibleAgents]);

  const toggleTeamOpen = (teamId: string) => {
    setOpenTeamIds(current => {
      const next = new Set(current);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  const visibleTeams = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return teams;
    return teams.filter(team => {
      const memberNames = team.agentIds.map(id => agentMap.get(id)?.name ?? '').join(' ');
      return [team.name, team.description, memberNames]
        .some(value => value.toLocaleLowerCase().includes(query));
    });
  }, [agentMap, search, teams]);

  const createRole = () => {
    const id = addRole({
      name: roleName,
      description: roleDescription,
      skills: roleSkills.split(/[,\n]/).map(value => value.trim()).filter(Boolean),
      systemPrompt: rolePrompt || `Respond as the company's ${roleName}. Give a concrete professional opinion based on this specialty.`,
    });
    if (!id) return;
    setRoleName('');
    setRoleDescription('');
    setRoleSkills('');
    setRolePrompt('');
    setAgentRoleId(id);
    setMode('agent');
  };

  const createAgent = () => {
    const roleId = agentRoleId || roles[0]?.id;
    if (!roleId) return;
    const id = addAgent({ name: agentName, roleId, emoji: agentEmoji.trim() || '🤖', color: '#2563EB' });
    if (!id) return;
    setAgentName('');
    setAgentEmoji('🤖');
    setSelectedMemberId(id);
    setDirectoryTab('members');
  };

  const createTeam = () => {
    const id = addTeam({
      name: teamName,
      description: teamDescription,
      emoji: teamEmoji,
      agentIds: teamMemberIds,
    });
    if (!id) return;
    setTeamName('');
    setTeamDescription('');
    setTeamEmoji('👥');
    setTeamMemberIds([]);
    setDirectoryTab('teams');
    setManageOpen(false);
  };

  const toggleTeamMember = (agentId: string) => {
    setTeamMemberIds(current => current.includes(agentId)
      ? current.filter(id => id !== agentId)
      : [...current, agentId]);
  };

  const renderAgentRow = (agent: (typeof agents)[number]) => {
    const role = roleMap.get(agent.roleId);
    const membership = getAgentRoomMembership(room, agent.id, teams);
    const present = membership.present;
    const selected = selectedMemberId === agent.id;
    const teamLabel = membership.teamNames.join(', ');
    const membershipLabel = membership.kind === 'direct-and-team'
      ? `Direct + ${teamLabel}`
      : membership.kind === 'team'
        ? `Via ${teamLabel}`
        : membership.kind === 'direct'
          ? 'Direct'
          : 'Not in room';
    const actionTitle = !room
      ? 'Select a room first'
      : membership.kind === 'team'
        ? `Included via ${teamLabel}. Manage this membership from Teams.`
        : membership.kind === 'direct-and-team'
          ? `Remove direct membership; ${agent.name} will remain via ${teamLabel}.`
          : membership.kind === 'direct'
            ? 'Remove direct membership from room'
            : 'Add directly to room';
    const handleMembershipAction = () => {
      if (!room) return;
      if (membership.kind === 'team') {
        setDirectoryTab('teams');
        setSearch(membership.teamNames[0] ?? '');
        return;
      }
      toggleAgentInRoom(room.id, agent.id);
    };
    return (
      <div key={agent.id} className={`relative flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 transition ${selected ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-transparent bg-white/70 hover:bg-slate-50'}`}>
        {selected && <span className="absolute inset-y-0 start-0 w-0.5 rounded-full bg-blue-600" />}
        <button type="button" onClick={() => setSelectedMemberId(agent.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-start">
          <span className="relative shrink-0">
            <AgentAvatar agent={agent} role={role} size="md" />
            <span className={`absolute -bottom-0.5 -end-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${present ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-label={membershipLabel} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-bold text-[#111b3a]">{agent.name}</span>
            <span className="block truncate text-[12px] text-slate-500">{role?.name ?? 'Specialist'}</span>
            <span className={`block truncate text-[10px] font-semibold ${membership.kind === 'team' ? 'text-violet-600' : membership.kind === 'direct-and-team' ? 'text-emerald-600' : membership.kind === 'direct' ? 'text-blue-600' : 'text-slate-400'}`}>{membershipLabel}</span>
          </span>
        </button>
        <button
          type="button"
          disabled={!room}
          onClick={handleMembershipAction}
          title={actionTitle}
          aria-label={actionTitle}
          className={`ms-2 grid h-7 w-7 shrink-0 place-items-center rounded-md text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${membership.kind === 'team' ? 'bg-violet-50 text-violet-700 hover:bg-violet-100' : membership.direct ? 'bg-emerald-50 text-emerald-700 hover:bg-red-50 hover:text-red-600' : 'bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-blue-600'}`}
        >
          {membership.kind === 'team' ? '👥' : membership.direct ? '−' : '+'}
        </button>
      </div>
    );
  };

  return (
    <aside className="flex w-[318px] shrink-0 flex-col border-e border-slate-200 bg-[#fbfcfe]" aria-label="Virtual Company directory">
      <div className="flex items-center justify-between px-5 pb-2 pt-3">
        <h2 className="text-[14px] font-bold text-[#111b3a]">Company Directory</h2>
        <button type="button" onClick={() => setManageOpen(value => !value)} className="grid h-7 w-7 place-items-center rounded-md text-lg text-slate-400 hover:bg-slate-100" aria-label="Manage company">⋯</button>
      </div>

      <div className="mx-4 mb-2 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-xs font-semibold">
        <button type="button" onClick={() => setDirectoryTab('members')} className={`rounded-md px-2 py-1.5 ${directoryTab === 'members' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          Members ({agents.length})
        </button>
        <button type="button" onClick={() => setDirectoryTab('teams')} className={`rounded-md px-2 py-1.5 ${directoryTab === 'teams' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          Teams ({teams.length})
        </button>
      </div>

      <div className="px-4 pb-2">
        <label className="relative block">
          <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">⌕</span>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder={directoryTab === 'members' ? 'Search specialists...' : 'Search teams...'} className="h-9 w-full rounded-lg border border-slate-300 bg-white pe-3 ps-9 text-[13px] text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
        </label>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2.5 pb-2">
        {directoryTab === 'members' ? (
          <>
            {groupedMembers.groups.map(({ team, agents: teamAgents }) => {
              const open = isSearching || openTeamIds.has(team.id);
              return (
                <div key={team.id} className="mb-1.5">
                  <button
                    type="button"
                    onClick={() => toggleTeamOpen(team.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start hover:bg-slate-100"
                    aria-expanded={open}
                  >
                    <span className={`text-[10px] text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">▸</span>
                    <span className="text-sm" aria-hidden="true">{team.emoji}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wide text-slate-500">{team.name}</span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">{teamAgents.length}</span>
                  </button>
                  {open ? <div className="mt-0.5 space-y-1 ps-1">{teamAgents.map(renderAgentRow)}</div> : null}
                </div>
              );
            })}
            {groupedMembers.unassigned.length > 0 ? (
              <div className="mb-1.5">
                <div className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Unassigned <span className="ms-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">{groupedMembers.unassigned.length}</span>
                </div>
                <div className="space-y-1 ps-1">{groupedMembers.unassigned.map(renderAgentRow)}</div>
              </div>
            ) : null}
            {isSearching && groupedMembers.groups.length === 0 && groupedMembers.unassigned.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-400">No specialists match “{search.trim()}”.</div>
            ) : null}
          </>
        ) : visibleTeams.map(team => {
          const inRoomCount = room ? team.agentIds.filter(id => room.agentIds.includes(id)).length : 0;
          const selectedInRoom = room?.teamIds?.includes(team.id) ?? false;
          return (
            <div key={team.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="text-lg">{team.emoji}</span><span className="truncate text-[13px] font-bold text-[#111b3a]">{team.name}</span></div>
                  <div className="mt-1 text-[11px] leading-4 text-slate-500">{team.description}</div>
                </div>
                {!team.builtIn && <button type="button" onClick={() => removeTeam(team.id)} className="text-xs text-slate-400 hover:text-red-600" title="Delete team">✕</button>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {team.agentIds.slice(0, 5).map(id => <span key={id} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{agentMap.get(id)?.name ?? 'Member'}</span>)}
                {team.agentIds.length > 5 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">+{team.agentIds.length - 5}</span>}
              </div>
              <button
                type="button"
                disabled={!room}
                onClick={() => room && toggleTeamInRoom(room.id, team.id)}
                title={selectedInRoom ? 'Remove team from room' : 'Add team to room'}
                className={`mt-2 w-full rounded-md border px-2 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${selectedInRoom ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
              >
                {selectedInRoom ? '− Remove team from room' : `+ Add team to room${inRoomCount ? ` (${inRoomCount}/${team.agentIds.length} members already present)` : ''}`}
              </button>
            </div>
          );
        })}
      </div>

      {manageOpen && (
        <div className="mx-3 mb-2 max-h-[55vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-3 grid grid-cols-3 rounded-lg bg-slate-100 p-1 text-xs font-semibold">
            {(['agent', 'role', 'team'] as const).map(item => (
              <button key={item} type="button" onClick={() => setMode(item)} className={`rounded-md px-2 py-1.5 capitalize ${mode === item ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>{item === 'agent' ? 'Employee' : item === 'role' ? 'Role' : 'Team'}</button>
            ))}
          </div>

          {mode === 'agent' ? (
            <div className="space-y-2">
              <input value={agentName} onChange={event => setAgentName(event.target.value)} placeholder="Employee name" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              <div className="grid grid-cols-[4rem_1fr] gap-2">
                <input value={agentEmoji} onChange={event => setAgentEmoji(event.target.value)} aria-label="Agent emoji" className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-center text-sm" />
                <select value={agentRoleId} onChange={event => setAgentRoleId(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select>
              </div>
              <button type="button" onClick={createAgent} disabled={!agentName.trim()} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Add Employee</button>
              <p className="text-[11px] text-slate-400">New employees join the company directory only. Add them to rooms explicitly.</p>
            </div>
          ) : mode === 'role' ? (
            <div className="space-y-2">
              <input value={roleName} onChange={event => setRoleName(event.target.value)} placeholder="Role name" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              <input value={roleDescription} onChange={event => setRoleDescription(event.target.value)} placeholder="Description" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              <textarea value={roleSkills} onChange={event => setRoleSkills(event.target.value)} rows={2} placeholder="Skills, comma separated" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              <textarea value={rolePrompt} onChange={event => setRolePrompt(event.target.value)} rows={2} placeholder="System prompt" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              <button type="button" onClick={createRole} disabled={!roleName.trim()} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Add Role</button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[4rem_1fr] gap-2">
                <input value={teamEmoji} onChange={event => setTeamEmoji(event.target.value)} aria-label="Team emoji" className="rounded-lg border border-slate-300 px-2 py-2 text-center" />
                <input value={teamName} onChange={event => setTeamName(event.target.value)} placeholder="Team name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <textarea value={teamDescription} onChange={event => setTeamDescription(event.target.value)} rows={2} placeholder="Team purpose / description" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <div className="rounded-lg border border-slate-200 p-2">
                <div className="mb-2 text-xs font-semibold text-slate-600">Select members ({teamMemberIds.length})</div>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {agents.map(agent => (
                    <label key={agent.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-slate-50">
                      <input type="checkbox" checked={teamMemberIds.includes(agent.id)} onChange={() => toggleTeamMember(agent.id)} />
                      <span className="font-medium text-slate-700">{agent.name}</span>
                      <span className="truncate text-slate-400">· {roleMap.get(agent.roleId)?.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button type="button" onClick={createTeam} disabled={!teamName.trim() || teamMemberIds.length === 0} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Create Team</button>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-slate-200 bg-white p-3">
        <button type="button" onClick={() => setManageOpen(value => !value)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"><span aria-hidden="true">👥</span> Manage Company</button>
        <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-slate-500"><span>Virtual Company</span><SyncBadge /></div>
      </div>
    </aside>
  );
}
