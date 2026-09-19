import { useEffect, useMemo, useState } from 'react';
import { copyText } from '@/lib/clipboard';
import { openAgentMemory } from '@/lib/agentMemory';
import {
  OPEN_MEMORY_CENTER_EVENT,
  type MemoryCenterTab,
  type OpenMemoryCenterDetail,
} from '@/lib/memoryCenter';
import {
  acceptMemorySuggestion,
  addMemoryRelation,
  addSharedMemory,
  buildMemoryDigest,
  deleteMemoryRelation,
  deleteSharedMemory,
  dismissMemorySuggestion,
  loadMemoryV2,
  memoryLabelByRef,
  MEMORY_V2_EVENT,
  setMemoryConflictStatus,
  unifiedMemories,
  updateSharedMemory,
  type MemoryRelationType,
  type MemoryV2State,
  type SharedMemoryEntry,
  type SharedMemoryScope,
} from '@/lib/memoryV2';
import {
  loadWorkspaceSuite,
  WORKSPACE_SUITE_EVENT,
  type AgentMemoryCategory,
  type AgentMemoryImportance,
  type AgentMemoryStatus,
} from '@/lib/workspaceSuite';
import { useWorkspaceStore } from '@/store/workspaceStore';

const TABS: Array<{ id: MemoryCenterTab; label: string }> = [
  { id: 'shared', label: 'Company / Project' },
  { id: 'suggestions', label: 'Suggestions' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'relations', label: 'Relationships' },
  { id: 'digest', label: 'Digest' },
  { id: 'timeline', label: 'Timeline' },
];

const CATEGORIES: AgentMemoryCategory[] = ['decision', 'assumption', 'risk', 'constraint', 'preference', 'fact', 'open-question', 'lesson', 'protocol'];
const IMPORTANCE: AgentMemoryImportance[] = ['high', 'medium', 'low'];
const RELATIONS: MemoryRelationType[] = ['supersedes', 'derived-from', 'supports', 'contradicts'];

function badge(value: string): string {
  return value.replace('-', ' ').toUpperCase();
}

export function MemoryCenterDialogHost() {
  const agents = useWorkspaceStore(state => state.agents);
  const roles = useWorkspaceStore(state => state.roles);
  const projects = useWorkspaceStore(state => state.projects);
  const rooms = useWorkspaceStore(state => state.rooms);
  const activeRoom = useWorkspaceStore(state => state.rooms.find(room => room.id === state.activeRoomId));
  const [state, setState] = useState<MemoryV2State>(() => loadMemoryV2());
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<MemoryCenterTab>('shared');
  const [scope, setScope] = useState<Exclude<SharedMemoryScope, 'agent-system'>>('company');
  const [projectId, setProjectId] = useState(activeRoom?.projectId ?? '');
  const [category, setCategory] = useState<AgentMemoryCategory>('fact');
  const [importance, setImportance] = useState<AgentMemoryImportance>('medium');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fromRef, setFromRef] = useState('');
  const [toRef, setToRef] = useState('');
  const [relationType, setRelationType] = useState<MemoryRelationType>('supports');
  const [relationNote, setRelationNote] = useState('');
  const [digestProjectId, setDigestProjectId] = useState(activeRoom?.projectId ?? '');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const refresh = () => setState(loadMemoryV2());
    window.addEventListener(MEMORY_V2_EVENT, refresh);
    window.addEventListener(WORKSPACE_SUITE_EVENT, refresh);
    return () => {
      window.removeEventListener(MEMORY_V2_EVENT, refresh);
      window.removeEventListener(WORKSPACE_SUITE_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenMemoryCenterDetail>).detail;
      if (detail?.tab) setTab(detail.tab);
      setProjectId(activeRoom?.projectId ?? '');
      setDigestProjectId(activeRoom?.projectId ?? '');
      setOpen(true);
    };
    window.addEventListener(OPEN_MEMORY_CENTER_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_MEMORY_CENTER_EVENT, onOpen);
  }, [activeRoom?.projectId]);

  const suite = loadWorkspaceSuite();
  const companyId = activeRoom?.companyId ?? suite.activeCompanyId;
  const currentCompany = suite.companies.find(company => company.id === companyId);
  const memoryOptions = useMemo(() => unifiedMemories().filter(item => item.status === 'active'), [state]);

  const shared = useMemo(() => state.sharedMemories
    .filter(item => item.companyId === companyId)
    .sort((a, b) => b.updatedAt - a.updatedAt), [companyId, state.sharedMemories]);

  const pendingSuggestions = state.suggestions.filter(item => item.status === 'pending');
  const openConflicts = state.conflicts.filter(item => item.status === 'open');

  const digestEntries = useMemo(() => memoryOptions.filter(item => {
    if (item.companyId && item.companyId !== companyId) return false;
    if (!item.projectId) return true;
    return Boolean(digestProjectId && item.projectId === digestProjectId);
  }), [companyId, digestProjectId, memoryOptions]);
  const digest = useMemo(() => buildMemoryDigest(digestEntries), [digestEntries]);

  const resetForm = () => {
    setEditingId(null);
    setScope('company');
    setProjectId(activeRoom?.projectId ?? '');
    setCategory('fact');
    setImportance('medium');
    setTitle('');
    setContent('');
  };

  const saveShared = () => {
    if (!title.trim() || !content.trim()) return;
    const payload = {
      scope,
      companyId,
      ...(scope === 'project' && projectId ? { projectId } : {}),
      category,
      title,
      content,
      status: 'active' as AgentMemoryStatus,
      importance,
    };
    if (editingId) updateSharedMemory(editingId, payload);
    else addSharedMemory(payload);
    resetForm();
  };

  const editShared = (entry: SharedMemoryEntry) => {
    if (entry.scope === 'agent-system') return;
    setEditingId(entry.id);
    setScope(entry.scope);
    setProjectId(entry.projectId ?? '');
    setCategory(entry.category);
    setImportance(entry.importance);
    setTitle(entry.title);
    setContent(entry.content);
  };

  const createRelation = () => {
    if (!fromRef || !toRef) return;
    addMemoryRelation(fromRef, toRef, relationType, relationNote);
    setRelationNote('');
  };

  const copyDigest = async () => {
    await copyText(digest);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] grid place-items-center bg-slate-950/50 p-5" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="flex h-[90vh] w-[min(1280px,97vw)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Memory Center">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">◈ Memory Center</h2>
            <p className="mt-0.5 text-xs text-slate-500">{currentCompany?.emoji} {currentCompany?.name ?? 'Company'} · company memory, project memory, local suggestions, conflicts and history</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setOpen(false); openAgentMemory(); }} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100">🧠 Agent Memory</button>
            <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">✕</button>
          </div>
        </header>

        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-4 py-2">
          {TABS.map(item => {
            const count = item.id === 'suggestions' ? pendingSuggestions.length : item.id === 'conflicts' ? openConflicts.length : undefined;
            return <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${tab === item.id ? 'bg-white text-violet-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-white hover:text-slate-700'}`}>{item.label}{count ? ` (${count})` : ''}</button>;
          })}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === 'shared' ? (
            <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-bold text-slate-900">{editingId ? 'Edit shared memory' : 'Add shared memory'}</h3>
                <p className="mt-1 text-xs text-slate-500">Company memories are visible across projects. Project memories stay inside one project.</p>
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setScope('company')} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${scope === 'company' ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-600'}`}>🏢 Company</button>
                    <button type="button" onClick={() => setScope('project')} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${scope === 'project' ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-600'}`}>📁 Project</button>
                  </div>
                  {scope === 'project' ? <select value={projectId} onChange={event => setProjectId(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"><option value="">Select project…</option>{projects.map(project => <option key={project.id} value={project.id}>{project.emoji} {project.name}</option>)}</select> : null}
                  <div className="grid grid-cols-2 gap-2">
                    <select value={category} onChange={event => setCategory(event.target.value as AgentMemoryCategory)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs">{CATEGORIES.map(item => <option key={item} value={item}>{badge(item)}</option>)}</select>
                    <select value={importance} onChange={event => setImportance(event.target.value as AgentMemoryImportance)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs">{IMPORTANCE.map(item => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select>
                  </div>
                  <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Memory title" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                  <textarea value={content} onChange={event => setContent(event.target.value)} rows={8} placeholder="Durable fact, decision, risk, constraint or working knowledge…" className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-5" />
                  <div className="flex gap-2"><button type="button" onClick={saveShared} disabled={!title.trim() || !content.trim() || (scope === 'project' && !projectId)} className="flex-1 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{editingId ? 'Save changes' : 'Add memory'}</button>{editingId ? <button type="button" onClick={resetForm} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-600">Cancel</button> : null}</div>
                </div>
              </div>

              <div className="space-y-2">
                {shared.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">No company or project memories yet.</div> : shared.map(entry => {
                  const project = entry.projectId ? projects.find(item => item.id === entry.projectId) : undefined;
                  const system = entry.scope === 'agent-system';
                  return <article key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap gap-1.5 text-[9px] font-bold uppercase"><span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">{system ? 'SYSTEM / OLIVIA' : entry.scope}</span><span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{badge(entry.category)}</span><span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">{entry.importance}</span>{project ? <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{project.emoji} {project.name}</span> : null}</div>
                        <h3 className="text-sm font-bold text-slate-900">{entry.title}</h3><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{entry.content}</p>
                        <div className="mt-2 text-[10px] text-slate-400">Updated {new Date(entry.updatedAt).toLocaleString()} · {entry.status}</div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">{!system ? <><button type="button" onClick={() => editShared(entry)} className="rounded-md px-2 py-1 text-[10px] font-semibold text-blue-600 hover:bg-blue-50">Edit</button><select value={entry.status} onChange={event => updateSharedMemory(entry.id, { status: event.target.value as AgentMemoryStatus })} className="rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-600"><option value="active">Active</option><option value="resolved">Resolved</option><option value="superseded">Superseded</option><option value="archived">Archived</option></select><button type="button" onClick={() => { if (window.confirm('Delete this shared memory?')) deleteSharedMemory(entry.id); }} className="rounded-md px-2 py-1 text-[10px] font-semibold text-rose-600 hover:bg-rose-50">Delete</button></> : <span className="rounded bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-500">Auto-managed</span>}</div>
                    </div>
                  </article>;
                })}
              </div>
            </div>
          ) : null}

          {tab === 'suggestions' ? <div className="space-y-3">{pendingSuggestions.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">No pending suggestions. Local rules will propose memories when messages contain durable decisions, risks, constraints, assumptions, protocols or open questions.</div> : pendingSuggestions.map(item => {
            const room = rooms.find(roomItem => roomItem.id === item.sourceRoomId);
            const agent = item.agentId ? agents.find(agentItem => agentItem.id === item.agentId) : undefined;
            const project = item.projectId ? projects.find(projectItem => projectItem.id === item.projectId) : undefined;
            return <article key={item.id} className="rounded-xl border border-violet-100 bg-violet-50/40 p-4"><div className="flex items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap gap-1.5 text-[9px] font-bold uppercase"><span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-700">LOCAL SUGGESTION</span><span className="rounded bg-white px-1.5 py-0.5 text-slate-600">{item.target}{agent ? ` · ${agent.name}` : ''}{project ? ` · ${project.name}` : ''}</span><span className="rounded bg-white px-1.5 py-0.5 text-slate-600">{badge(item.category)}</span></div><h3 className="text-sm font-bold text-slate-900">{item.title}</h3><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{item.content}</p><div className="mt-2 text-[10px] text-slate-400">Source: {room?.name ?? 'room'} · {item.reasons.join(' ')}</div></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => acceptMemorySuggestion(item.id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Accept</button><button type="button" onClick={() => dismissMemorySuggestion(item.id)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Dismiss</button></div></div></article>;
          })}</div> : null}

          {tab === 'conflicts' ? <div className="space-y-3">{openConflicts.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">No potential conflicts detected among active memories.</div> : openConflicts.map(item => <article key={item.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4"><div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Potential conflict</div><div className="mt-2 grid gap-2 md:grid-cols-2"><div className="rounded-lg bg-white p-3 text-xs font-semibold text-slate-700">{memoryLabelByRef(item.leftRef)}</div><div className="rounded-lg bg-white p-3 text-xs font-semibold text-slate-700">{memoryLabelByRef(item.rightRef)}</div></div><p className="mt-2 text-xs text-slate-600">{item.reason}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { addMemoryRelation(item.leftRef, item.rightRef, 'contradicts', 'Confirmed while resolving a detected conflict.'); setMemoryConflictStatus(item.id, 'resolved'); }} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white">Confirm contradiction</button><button type="button" onClick={() => setMemoryConflictStatus(item.id, 'resolved')} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-700">Mark reviewed</button><button type="button" onClick={() => setMemoryConflictStatus(item.id, 'dismissed')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600">Dismiss</button></div></article>)}</div> : null}

          {tab === 'relations' ? <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]"><div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="text-sm font-bold text-slate-900">Link memories</h3><div className="mt-3 space-y-2"><select value={fromRef} onChange={event => setFromRef(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"><option value="">From memory…</option>{memoryOptions.map(item => <option key={item.ref} value={item.ref}>{item.title}</option>)}</select><select value={relationType} onChange={event => setRelationType(event.target.value as MemoryRelationType)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs">{RELATIONS.map(item => <option key={item} value={item}>{badge(item)}</option>)}</select><select value={toRef} onChange={event => setToRef(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"><option value="">To memory…</option>{memoryOptions.map(item => <option key={item.ref} value={item.ref}>{item.title}</option>)}</select><input value={relationNote} onChange={event => setRelationNote(event.target.value)} placeholder="Optional note" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs" /><button type="button" onClick={createRelation} disabled={!fromRef || !toRef || fromRef === toRef} className="w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Create relationship</button></div></div><div className="space-y-2">{state.relations.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No explicit memory relationships yet.</div> : state.relations.map(item => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"><div className="min-w-0 flex-1 text-xs text-slate-700"><strong>{memoryLabelByRef(item.fromRef)}</strong> <span className="mx-1 rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-violet-700">{item.type}</span> <strong>{memoryLabelByRef(item.toRef)}</strong>{item.note ? <div className="mt-1 text-[10px] text-slate-400">{item.note}</div> : null}</div><button type="button" onClick={() => deleteMemoryRelation(item.id)} className="text-xs text-rose-500 hover:text-rose-700">✕</button></div>)}</div></div> : null}

          {tab === 'digest' ? <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]"><div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="text-sm font-bold text-slate-900">Compact memory digest</h3><p className="mt-1 text-xs leading-5 text-slate-500">This deterministic compression keeps high-value titles and short excerpts. It uses no external AI API.</p><select value={digestProjectId} onChange={event => setDigestProjectId(event.target.value)} className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"><option value="">Company-wide only</option>{projects.map(project => <option key={project.id} value={project.id}>{project.emoji} {project.name}</option>)}</select><div className="mt-3 text-xs text-slate-500">{digestEntries.length} active memories included before compression.</div><button type="button" onClick={copyDigest} className="mt-3 w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white">{copied ? '✓ Copied' : 'Copy digest'}</button></div><pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-950 p-4 text-xs leading-5 text-slate-100">{digest}</pre></div> : null}

          {tab === 'timeline' ? <div className="space-y-2">{state.history.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">Memory history is empty.</div> : state.history.map(item => <div key={item.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3"><span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-50 text-xs text-violet-700">◈</span><div className="min-w-0 flex-1"><div className="text-xs font-semibold text-slate-700">{item.label}</div><div className="mt-0.5 text-[10px] text-slate-400">{item.action} · {new Date(item.createdAt).toLocaleString()}</div></div></div>)}</div> : null}
        </div>
      </section>
    </div>
  );
}
