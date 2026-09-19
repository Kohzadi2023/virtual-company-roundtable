import { useEffect, useMemo, useState } from 'react';
import { AgentAvatar } from '@/components/AgentAvatar';
import {
  OPEN_AGENT_MEMORY_EVENT,
  type OpenAgentMemoryDetail,
} from '@/lib/agentMemory';
import {
  addAgentMemory,
  deleteAgentMemory,
  loadWorkspaceSuite,
  updateAgentMemory,
  WORKSPACE_SUITE_EVENT,
  type AgentMemoryCategory,
  type AgentMemoryEntry,
  type AgentMemoryImportance,
  type AgentMemoryStatus,
  type WorkspaceSuiteState,
} from '@/lib/workspaceSuite';
import { useWorkspaceStore } from '@/store/workspaceStore';

const categories: Array<{ value: AgentMemoryCategory; label: string; icon: string }> = [
  { value: 'decision', label: 'Decision', icon: '✓' },
  { value: 'assumption', label: 'Assumption', icon: '◌' },
  { value: 'risk', label: 'Risk', icon: '⚠' },
  { value: 'constraint', label: 'Constraint', icon: '⊣' },
  { value: 'preference', label: 'Preference', icon: '♥' },
  { value: 'fact', label: 'Fact', icon: '●' },
  { value: 'open-question', label: 'Open Question', icon: '?' },
  { value: 'lesson', label: 'Lesson', icon: '↗' },
  { value: 'protocol', label: 'Protocol', icon: '☷' },
];

const statuses: AgentMemoryStatus[] = ['active', 'resolved', 'superseded', 'archived'];
const importanceOrder: Record<AgentMemoryImportance, number> = { high: 3, medium: 2, low: 1 };

function excerptTitle(content: string): string {
  const firstLine = content.split('\n').map(value => value.trim()).find(Boolean) ?? 'Saved memory';
  return firstLine.length > 72 ? `${firstLine.slice(0, 69)}…` : firstLine;
}

function categoryLabel(value: AgentMemoryCategory): string {
  return categories.find(item => item.value === value)?.label ?? value;
}

export function AgentMemoryDialogHost() {
  const agents = useWorkspaceStore(state => state.agents);
  const roles = useWorkspaceStore(state => state.roles);
  const projects = useWorkspaceStore(state => state.projects);
  const rooms = useWorkspaceStore(state => state.rooms);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const setActiveRoom = useWorkspaceStore(state => state.setActiveRoom);

  const [suite, setSuite] = useState<WorkspaceSuiteState>(() => loadWorkspaceSuite());
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState('');
  const [category, setCategory] = useState<AgentMemoryCategory>('fact');
  const [importance, setImportance] = useState<AgentMemoryImportance>('medium');
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<AgentMemoryStatus>('active');
  const [expiresOn, setExpiresOn] = useState('');
  const [sourceRoomId, setSourceRoomId] = useState<string | undefined>();
  const [sourceMessageId, setSourceMessageId] = useState<string | undefined>();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | AgentMemoryStatus>('active');
  const [categoryFilter, setCategoryFilter] = useState<'all' | AgentMemoryCategory>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const refresh = () => setSuite(loadWorkspaceSuite());
    window.addEventListener(WORKSPACE_SUITE_EVENT, refresh);
    return () => window.removeEventListener(WORKSPACE_SUITE_EVENT, refresh);
  }, []);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenAgentMemoryDetail>).detail ?? {};
      const state = useWorkspaceStore.getState();
      const sourceRoom = detail.sourceRoomId
        ? state.rooms.find(room => room.id === detail.sourceRoomId)
        : state.rooms.find(room => room.id === state.activeRoomId);
      const sourceMessage = detail.sourceMessageId && sourceRoom
        ? sourceRoom.messages.find(message => message.id === detail.sourceMessageId)
        : undefined;
      const preferredAgentId = detail.agentId
        ?? (sourceMessage?.authorType === 'agent' ? sourceMessage.authorId : undefined)
        ?? sourceRoom?.agentIds[0]
        ?? state.agents[0]?.id
        ?? '';
      const suggestedContent = detail.suggestedContent ?? sourceMessage?.content ?? '';
      setAgentId(preferredAgentId);
      setProjectId(sourceRoom?.projectId ?? '');
      setCategory(sourceMessage?.reaction === 'risk' ? 'risk' : 'fact');
      setImportance(sourceMessage?.pinned || sourceMessage?.reaction === 'important' ? 'high' : 'medium');
      setTitle(detail.suggestedTitle ?? (suggestedContent ? excerptTitle(suggestedContent) : ''));
      setContent(suggestedContent);
      setStatus('active');
      setExpiresOn('');
      setSourceRoomId(detail.sourceRoomId);
      setSourceMessageId(detail.sourceMessageId);
      setEditingId(null);
      setOpen(true);
    };
    window.addEventListener(OPEN_AGENT_MEMORY_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_AGENT_MEMORY_EVENT, onOpen);
  }, []);

  const selectedAgent = agents.find(agent => agent.id === agentId);
  const selectedRole = selectedAgent ? roles.find(role => role.id === selectedAgent.roleId) : undefined;
  const activeRoom = rooms.find(room => room.id === activeRoomId);
  const companyId = activeRoom?.companyId ?? suite.activeCompanyId;

  const memories = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return suite.agentMemories
      .filter(entry => entry.agentId === agentId)
      .filter(entry => !entry.companyId || entry.companyId === companyId)
      .filter(entry => statusFilter === 'all' || entry.status === statusFilter)
      .filter(entry => categoryFilter === 'all' || entry.category === categoryFilter)
      .filter(entry => !query || `${entry.title} ${entry.content}`.toLocaleLowerCase().includes(query))
      .sort((left, right) => {
        const rank = importanceOrder[right.importance] - importanceOrder[left.importance];
        return rank || right.updatedAt - left.updatedAt;
      });
  }, [agentId, categoryFilter, companyId, search, statusFilter, suite.agentMemories]);

  const resetForm = () => {
    setEditingId(null);
    setCategory('fact');
    setImportance('medium');
    setProjectId(activeRoom?.projectId ?? '');
    setTitle('');
    setContent('');
    setStatus('active');
    setExpiresOn('');
    setSourceRoomId(undefined);
    setSourceMessageId(undefined);
  };

  const save = () => {
    if (!agentId || !title.trim() || !content.trim()) return;
    const expiresAt = expiresOn ? new Date(`${expiresOn}T23:59:59`).getTime() : undefined;
    const base = {
      agentId,
      companyId,
      category,
      title,
      content,
      status,
      importance,
      ...(projectId ? { projectId } : {}),
      ...(sourceRoomId ? { sourceRoomId } : {}),
      ...(sourceMessageId ? { sourceMessageId } : {}),
      ...(expiresAt ? { expiresAt } : {}),
    };
    if (editingId) {
      updateAgentMemory(editingId, base);
    } else {
      addAgentMemory(base);
    }
    resetForm();
  };

  const edit = (entry: AgentMemoryEntry) => {
    setEditingId(entry.id);
    setAgentId(entry.agentId);
    setCategory(entry.category);
    setImportance(entry.importance);
    setProjectId(entry.projectId ?? '');
    setTitle(entry.title);
    setContent(entry.content);
    setStatus(entry.status);
    setExpiresOn(entry.expiresAt ? new Date(entry.expiresAt).toISOString().slice(0, 10) : '');
    setSourceRoomId(entry.sourceRoomId);
    setSourceMessageId(entry.sourceMessageId);
  };

  const openSource = (entry: AgentMemoryEntry) => {
    if (!entry.sourceRoomId || !rooms.some(room => room.id === entry.sourceRoomId)) return;
    setActiveRoom(entry.sourceRoomId);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/45 p-5" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="flex h-[88vh] w-[min(1180px,96vw)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Persistent Agent Memory">
        <aside className="w-[315px] shrink-0 border-e border-slate-200 bg-slate-50 p-4">
          <div className="mb-4 flex items-center gap-3">
            {selectedAgent ? <AgentAvatar agent={selectedAgent} role={selectedRole} size="md" /> : <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-200">🧠</span>}
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-slate-900">{selectedAgent?.name ?? 'Agent Memory'}</div>
              <div className="truncate text-xs text-slate-500">{selectedRole?.name ?? 'Persistent professional memory'}</div>
            </div>
          </div>

          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Agent</label>
          <select value={agentId} onChange={event => { setAgentId(event.target.value); resetForm(); }} className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs">
            {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name} · {roles.find(role => role.id === agent.roleId)?.name ?? 'Specialist'}</option>)}
          </select>

          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Search memories</label>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search title or content…" className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs" />

          <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-slate-200/60 p-1 text-[10px] font-semibold">
            {(['active', 'all'] as const).map(value => <button key={value} type="button" onClick={() => setStatusFilter(value)} className={`rounded-md px-2 py-1.5 capitalize ${statusFilter === value ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500'}`}>{value}</button>)}
          </div>

          <div className="max-h-[48vh] space-y-1 overflow-y-auto pe-1">
            <button type="button" onClick={() => setCategoryFilter('all')} className={`w-full rounded-md px-2 py-1.5 text-start text-xs ${categoryFilter === 'all' ? 'bg-violet-100 font-semibold text-violet-700' : 'text-slate-600 hover:bg-white'}`}>All categories</button>
            {categories.map(item => {
              const count = suite.agentMemories.filter(entry => entry.agentId === agentId && entry.category === item.value && (statusFilter === 'all' || entry.status === statusFilter)).length;
              return <button key={item.value} type="button" onClick={() => setCategoryFilter(item.value)} className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-start text-xs ${categoryFilter === item.value ? 'bg-violet-100 font-semibold text-violet-700' : 'text-slate-600 hover:bg-white'}`}><span>{item.icon} {item.label}</span><span className="text-[10px] text-slate-400">{count}</span></button>;
            })}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Persistent Agent Memory</h2>
              <p className="mt-0.5 text-xs text-slate-500">Durable knowledge for this specialist. Active Company + Project memories are automatically included in Copy Context.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close memory">✕</button>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-h-0 overflow-y-auto p-4">
              {memories.length === 0 ? (
                <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                  <div><div className="text-3xl">🧠</div><div className="mt-2 text-sm font-semibold text-slate-700">No matching memories yet</div><p className="mt-1 text-xs text-slate-500">Add one manually or use “Remember” on a discussion message.</p></div>
                </div>
              ) : (
                <div className="space-y-2">
                  {memories.map(entry => {
                    const sourceRoom = entry.sourceRoomId ? rooms.find(room => room.id === entry.sourceRoomId) : undefined;
                    const scopeProject = entry.projectId ? projects.find(project => project.id === entry.projectId) : undefined;
                    const expired = Boolean(entry.expiresAt && entry.expiresAt <= Date.now());
                    return (
                      <article key={entry.id} className={`rounded-xl border p-3 ${entry.status === 'active' && !expired ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-75'}`}>
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap items-center gap-1.5">
                              <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-700">{categoryLabel(entry.category)}</span>
                              <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${entry.importance === 'high' ? 'bg-rose-50 text-rose-700' : entry.importance === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{entry.importance}</span>
                              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700">{scopeProject ? `${scopeProject.emoji} ${scopeProject.name}` : 'Company-wide'}</span>
                              {expired ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">EXPIRED</span> : null}
                            </div>
                            <h3 className="text-sm font-bold text-slate-900">{entry.title}</h3>
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{entry.content}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                              <span>Updated {new Date(entry.updatedAt).toLocaleString()}</span>
                              {sourceRoom ? <button type="button" onClick={() => openSource(entry)} className="font-semibold text-blue-600 hover:text-blue-700">Source: {sourceRoom.name}</button> : null}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col gap-1">
                            <select value={entry.status} onChange={event => updateAgentMemory(entry.id, { status: event.target.value as AgentMemoryStatus })} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] capitalize text-slate-600">
                              {statuses.map(value => <option key={value} value={value}>{value}</option>)}
                            </select>
                            <button type="button" onClick={() => edit(entry)} className="rounded-md px-2 py-1 text-[10px] font-semibold text-blue-600 hover:bg-blue-50">Edit</button>
                            <button type="button" onClick={() => { if (window.confirm('Delete this memory permanently?')) deleteAgentMemory(entry.id); }} className="rounded-md px-2 py-1 text-[10px] font-semibold text-rose-600 hover:bg-rose-50">Delete</button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <aside className="overflow-y-auto border-s border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">{editingId ? 'Edit Memory' : 'Add Memory'}</h3>
                {editingId ? <button type="button" onClick={resetForm} className="text-[10px] font-semibold text-slate-500 hover:text-slate-800">Cancel edit</button> : null}
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Category<select value={category} onChange={event => setCategory(event.target.value as AgentMemoryCategory)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-normal normal-case text-slate-700">{categories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Importance<select value={importance} onChange={event => setImportance(event.target.value as AgentMemoryImportance)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-normal normal-case text-slate-700"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
                </div>

                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Scope<select value={projectId} onChange={event => setProjectId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-normal normal-case text-slate-700"><option value="">Company-wide memory</option>{projects.map(project => <option key={project.id} value={project.id}>{project.emoji} {project.name}</option>)}</select></label>

                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Title<input value={title} onChange={event => setTitle(event.target.value)} placeholder="What should this agent remember?" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-normal normal-case text-slate-800" /></label>

                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Memory<textarea value={content} onChange={event => setContent(event.target.value)} rows={8} placeholder="Durable fact, decision, assumption, risk, constraint, lesson…" className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-normal normal-case leading-5 text-slate-800" /></label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Status<select value={status} onChange={event => setStatus(event.target.value as AgentMemoryStatus)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-normal capitalize text-slate-700">{statuses.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Expires<input type="date" value={expiresOn} onChange={event => setExpiresOn(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-normal text-slate-700" /></label>
                </div>

                {(sourceRoomId || sourceMessageId) ? <div className="rounded-lg border border-blue-100 bg-blue-50 p-2 text-[10px] leading-4 text-blue-700">Source provenance is attached to this memory{sourceRoomId ? ` from ${rooms.find(room => room.id === sourceRoomId)?.name ?? 'the discussion room'}` : ''}.</div> : null}

                <button type="button" onClick={save} disabled={!agentId || !title.trim() || !content.trim()} className="w-full rounded-lg bg-violet-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40">{editingId ? 'Save Changes' : 'Save to Persistent Memory'}</button>
                <p className="text-[10px] leading-4 text-slate-400">Only active, non-expired memories for this Agent and the current Company/Project are injected into Copy Context. Room conversation history remains separate.</p>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}
