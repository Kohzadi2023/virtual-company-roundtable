import { useMemo, useState } from 'react';
import { AgentAvatar } from '@/components/AgentAvatar';
import { SyncBadge } from '@/components/SyncBadge';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function CompanyPanel() {
  const roles = useWorkspaceStore(state => state.roles);
  const agents = useWorkspaceStore(state => state.agents);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const rooms = useWorkspaceStore(state => state.rooms);
  const addRole = useWorkspaceStore(state => state.addRole);
  const addAgent = useWorkspaceStore(state => state.addAgent);
  const toggleAgentInRoom = useWorkspaceStore(state => state.toggleAgentInRoom);

  const room = rooms.find(item => item.id === activeRoomId);
  const roleMap = useMemo(() => new Map(roles.map(role => [role.id, role])), [roles]);
  const [search, setSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState(agents[0]?.id ?? '');
  const [manageOpen, setManageOpen] = useState(false);
  const [mode, setMode] = useState<'role' | 'agent'>('agent');

  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [roleSkills, setRoleSkills] = useState('');
  const [rolePrompt, setRolePrompt] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentEmoji, setAgentEmoji] = useState('🤖');
  const [agentRoleId, setAgentRoleId] = useState(roles[0]?.id ?? '');

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
    if (room) toggleAgentInRoom(room.id, id);
    setAgentName('');
    setAgentEmoji('🤖');
    setSelectedMemberId(id);
    setManageOpen(false);
  };

  return (
    <aside className="hidden w-[348px] shrink-0 flex-col border-e border-slate-200 bg-white lg:flex" aria-label="Virtual Company team">
      <div className="flex items-center justify-between px-5 pb-3 pt-4">
        <h2 className="text-sm font-bold text-slate-900">Team Members ({agents.length})</h2>
        <button type="button" onClick={() => setManageOpen(value => !value)} className="grid h-8 w-8 place-items-center rounded-lg text-lg text-slate-400 hover:bg-slate-100" aria-label="Team menu">⋯</button>
      </div>

      <div className="px-4 pb-3">
        <label className="relative block">
          <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">⌕</span>
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search team members..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pe-3 ps-10 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {visibleAgents.map(agent => {
          const role = roleMap.get(agent.roleId);
          const present = room?.agentIds.includes(agent.id) ?? false;
          const selected = selectedMemberId === agent.id;
          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => setSelectedMemberId(agent.id)}
              className={`group flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-start transition ${selected ? 'border-blue-400 bg-blue-50 shadow-sm' : 'border-transparent hover:bg-slate-50'}`}
            >
              <span className="relative">
                <AgentAvatar agent={agent} role={role} size="md" />
                <span className="absolute -bottom-0.5 -end-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" aria-label={present ? 'In room' : 'Available'} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-900">{agent.name}</span>
                <span className="block truncate text-sm text-slate-500">{role?.name ?? 'Specialist'}</span>
              </span>
              <span className="text-xl" aria-hidden="true">{agent.emoji}</span>
            </button>
          );
        })}
      </div>

      {manageOpen && (
        <div className="mx-4 mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
          <div className="mb-3 grid grid-cols-2 rounded-lg bg-slate-200/70 p-1 text-xs font-semibold">
            <button type="button" onClick={() => setMode('agent')} className={`rounded-md px-2 py-1.5 ${mode === 'agent' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Employee</button>
            <button type="button" onClick={() => setMode('role')} className={`rounded-md px-2 py-1.5 ${mode === 'role' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Role</button>
          </div>

          {mode === 'agent' ? (
            <div className="space-y-2">
              <input value={agentName} onChange={event => setAgentName(event.target.value)} placeholder="Employee name" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              <div className="grid grid-cols-[4rem_1fr] gap-2">
                <input value={agentEmoji} onChange={event => setAgentEmoji(event.target.value)} aria-label="Agent emoji" className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-center text-sm" />
                <select value={agentRoleId} onChange={event => setAgentRoleId(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>
              </div>
              <button type="button" onClick={createAgent} disabled={!agentName.trim()} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Add Employee</button>
            </div>
          ) : (
            <div className="space-y-2">
              <input value={roleName} onChange={event => setRoleName(event.target.value)} placeholder="Role name" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              <input value={roleDescription} onChange={event => setRoleDescription(event.target.value)} placeholder="Description" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              <textarea value={roleSkills} onChange={event => setRoleSkills(event.target.value)} rows={2} placeholder="Skills, comma separated" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              <textarea value={rolePrompt} onChange={event => setRolePrompt(event.target.value)} rows={2} placeholder="System prompt" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              <button type="button" onClick={createRole} disabled={!roleName.trim()} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Add Role</button>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-slate-200 p-4">
        <button type="button" onClick={() => setManageOpen(value => !value)} className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
          <span aria-hidden="true">👥</span> Manage Team
        </button>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>▣ Virtual Company · v1.2</span>
          <SyncBadge />
        </div>
      </div>
    </aside>
  );
}
