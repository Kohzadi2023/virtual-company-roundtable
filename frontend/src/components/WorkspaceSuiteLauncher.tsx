import { useEffect, useMemo, useRef, useState } from 'react';
import { copyText } from '@/lib/clipboard';
import { newId } from '@/lib/id';
import {
  appLockEnabled,
  configureAppLock,
  deleteAutomaticBackup,
  disableAppLock,
  exportEncryptedWorkspaceBackup,
  exportWorkspaceBackup,
  loadAutomaticBackups,
  loadWorkspaceSuite,
  lockSession,
  parseEncryptedWorkspaceBackup,
  parseWorkspaceBackup,
  recordAudit,
  saveAutomaticBackup,
  saveWorkspaceSuite,
  updateWorkspaceSuite,
  WORKSPACE_SUITE_EVENT,
  type AutomaticBackup,
  type RoomTemplate,
  type WorkspaceBackup,
  type WorkspaceSuiteState,
} from '@/lib/workspaceSuite';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { Room, RoomAttachment, RoomKnowledgePack, RoomVote, StorageSnapshot, VoteChoice } from '@/types/domain';

const EMPTY_KNOWLEDGE: RoomKnowledgePack = { objective: '', background: '', constraints: '', requirements: '', links: '' };
const MAX_ATTACHMENT_BYTES = 350 * 1024;
const TABS = ['Dashboard', 'Search', 'Room', 'Templates', 'Compare', 'Voting', 'Backup & Security', 'Companies', 'Audit'] as const;
type Tab = typeof TABS[number];

function snapshotNow(): StorageSnapshot {
  const state = useWorkspaceStore.getState();
  return {
    version: 4,
    rooms: state.rooms,
    roles: state.roles,
    agents: state.agents,
    teams: state.teams,
    projects: state.projects,
    decisions: state.decisions,
    actionItems: state.actionItems,
    agentContext: state.agentContext,
    activeRoomId: state.activeRoomId,
    savedAt: Date.now(),
  };
}

function patchRoom(roomId: string, patch: Partial<Room>): void {
  useWorkspaceStore.setState(state => ({
    rooms: state.rooms.map(room => room.id === roomId ? { ...room, ...patch } : room),
  }));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

function companyForRoom(room: Room, defaultCompanyId: string): string {
  return room.companyId || defaultCompanyId;
}

function restoreBackup(backup: WorkspaceBackup): void {
  const snapshot = { ...backup.snapshot, savedAt: Date.now() };
  localStorage.setItem('ai-team-chat:snapshot:v4', JSON.stringify(snapshot));
  saveWorkspaceSuite(backup.suite);
  window.location.reload();
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/40 p-5" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="flex h-[88vh] w-[min(1380px,96vw)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {children}
      </section>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">{children}</div>;
}

export function WorkspaceSuiteLauncher() {
  const rooms = useWorkspaceStore(state => state.rooms);
  const projects = useWorkspaceStore(state => state.projects);
  const decisions = useWorkspaceStore(state => state.decisions);
  const actionItems = useWorkspaceStore(state => state.actionItems);
  const agents = useWorkspaceStore(state => state.agents);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const createRoom = useWorkspaceStore(state => state.createRoom);
  const setActiveRoom = useWorkspaceStore(state => state.setActiveRoom);
  const [suite, setSuite] = useState<WorkspaceSuiteState>(() => loadWorkspaceSuite());
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('Dashboard');
  const [search, setSearch] = useState('');
  const [agendaDraft, setAgendaDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [promptName, setPromptName] = useState('');
  const [promptText, setPromptText] = useState('');
  const [voteQuestion, setVoteQuestion] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [securityPin, setSecurityPin] = useState('');
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [status, setStatus] = useState('');
  const backupTimer = useRef<number | null>(null);

  const activeRoom = rooms.find(room => room.id === activeRoomId);
  const currentCompany = suite.companies.find(company => company.id === suite.activeCompanyId) ?? suite.companies[0];

  useEffect(() => {
    const refresh = () => setSuite(loadWorkspaceSuite());
    window.addEventListener(WORKSPACE_SUITE_EVENT, refresh);
    return () => window.removeEventListener(WORKSPACE_SUITE_EVENT, refresh);
  }, []);

  useEffect(() => {
    const unsubscribe = useWorkspaceStore.subscribe((state, previous) => {
      if (state.rooms === previous.rooms && state.projects === previous.projects && state.decisions === previous.decisions && state.actionItems === previous.actionItems) return;
      if (backupTimer.current) window.clearTimeout(backupTimer.current);
      backupTimer.current = window.setTimeout(() => saveAutomaticBackup(snapshotNow()), 1200);
    });
    return () => {
      unsubscribe();
      if (backupTimer.current) window.clearTimeout(backupTimer.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
        setTab('Search');
      } else if (modifier && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setOpen(true);
        setTab('Dashboard');
      } else if (modifier && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        const id = createRoom('New Room', '🏢', [], [], activeRoom?.projectId);
        patchRoom(id, { companyId: suite.activeCompanyId, lastOpenedAt: Date.now() });
        recordAudit('room.created-shortcut', 'Created a room with Ctrl/Cmd+N.');
      } else if (modifier && event.shiftKey && event.key.toLowerCase() === 'l' && appLockEnabled()) {
        event.preventDefault();
        lockSession();
      } else if (event.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeRoom?.projectId, createRoom, open, suite.activeCompanyId]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    if (!q) return [] as Array<{ kind: string; title: string; snippet: string; roomId?: string }>;
    const result: Array<{ kind: string; title: string; snippet: string; roomId?: string }> = [];
    const add = (kind: string, title: string, text: string, roomId?: string) => {
      if (`${title} ${text}`.toLocaleLowerCase().includes(q)) result.push({ kind, title, snippet: text.slice(0, 220), ...(roomId ? { roomId } : {}) });
    };
    for (const room of rooms) {
      add('Room', room.name, `${room.tags?.join(' ') ?? ''} ${room.knowledge?.objective ?? ''} ${room.knowledge?.background ?? ''}`, room.id);
      for (const message of room.messages) add('Message', `${room.name} · ${message.authorNameSnapshot ?? message.authorType}`, `${message.content} ${message.tags?.join(' ') ?? ''}`, room.id);
      if (room.meetingMinutes) add('Minutes', `${room.name} · Meeting Minutes`, room.meetingMinutes.content, room.id);
      for (const attachment of room.attachments ?? []) add('File', `${room.name} · ${attachment.name}`, attachment.mediaType, room.id);
    }
    for (const decision of decisions) add('Decision', decision.title, `${decision.details} ${decision.evidence ?? ''}`, decision.roomId);
    for (const item of actionItems) add('Action', item.title, `${item.owner ?? ''} ${item.evidence ?? ''}`, item.roomId);
    for (const template of suite.promptTemplates) add('Prompt', template.name, `${template.description} ${template.prompt}`);
    return result.slice(0, 120);
  }, [search, rooms, decisions, actionItems, suite.promptTemplates]);

  const companyRooms = useMemo(() => rooms.filter(room => companyForRoom(room, suite.companies[0]?.id ?? 'company-default') === suite.activeCompanyId), [rooms, suite.activeCompanyId, suite.companies]);
  const recentRooms = [...companyRooms].filter(room => !room.archivedAt).sort((a, b) => (b.lastOpenedAt ?? b.createdAt) - (a.lastOpenedAt ?? a.createdAt)).slice(0, 6);
  const favoriteRooms = companyRooms.filter(room => room.favorite && !room.archivedAt);
  const openActions = actionItems.filter(item => item.status !== 'done');
  const proposedDecisions = decisions.filter(item => item.status === 'proposed');
  const pinnedMessages = rooms.flatMap(room => room.messages.filter(message => message.pinned).map(message => ({ room, message })));

  const openRoom = (roomId: string) => {
    setActiveRoom(roomId);
    useWorkspaceStore.setState(state => ({ rooms: state.rooms.map(room => room.id === roomId ? { ...room, lastOpenedAt: Date.now() } : room) }));
    setOpen(false);
  };

  const toggleFavorite = () => {
    if (!activeRoom) return;
    patchRoom(activeRoom.id, { favorite: !activeRoom.favorite });
    recordAudit('room.favorite', `${activeRoom.favorite ? 'Removed' : 'Added'} ${activeRoom.name} ${activeRoom.favorite ? 'from' : 'to'} favorites.`);
  };

  const toggleArchive = () => {
    if (!activeRoom) return;
    patchRoom(activeRoom.id, { archivedAt: activeRoom.archivedAt ? undefined : Date.now() });
    recordAudit('room.archive', `${activeRoom.archivedAt ? 'Restored' : 'Archived'} ${activeRoom.name}.`);
  };

  const addTag = () => {
    if (!activeRoom || !tagDraft.trim()) return;
    const tag = tagDraft.trim().replace(/^#/, '');
    patchRoom(activeRoom.id, { tags: Array.from(new Set([...(activeRoom.tags ?? []), tag])) });
    setTagDraft('');
  };

  const removeTag = (tag: string) => activeRoom && patchRoom(activeRoom.id, { tags: (activeRoom.tags ?? []).filter(item => item !== tag) });

  const updateKnowledge = (key: keyof RoomKnowledgePack, value: string) => {
    if (!activeRoom) return;
    patchRoom(activeRoom.id, { knowledge: { ...EMPTY_KNOWLEDGE, ...activeRoom.knowledge, [key]: value } });
  };

  const addAgenda = () => {
    if (!activeRoom || !agendaDraft.trim()) return;
    patchRoom(activeRoom.id, { agenda: [...(activeRoom.agenda ?? []), agendaDraft.trim()] });
    setAgendaDraft('');
  };

  const addAttachment = async (file: File | undefined) => {
    if (!activeRoom || !file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setStatus('Attachment is too large. Local inline attachments are limited to 350 KB each.');
      return;
    }
    const attachment: RoomAttachment = {
      id: newId(),
      name: file.name,
      mediaType: file.type || 'application/octet-stream',
      size: file.size,
      dataUrl: await readFileAsDataUrl(file),
      addedAt: Date.now(),
    };
    patchRoom(activeRoom.id, { attachments: [...(activeRoom.attachments ?? []), attachment] });
    recordAudit('attachment.added', `Added ${file.name} to ${activeRoom.name}.`);
    setStatus('Attachment added.');
  };

  const createPromptTemplate = () => {
    if (!promptName.trim() || !promptText.trim()) return;
    updateWorkspaceSuite(state => ({
      ...state,
      promptTemplates: [...state.promptTemplates, { id: newId(), name: promptName.trim(), description: 'Custom prompt template', prompt: promptText.trim(), createdAt: Date.now() }],
    }));
    recordAudit('prompt-template.created', `Created prompt template ${promptName.trim()}.`);
    setPromptName('');
    setPromptText('');
  };

  const createRoomFromTemplate = (template: RoomTemplate) => {
    const id = createRoom(template.name, template.emoji, template.agentIds, [], activeRoom?.projectId);
    patchRoom(id, {
      companyId: suite.activeCompanyId,
      templateId: template.id,
      tags: template.tags,
      agenda: template.agenda,
      knowledge: { ...EMPTY_KNOWLEDGE, objective: template.objective },
      lastOpenedAt: Date.now(),
    });
    recordAudit('room-template.applied', `Created room from ${template.name}.`);
    setOpen(false);
  };

  const saveCurrentAsTemplate = () => {
    if (!activeRoom) return;
    updateWorkspaceSuite(state => ({
      ...state,
      roomTemplates: [...state.roomTemplates, {
        id: newId(),
        name: activeRoom.name,
        emoji: activeRoom.emoji,
        description: 'Template captured from an existing room.',
        tags: activeRoom.tags ?? [],
        agenda: activeRoom.agenda ?? [],
        objective: activeRoom.knowledge?.objective ?? '',
        agentIds: activeRoom.agentIds,
        createdAt: Date.now(),
      }],
    }));
    recordAudit('room-template.created', `Saved ${activeRoom.name} as a room template.`);
    setStatus('Current room saved as a reusable template.');
  };

  const addVote = () => {
    if (!activeRoom || !voteQuestion.trim()) return;
    const vote: RoomVote = { id: newId(), question: voteQuestion.trim(), votes: {}, createdAt: Date.now() };
    patchRoom(activeRoom.id, { votes: [vote, ...(activeRoom.votes ?? [])] });
    setVoteQuestion('');
    recordAudit('vote.created', `Created a proposal vote in ${activeRoom.name}.`);
  };

  const setVote = (voteId: string, agentId: string, choice: VoteChoice) => {
    if (!activeRoom) return;
    patchRoom(activeRoom.id, {
      votes: (activeRoom.votes ?? []).map(vote => vote.id === voteId ? { ...vote, votes: { ...vote.votes, [agentId]: choice } } : vote),
    });
  };

  const latestAgentMessages = useMemo(() => {
    if (!activeRoom) return [];
    const seen = new Set<string>();
    const result = [] as typeof activeRoom.messages;
    for (const message of [...activeRoom.messages].reverse()) {
      if (message.authorType !== 'agent' || !message.authorId || seen.has(message.authorId)) continue;
      seen.add(message.authorId);
      result.push(message);
      if (result.length >= 6) break;
    }
    return result;
  }, [activeRoom]);

  const exportEncrypted = async () => {
    try {
      await exportEncryptedWorkspaceBackup(snapshotNow(), backupPassphrase);
      setStatus('Encrypted backup exported.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not export encrypted backup.');
    }
  };

  const importBackupFile = async (file: File | undefined, encrypted: boolean) => {
    if (!file) return;
    try {
      const backup = encrypted
        ? await parseEncryptedWorkspaceBackup(file, backupPassphrase)
        : await parseWorkspaceBackup(file);
      if (!window.confirm('Restore this backup? The current workspace will be replaced after reload.')) return;
      restoreBackup(backup);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Backup import failed.');
    }
  };

  // Keeps the visible active room in sync with whichever company is now
  // active. If the company has no room of its own, the previously active
  // room (which belongs to a different company) is cleared rather than left
  // showing behind an unrelated "0 rooms" workspace context.
  const reconcileActiveRoomForCompany = (companyId: string) => {
    const defaultCompanyId = suite.companies[0]?.id ?? 'company-default';
    const first = rooms.find(room => companyForRoom(room, defaultCompanyId) === companyId && !room.archivedAt);
    if (first) {
      setActiveRoom(first.id);
    } else if (activeRoom && companyForRoom(activeRoom, defaultCompanyId) !== companyId) {
      useWorkspaceStore.setState({ activeRoomId: null });
    }
  };

  const createCompany = () => {
    const name = companyName.trim();
    if (!name) return;
    const id = newId();
    updateWorkspaceSuite(state => ({
      ...state,
      companies: [...state.companies, { id, name, emoji: '🏢', description: '', createdAt: Date.now() }],
      activeCompanyId: id,
    }));
    reconcileActiveRoomForCompany(id);
    setCompanyName('');
    recordAudit('company.created', `Created company ${name}.`);
  };

  const switchCompany = (companyId: string) => {
    updateWorkspaceSuite(state => ({ ...state, activeCompanyId: companyId }));
    reconcileActiveRoomForCompany(companyId);
    recordAudit('company.switched', `Switched active company workspace.`);
  };

  const assignRoomToCompany = () => {
    if (!activeRoom) return;
    patchRoom(activeRoom.id, { companyId: suite.activeCompanyId });
    if (activeRoom.projectId) {
      useWorkspaceStore.setState(state => ({ projects: state.projects.map(project => project.id === activeRoom.projectId ? { ...project, companyId: suite.activeCompanyId } : project) }));
    }
    recordAudit('room.company-assigned', `Assigned ${activeRoom.name} to ${currentCompany?.name ?? 'company'}.`);
  };

  const enableLock = async () => {
    try {
      await configureAppLock(securityPin);
      setSecurityPin('');
      setStatus('Application PIN lock enabled. Use Ctrl+Shift+L to lock immediately.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not enable app lock.');
    }
  };

  const backups = open && tab === 'Backup & Security' ? loadAutomaticBackups() : [];

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setTab('Dashboard'); }} className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[13px] font-semibold text-violet-700 shadow-sm transition hover:bg-violet-100" title="Workspace Suite (Ctrl+K for search)">
        <span aria-hidden="true">◆</span> <span className="hidden sm:inline">Workspace</span>
      </button>

      {open && (
        <ModalShell onClose={() => setOpen(false)}>
          <aside className="w-56 shrink-0 border-e border-slate-200 bg-slate-50 p-3">
            <div className="mb-4 px-2">
              <div className="text-sm font-bold text-slate-900">Workspace Suite</div>
              <div className="mt-1 truncate text-xs text-slate-500">{currentCompany?.emoji} {currentCompany?.name}</div>
            </div>
            <nav className="space-y-1">
              {TABS.map(item => (
                <button key={item} type="button" onClick={() => setTab(item)} className={`w-full rounded-lg px-3 py-2 text-start text-xs font-semibold ${tab === item ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-white hover:text-violet-700'}`}>{item}</button>
              ))}
            </nav>
            <div className="mt-5 border-t border-slate-200 pt-3 text-[10px] leading-5 text-slate-400">
              <div>Ctrl/Cmd+K · Search</div>
              <div>Ctrl/Cmd+N · New Room</div>
              <div>Ctrl/Cmd+Shift+D · Dashboard</div>
              <div>Ctrl/Cmd+Shift+L · Lock</div>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-5">
              <div><h2 className="text-base font-bold text-slate-900">{tab}</h2><p className="text-[11px] text-slate-400">Local-first company collaboration controls</p></div>
              <div className="flex items-center gap-3">
                {status ? <span className="max-w-[520px] truncate text-xs text-violet-600">{status}</span> : null}
                <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">×</button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {tab === 'Dashboard' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-5 gap-3">
                    {[
                      ['Projects', projects.length, '📁'],
                      ['Active Rooms', companyRooms.filter(room => !room.archivedAt).length, '💬'],
                      ['Open Actions', openActions.length, '✓'],
                      ['Pending Decisions', proposedDecisions.length, '◆'],
                      ['Pinned', pinnedMessages.length, '📌'],
                    ].map(([label, value, icon]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xl">{icon}</div><div className="mt-2 text-2xl font-bold text-slate-900">{value}</div><div className="text-xs text-slate-500">{label}</div></div>)}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <section className="rounded-xl border border-slate-200 p-4"><h3 className="mb-3 text-sm font-bold">★ Favorites</h3>{favoriteRooms.length ? <div className="space-y-2">{favoriteRooms.map(room => <button key={room.id} type="button" onClick={() => openRoom(room.id)} className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-start text-xs hover:bg-violet-50"><span>{room.emoji} {room.name}</span><span className="text-slate-400">{room.messages.length} messages</span></button>)}</div> : <Empty>No favorite rooms yet.</Empty>}</section>
                    <section className="rounded-xl border border-slate-200 p-4"><h3 className="mb-3 text-sm font-bold">Recent Rooms</h3><div className="space-y-2">{recentRooms.map(room => <button key={room.id} type="button" onClick={() => openRoom(room.id)} className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-start text-xs hover:bg-violet-50"><span>{room.emoji} {room.name}</span><span className="text-slate-400">{new Date(room.lastOpenedAt ?? room.createdAt).toLocaleDateString()}</span></button>)}</div></section>
                  </div>
                  <section className="rounded-xl border border-slate-200 p-4"><h3 className="mb-3 text-sm font-bold">Archived Rooms</h3>{companyRooms.filter(room => room.archivedAt).length ? <div className="flex flex-wrap gap-2">{companyRooms.filter(room => room.archivedAt).map(room => <button key={room.id} onClick={() => { patchRoom(room.id, { archivedAt: undefined }); recordAudit('room.restored', `Restored ${room.name}.`); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs hover:bg-slate-50">↩ {room.name}</button>)}</div> : <span className="text-xs text-slate-400">No archived rooms.</span>}</section>
                </div>
              )}

              {tab === 'Search' && (
                <div className="space-y-4">
                  <input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="Search rooms, messages, minutes, decisions, tasks, files and prompts…" className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                  <div className="space-y-2">{searchResults.map((result, index) => <button key={`${result.kind}-${index}`} type="button" onClick={() => result.roomId ? openRoom(result.roomId) : undefined} className="block w-full rounded-xl border border-slate-200 p-3 text-start hover:border-violet-200 hover:bg-violet-50/40"><div className="flex items-center gap-2"><span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">{result.kind}</span><strong className="text-sm text-slate-800">{result.title}</strong></div><p className="mt-1 line-clamp-2 text-xs text-slate-500">{result.snippet}</p></button>)}</div>
                  {search && searchResults.length === 0 ? <Empty>No matching workspace content.</Empty> : null}
                </div>
              )}

              {tab === 'Room' && activeRoom && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4"><div><h3 className="font-bold">{activeRoom.emoji} {activeRoom.name}</h3><p className="text-xs text-slate-500">Room controls, knowledge, agenda, tags and files</p></div><div className="flex gap-2"><button onClick={toggleFavorite} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">{activeRoom.favorite ? '★ Favorite' : '☆ Favorite'}</button><button onClick={toggleArchive} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">{activeRoom.archivedAt ? '↩ Restore' : 'Archive'}</button></div></div>
                  <section className="rounded-xl border border-slate-200 p-4"><h3 className="mb-3 text-sm font-bold">Tags & Labels</h3><div className="mb-3 flex flex-wrap gap-2">{(activeRoom.tags ?? []).map(tag => <button key={tag} onClick={() => removeTag(tag)} className="rounded-full bg-violet-50 px-3 py-1 text-xs text-violet-700">#{tag} ×</button>)}</div><div className="flex gap-2"><input value={tagDraft} onChange={event => setTagDraft(event.target.value)} onKeyDown={event => event.key === 'Enter' && addTag()} placeholder="architecture" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs"/><button onClick={addTag} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white">Add tag</button></div></section>
                  <section className="rounded-xl border border-slate-200 p-4"><h3 className="mb-3 text-sm font-bold">Room Knowledge Pack</h3><div className="grid grid-cols-2 gap-3">{(['objective','background','constraints','requirements','links'] as const).map(key => <label key={key} className={key === 'links' ? 'col-span-2' : ''}><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">{key}</span><textarea value={{...EMPTY_KNOWLEDGE,...activeRoom.knowledge}[key]} onChange={event => updateKnowledge(key, event.target.value)} rows={key === 'links' ? 2 : 4} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs" /></label>)}</div></section>
                  <section className="rounded-xl border border-slate-200 p-4"><h3 className="mb-3 text-sm font-bold">Agenda</h3><div className="space-y-2">{(activeRoom.agenda ?? []).map((item, index) => <div key={`${item}-${index}`} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"><span className="font-bold text-violet-600">{index + 1}.</span><span className="flex-1">{item}</span><button onClick={() => patchRoom(activeRoom.id, { agenda: (activeRoom.agenda ?? []).filter((_, i) => i !== index) })} className="text-rose-500">×</button></div>)}</div><div className="mt-3 flex gap-2"><input value={agendaDraft} onChange={event => setAgendaDraft(event.target.value)} onKeyDown={event => event.key === 'Enter' && addAgenda()} placeholder="Add agenda item" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs"/><button onClick={addAgenda} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white">Add</button></div></section>
                  <section className="rounded-xl border border-slate-200 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold">Files / Attachments</h3><label className="cursor-pointer rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">+ Add File<input type="file" className="hidden" onChange={event => void addAttachment(event.target.files?.[0])}/></label></div><p className="mb-3 text-[10px] text-slate-400">Inline local attachments are capped at 350 KB each to protect the 5 MiB workspace snapshot limit.</p><div className="space-y-2">{(activeRoom.attachments ?? []).map(file => <div key={file.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2"><span className="text-lg">📎</span><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{file.name}</div><div className="text-[10px] text-slate-400">{Math.ceil(file.size/1024)} KB · {file.mediaType}</div></div><a href={file.dataUrl} download={file.name} className="text-xs font-semibold text-blue-600">Download</a><button onClick={() => patchRoom(activeRoom.id, { attachments: (activeRoom.attachments ?? []).filter(item => item.id !== file.id) })} className="text-xs text-rose-500">Delete</button></div>)}</div></section>
                </div>
              )}

              {tab === 'Templates' && (
                <div className="grid grid-cols-2 gap-5">
                  <section className="rounded-xl border border-slate-200 p-4"><h3 className="mb-3 text-sm font-bold">Prompt Templates</h3><div className="max-h-[44vh] space-y-2 overflow-y-auto">{suite.promptTemplates.map(template => <div key={template.id} className="rounded-lg border border-slate-200 p-3"><div className="flex items-center justify-between"><strong className="text-xs">{template.name}</strong><button onClick={() => void copyText(template.prompt)} className="text-[10px] font-semibold text-blue-600">Copy Prompt</button></div><p className="mt-1 text-[10px] text-slate-400">{template.description}</p><p className="mt-2 line-clamp-3 text-xs text-slate-600">{template.prompt}</p></div>)}</div><div className="mt-4 space-y-2 border-t border-slate-200 pt-3"><input value={promptName} onChange={event => setPromptName(event.target.value)} placeholder="Template name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"/><textarea value={promptText} onChange={event => setPromptText(event.target.value)} placeholder="Reusable prompt instructions" rows={4} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"/><button onClick={createPromptTemplate} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white">Save Prompt Template</button></div></section>
                  <section className="rounded-xl border border-slate-200 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold">Room Templates</h3><button onClick={saveCurrentAsTemplate} disabled={!activeRoom} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold disabled:opacity-40">Save Current</button></div><div className="space-y-2">{suite.roomTemplates.map(template => <div key={template.id} className="rounded-lg border border-slate-200 p-3"><div className="flex items-center justify-between"><strong className="text-xs">{template.emoji} {template.name}</strong><button onClick={() => createRoomFromTemplate(template)} className="rounded-md bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white">Create Room</button></div><p className="mt-1 text-[10px] text-slate-400">{template.description}</p><div className="mt-2 flex flex-wrap gap-1">{template.tags.map(tag => <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px]">#{tag}</span>)}</div></div>)}</div></section>
                </div>
              )}

              {tab === 'Compare' && (
                <div className="space-y-4"><p className="text-xs text-slate-500">Latest distinct specialist responses in the active room, shown side-by-side for manual comparison.</p>{latestAgentMessages.length ? <div className="grid grid-cols-3 gap-3">{latestAgentMessages.map(message => { const agent = agents.find(item => item.id === message.authorId); return <article key={message.id} className="rounded-xl border border-slate-200 p-4"><div className="mb-2 text-xs font-bold">{agent?.emoji} {agent?.name ?? message.authorNameSnapshot}</div><div className="max-h-[48vh] overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-slate-600">{message.content}</div></article>; })}</div> : <Empty>No specialist responses to compare yet.</Empty>}</div>
              )}

              {tab === 'Voting' && activeRoom && (
                <div className="space-y-4"><div className="flex gap-2"><input value={voteQuestion} onChange={event => setVoteQuestion(event.target.value)} placeholder="Proposal to vote on…" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs"/><button onClick={addVote} className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white">Create Vote</button></div>{(activeRoom.votes ?? []).map(vote => <section key={vote.id} className="rounded-xl border border-slate-200 p-4"><h3 className="mb-3 text-sm font-bold">{vote.question}</h3><div className="grid grid-cols-2 gap-2">{activeRoom.agentIds.map(agentId => { const agent=agents.find(item=>item.id===agentId); return <div key={agentId} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><span className="min-w-28 truncate text-xs font-semibold">{agent?.name ?? agentId}</span><select value={vote.votes[agentId] ?? 'abstain'} onChange={event => setVote(vote.id, agentId, event.target.value as VoteChoice)} className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"><option value="agree">✅ Agree</option><option value="concern">⚠ Concern</option><option value="disagree">❌ Disagree</option><option value="abstain">— Abstain</option></select></div>; })}</div><div className="mt-3 text-[10px] text-slate-400">Agree {Object.values(vote.votes).filter(v=>'agree'===v).length} · Concern {Object.values(vote.votes).filter(v=>'concern'===v).length} · Disagree {Object.values(vote.votes).filter(v=>'disagree'===v).length}</div></section>)}</div>
              )}

              {tab === 'Backup & Security' && (
                <div className="grid grid-cols-2 gap-5">
                  <section className="space-y-4 rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-bold">Backup / Restore</h3><div className="flex flex-wrap gap-2"><button onClick={() => exportWorkspaceBackup(snapshotNow())} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Export .json</button><label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">Import .json<input type="file" accept=".json" className="hidden" onChange={event => void importBackupFile(event.target.files?.[0], false)}/></label></div><div className="border-t border-slate-200 pt-3"><label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Encryption passphrase</label><input type="password" value={backupPassphrase} onChange={event=>setBackupPassphrase(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"/><div className="mt-2 flex gap-2"><button onClick={() => void exportEncrypted()} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Export Encrypted</button><label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">Import Encrypted<input type="file" accept=".vcbackup" className="hidden" onChange={event => void importBackupFile(event.target.files?.[0], true)}/></label></div></div><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={suite.autoBackupEnabled} onChange={event => updateWorkspaceSuite(state=>({...state,autoBackupEnabled:event.target.checked}))}/> Keep rolling automatic local backups</label><div className="max-h-56 space-y-2 overflow-y-auto">{backups.map((backup: AutomaticBackup)=><div key={backup.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><span className="flex-1 text-[10px] text-slate-500">{new Date(backup.createdAt).toLocaleString()}</span><button onClick={()=>restoreBackup({format:'virtual-company-backup',version:1,createdAt:backup.createdAt,snapshot:backup.snapshot,suite:backup.suite})} className="text-[10px] font-semibold text-blue-600">Restore</button><button onClick={()=>{deleteAutomaticBackup(backup.id);setStatus('Backup deleted.')}} className="text-[10px] text-rose-500">Delete</button></div>)}</div></section>
                  <section className="space-y-4 rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-bold">App Lock</h3><p className="text-xs leading-5 text-slate-500">Local PIN lock protects access to the UI. Encrypted backup uses PBKDF2 + AES-256-GCM. The normal SQLite snapshot is not SQLCipher-encrypted.</p>{appLockEnabled()?<div className="space-y-2"><div className="rounded-lg bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">PIN lock enabled</div><button onClick={lockSession} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Lock Now</button><button onClick={()=>{if(window.confirm('Disable the local PIN lock?'))disableAppLock();}} className="ms-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600">Disable Lock</button></div>:<div className="space-y-2"><input type="password" inputMode="numeric" value={securityPin} onChange={event=>setSecurityPin(event.target.value)} placeholder="4–12 digit PIN" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"/><button onClick={()=>void enableLock()} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white">Enable PIN Lock</button></div>}</section>
                </div>
              )}

              {tab === 'Companies' && (
                <div className="space-y-4"><div className="flex gap-2"><input value={companyName} onChange={event=>setCompanyName(event.target.value)} placeholder="New company name" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs"/><button onClick={createCompany} className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white">Create Company</button></div><div className="grid grid-cols-3 gap-3">{suite.companies.map(company=>{const count=rooms.filter(room=>companyForRoom(room,suite.companies[0].id)===company.id).length;return <button key={company.id} onClick={()=>switchCompany(company.id)} className={`rounded-xl border p-4 text-start ${company.id===suite.activeCompanyId?'border-violet-400 bg-violet-50':'border-slate-200 hover:bg-slate-50'}`}><div className="text-lg">{company.emoji}</div><div className="mt-1 text-sm font-bold">{company.name}</div><div className="text-[10px] text-slate-400">{count} rooms</div></button>})}</div>{activeRoom?<div className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between"><div><strong className="text-sm">Assign active room</strong><p className="text-xs text-slate-400">{activeRoom.name} → {currentCompany?.name}</p></div><button onClick={assignRoomToCompany} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Assign</button></div></div>:null}</div>
              )}

              {tab === 'Audit' && (
                <div className="space-y-2">{suite.auditLog.length?suite.auditLog.map(entry=><div key={entry.id} className="rounded-lg border border-slate-200 px-3 py-2"><div className="flex items-center justify-between"><strong className="text-xs text-slate-700">{entry.action}</strong><time className="text-[10px] text-slate-400">{new Date(entry.createdAt).toLocaleString()}</time></div><p className="mt-1 text-xs text-slate-500">{entry.details}</p></div>):<Empty>No audit events recorded yet.</Empty>}</div>
              )}

              {(tab === 'Room' || tab === 'Voting' || tab === 'Compare') && !activeRoom ? <Empty>Select or create a room first.</Empty> : null}
            </div>
          </div>
        </ModalShell>
      )}
    </>
  );
}
