import { useEffect, useMemo, useRef, useState } from 'react';
import { getExternalAgentChat } from '@/lib/meetingOrchestration';
import { openAgentMemory } from '@/lib/agentMemory';
import { useWorkspaceStore } from '@/store/workspaceStore';

interface PaletteCommand {
  id: string;
  title: string;
  subtitle: string;
  keywords: string;
  category: 'Agent' | 'Room' | 'Project' | 'Decision' | 'Action' | 'Create' | 'Navigation';
  run: () => void;
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function matches(command: PaletteCommand, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  const haystack = normalize(`${command.title} ${command.subtitle} ${command.keywords} ${command.category}`);
  const tokens = q.split(' ').filter(Boolean);
  return tokens.every(token => haystack.includes(token));
}

function overdue(deadline: string | undefined): boolean {
  if (!deadline) return false;
  const value = Date.parse(`${deadline}T23:59:59`);
  return Number.isFinite(value) && value < Date.now();
}

export function AdvancedCommandPalette() {
  const rooms = useWorkspaceStore(state => state.rooms);
  const projects = useWorkspaceStore(state => state.projects);
  const decisions = useWorkspaceStore(state => state.decisions);
  const actionItems = useWorkspaceStore(state => state.actionItems);
  const agents = useWorkspaceStore(state => state.agents);
  const teams = useWorkspaceStore(state => state.teams);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const setActiveRoom = useWorkspaceStore(state => state.setActiveRoom);
  const createRoom = useWorkspaceStore(state => state.createRoom);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        setOpen(value => !value);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const commands = useMemo<PaletteCommand[]>(() => {
    const result: PaletteCommand[] = [];

    for (const agent of agents) {
      const chat = getExternalAgentChat(agent.id);
      result.push({
        id: `agent:${agent.id}`,
        title: `Open ${agent.name}`,
        subtitle: chat ? `${chat.provider} conversation linked` : 'Open persistent Agent Memory',
        keywords: `specialist employee memory ${chat?.provider ?? ''}`,
        category: 'Agent',
        run: () => {
          if (chat?.url) window.open(chat.url, '_blank', 'noopener,noreferrer');
          else openAgentMemory({ agentId: agent.id });
        },
      });
    }

    for (const room of rooms.filter(item => !item.archivedAt)) {
      result.push({ id: `room:${room.id}`, title: `Open ${room.name}`, subtitle: `${room.messages.length} messages`, keywords: `room meeting ${room.tags?.join(' ') ?? ''}`, category: 'Room', run: () => setActiveRoom(room.id) });
    }

    for (const project of projects) {
      const room = rooms.find(item => item.projectId === project.id && !item.archivedAt);
      result.push({ id: `project:${project.id}`, title: `Open Project ${project.name}`, subtitle: project.description || 'Project workspace', keywords: `project workspace ${project.tags?.join(' ') ?? ''}`, category: 'Project', run: () => { if (room) setActiveRoom(room.id); } });
    }

    for (const decision of decisions) {
      result.push({ id: `decision:${decision.id}`, title: `Decision: ${decision.title}`, subtitle: decision.status, keywords: `search decision ${decision.details}`, category: 'Decision', run: () => { if (decision.roomId) setActiveRoom(decision.roomId); } });
    }

    for (const action of actionItems) {
      const isOverdue = action.status !== 'done' && overdue(action.deadline);
      result.push({ id: `action:${action.id}`, title: `${isOverdue ? 'Overdue · ' : ''}${action.title}`, subtitle: `${action.status}${action.owner ? ` · ${action.owner}` : ''}`, keywords: `action task ${isOverdue ? 'overdue late' : ''}`, category: 'Action', run: () => { if (action.roomId) setActiveRoom(action.roomId); } });
    }

    const architectureAgent = agents.find(agent => {
      const roleId = agent.roleId.toLocaleLowerCase();
      return agent.name.toLocaleLowerCase() === 'emma' || roleId.includes('architect');
    });
    result.push({
      id: 'create:architecture',
      title: 'Create Architecture Room',
      subtitle: 'New architecture review workspace',
      keywords: 'new architecture room emma review',
      category: 'Create',
      run: () => createRoom('Architecture Review', '🏗️', architectureAgent ? [architectureAgent.id] : [], [], rooms.find(room => room.id === activeRoomId)?.projectId),
    });

    const ideaLab = teams.find(team => normalize(team.name).includes('idea lab'));
    result.push({
      id: 'create:idea-lab',
      title: 'New Idea Lab',
      subtitle: ideaLab ? `${ideaLab.agentIds.length} ideators + facilitator` : 'Create an ideation room',
      keywords: 'new idea brainstorm ideation lab',
      category: 'Create',
      run: () => createRoom('Idea Lab', '💡', [], ideaLab ? [ideaLab.id] : [], rooms.find(room => room.id === activeRoomId)?.projectId),
    });

    result.push({
      id: 'navigation:overdue',
      title: 'Open overdue actions',
      subtitle: `${actionItems.filter(item => item.status !== 'done' && overdue(item.deadline)).length} overdue`,
      keywords: 'overdue actions tasks late',
      category: 'Navigation',
      run: () => { setQuery('overdue action'); setActiveIndex(0); },
    });

    result.push({
      id: 'navigation:decisions',
      title: 'Search decisions',
      subtitle: 'Filter Command Palette to the Decision Register',
      keywords: 'search decision register',
      category: 'Navigation',
      run: () => { setQuery('decision'); setActiveIndex(0); },
    });

    return result;
  }, [actionItems, activeRoomId, agents, createRoom, decisions, projects, rooms, setActiveRoom, teams]);

  const filtered = useMemo(() => commands.filter(command => matches(command, query)).slice(0, 18), [commands, query]);

  useEffect(() => setActiveIndex(index => Math.min(index, Math.max(0, filtered.length - 1))), [filtered.length]);

  if (!open) return null;

  const execute = (command: PaletteCommand) => {
    const keepOpen = command.id === 'navigation:overdue' || command.id === 'navigation:decisions';
    command.run();
    if (!keepOpen) setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[200] flex justify-center bg-slate-950/45 px-4 pt-[10vh]" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="h-fit max-h-[72vh] w-[min(760px,94vw)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Command Palette">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3"><span className="text-slate-400">⌘</span><input ref={inputRef} value={query} onChange={event => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(index => Math.min(index + 1, filtered.length - 1)); } else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(index => Math.max(index - 1, 0)); } else if (event.key === 'Enter' && filtered[activeIndex]) { event.preventDefault(); execute(filtered[activeIndex]); } }} placeholder="Type a command or search: Open Emma, decision, overdue..." className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" /><kbd className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-400">Esc</kbd></div>
        <div className="max-h-[60vh] overflow-y-auto p-2">{filtered.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">No matching command.</div> : filtered.map((command, index) => <button key={command.id} type="button" onMouseEnter={() => setActiveIndex(index)} onClick={() => execute(command)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start ${activeIndex === index ? 'bg-blue-50' : 'hover:bg-slate-50'}`}><span className="w-20 shrink-0 rounded-md bg-slate-100 px-2 py-1 text-center text-[9px] font-bold uppercase text-slate-500">{command.category}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{command.title}</span><span className="block truncate text-[11px] text-slate-400">{command.subtitle}</span></span><span className="text-slate-300">↵</span></button>)}</div>
        <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] text-slate-400"><span>↑↓ Navigate · Enter Run · Esc Close</span><span>Ctrl/⌘ + K</span></footer>
      </section>
    </div>
  );
}
