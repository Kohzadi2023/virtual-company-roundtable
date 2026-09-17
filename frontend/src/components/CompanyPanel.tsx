import { useMemo, useState } from 'react';
import { AgentAvatar } from '@/components/AgentAvatar';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function CompanyPanel() {
  const roles = useWorkspaceStore(state => state.roles);
  const agents = useWorkspaceStore(state => state.agents);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const rooms = useWorkspaceStore(state => state.rooms);
  const addRole = useWorkspaceStore(state => state.addRole);
  const addAgent = useWorkspaceStore(state => state.addAgent);
  const removeAgent = useWorkspaceStore(state => state.removeAgent);
  const toggleAgentInRoom = useWorkspaceStore(state => state.toggleAgentInRoom);

  const room = rooms.find(item => item.id === activeRoomId);
  const [form, setForm] = useState<'none' | 'role' | 'agent'>('none');
  const [search, setSearch] = useState('');

  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [roleSkills, setRoleSkills] = useState('');
  const [rolePrompt, setRolePrompt] = useState('');

  const [agentName, setAgentName] = useState('');
  const [agentEmoji, setAgentEmoji] = useState('🤖');
  const [agentRoleId, setAgentRoleId] = useState('');

  const roleMap = useMemo(() => new Map(roles.map(role => [role.id, role])), [roles]);
  const visibleAgents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return agents;
    return agents.filter(agent => {
      const role = roleMap.get(agent.roleId);
      return [agent.name, role?.name, role?.skills.join(' ')]
        .filter(Boolean)
        .some(value => value!.toLocaleLowerCase().includes(query));
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
    setForm('agent');
  };

  const createAgent = () => {
    const roleId = agentRoleId || roles[0]?.id;
    if (!roleId) return;
    const id = addAgent({
      name: agentName,
      roleId,
      emoji: agentEmoji.trim() || '🤖',
      color: '#6366F1',
    });
    if (!id) return;
    setAgentName('');
    setAgentEmoji('🤖');
    setForm('none');
  };

  return (
    <aside className="max-h-[44vh] overflow-y-auto border-b border-slate-800 bg-slate-950 p-3 lg:max-h-none lg:w-80 lg:border-b-0 lg:border-e" aria-label="شرکت مجازی">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">🏢 Virtual Company</h2>
          <p className="mt-1 text-xs text-slate-500">{agents.length} متخصص · نقش‌ها و Skills ثابت</p>
        </div>
        {room && <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400">{room.agentIds.length} in room</span>}
      </div>

      <label className="mb-3 block">
        <span className="sr-only">جستجوی کارمند</span>
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search employees, roles, skills…"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm placeholder:text-slate-600"
        />
      </label>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setForm(form === 'role' ? 'none' : 'role')} className="rounded-lg border border-slate-700 px-2 py-2 text-xs hover:bg-slate-900">+ Role</button>
        <button type="button" onClick={() => { setAgentRoleId(current => current || roles[0]?.id || ''); setForm(form === 'agent' ? 'none' : 'agent'); }} className="rounded-lg bg-indigo-600 px-2 py-2 text-xs font-medium hover:bg-indigo-500">+ Employee</button>
      </div>

      {form === 'role' && (
        <div className="mb-4 space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-3">
          <strong className="text-xs">افزودن تخصص جدید</strong>
          <input value={roleName} onChange={event => setRoleName(event.target.value)} placeholder="Role name" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <input value={roleDescription} onChange={event => setRoleDescription(event.target.value)} placeholder="Description" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <textarea value={roleSkills} onChange={event => setRoleSkills(event.target.value)} rows={2} placeholder="Skills, comma separated" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <textarea value={rolePrompt} onChange={event => setRolePrompt(event.target.value)} rows={3} placeholder="Role system prompt" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <button type="button" onClick={createRole} disabled={!roleName.trim()} className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold disabled:opacity-50">ذخیره Role</button>
        </div>
      )}

      {form === 'agent' && (
        <div className="mb-4 space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-3">
          <strong className="text-xs">افزودن متخصص به شرکت</strong>
          <input value={agentName} onChange={event => setAgentName(event.target.value)} placeholder="Employee name" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <div className="grid grid-cols-[5rem_1fr] gap-2">
            <input value={agentEmoji} onChange={event => setAgentEmoji(event.target.value)} aria-label="Agent emoji" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
            <select value={agentRoleId} onChange={event => setAgentRoleId(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
              {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
          </div>
          <p className="text-[11px] leading-5 text-slate-500">Role انتخاب‌شده هویت ثابت این کارمند است. برای کارمند سفارشی، Avatar با حروف اول نام ساخته می‌شود.</p>
          <button type="button" onClick={createAgent} disabled={!agentName.trim() || !(agentRoleId || roles[0]?.id)} className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold disabled:opacity-50">ساخت Employee</button>
        </div>
      )}

      <div className="space-y-2">
        {visibleAgents.map(agent => {
          const role = roleMap.get(agent.roleId);
          const present = room?.agentIds.includes(agent.id) ?? false;
          return (
            <article key={agent.id} className={`rounded-xl border p-3 transition ${present ? 'border-slate-700 bg-slate-900/80' : 'border-slate-800 bg-slate-900/40 opacity-75'}`}>
              <div className="flex items-center gap-3">
                <AgentAvatar agent={agent} role={role} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{agent.name}</div>
                  <div className="truncate text-xs text-slate-400">{role?.name ?? 'Unknown role'}</div>
                </div>
                {!role?.builtIn && (
                  <button type="button" onClick={() => removeAgent(agent.id)} className="text-[11px] text-slate-600 hover:text-rose-300" aria-label={`حذف ${agent.name}`}>حذف</button>
                )}
              </div>
              {room && (
                <button
                  type="button"
                  onClick={() => toggleAgentInRoom(room.id, agent.id)}
                  className={`mt-2 w-full rounded-lg border px-2 py-1.5 text-[11px] ${present ? 'border-emerald-800 bg-emerald-950/30 text-emerald-300' : 'border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                >
                  {present ? '✓ حاضر در این اتاق' : '+ ورود به این اتاق'}
                </button>
              )}
            </article>
          );
        })}
        {visibleAgents.length === 0 && <p className="py-8 text-center text-xs text-slate-600">کارمندی مطابق جستجو پیدا نشد.</p>}
      </div>
    </aside>
  );
}
