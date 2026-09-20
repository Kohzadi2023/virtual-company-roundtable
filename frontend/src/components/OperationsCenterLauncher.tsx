import { useEffect, useMemo, useState } from 'react';
import {
  addActionDependency,
  addAssumption,
  addDecisionDependency,
  addDeliverable,
  addDeliverableVersion,
  addIdea,
  addQuestion,
  addRisk,
  clearMeetingTimer,
  createRoomSnapshot,
  deleteRoomSnapshot,
  dismissNotification,
  loadOperationsSuite,
  OPERATIONS_SUITE_EVENT,
  scoreIdea,
  setKanbanStatus,
  setMeetingTimer,
  updateAssumption,
  updateIdea,
  updateQuestion,
  updateRisk,
  type DeliverableType,
  type IdeaScore,
  type IdeaStatus,
  type KanbanStatus,
  type OperationsSuiteState,
  type RiskLevel,
} from '@/lib/operationsSuite';
import { loadMeetingOrchestration, setActiveSpeaker, setMeetingPhase } from '@/lib/meetingOrchestration';
import { unseenMessagesForAgent } from '@/lib/contextDelta';
import { agentContextKey } from '@/lib/id';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { DecisionRecord, Room } from '@/types/domain';

type Tab = 'registers' | 'ideas' | 'deliverables' | 'execution' | 'dashboards' | 'room' | 'export';
const DELIVERABLE_TYPES: DeliverableType[] = ['PRD', 'ADR', 'Technical Spec', 'Test Plan', 'GTM Plan', 'Risk Assessment', 'Meeting Minutes', 'Implementation Plan'];
const IDEA_COLUMNS: IdeaStatus[] = ['raw', 'exploring', 'promising', 'rejected', 'selected'];
const KANBAN_COLUMNS: KanbanStatus[] = ['todo', 'in-progress', 'blocked', 'review', 'done'];
const RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high', 'critical'];

function downloadText(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'virtual-company';
}

function scoreAverage(score: IdeaScore): number {
  const positive = score.customerValue + score.feasibility + score.differentiation;
  const inverseCost = 6 - score.cost;
  const inverseRisk = 6 - score.risk;
  return (positive + inverseCost + inverseRisk) / 5;
}

function generateDeliverableDraft(type: DeliverableType, room: Room | undefined, projectName: string, decisions: DecisionRecord[], risks: OperationsSuiteState['risks'], questions: OperationsSuiteState['questions']): string {
  const heading = `# ${type}: ${projectName}`;
  const roomLine = room ? `\nRoom: ${room.name}\n` : '\n';
  const decisionsBlock = decisions.length ? decisions.map(item => `- [${item.status}] ${item.title}: ${item.details}`).join('\n') : '- None recorded';
  const risksBlock = risks.length ? risks.map(item => `- [${item.impact}/${item.probability}] ${item.description} — Mitigation: ${item.mitigation || 'TBD'}`).join('\n') : '- None recorded';
  const questionsBlock = questions.filter(item => item.status === 'open').length ? questions.filter(item => item.status === 'open').map(item => `- ${item.question}`).join('\n') : '- None open';
  const transcript = room?.messages.slice(-12).map(message => `- ${message.authorNameSnapshot ?? (message.authorType === 'user' ? 'User' : 'Agent')}: ${message.content}`).join('\n') ?? '- No room transcript selected';
  return `${heading}${roomLine}\n## Purpose\nDraft generated from structured Virtual Company workspace data. Review before publishing.\n\n## Decisions\n${decisionsBlock}\n\n## Risks\n${risksBlock}\n\n## Open Questions\n${questionsBlock}\n\n## Recent Discussion\n${transcript}\n`;
}

function diffLines(before: string, after: string): string {
  const left = before.split('\n');
  const right = after.split('\n');
  const size = Math.max(left.length, right.length);
  const lines: string[] = [];
  for (let i = 0; i < size; i += 1) {
    const a = left[i];
    const b = right[i];
    if (a === b) continue;
    if (a !== undefined) lines.push(`- ${a}`);
    if (b !== undefined) lines.push(`+ ${b}`);
  }
  return lines.length ? lines.join('\n') : 'No line-level changes.';
}

function dueTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(`${value}T23:59:59`);
  return Number.isFinite(time) ? time : null;
}

export function OperationsCenterLauncher() {
  const rooms = useWorkspaceStore(state => state.rooms);
  const projects = useWorkspaceStore(state => state.projects);
  const decisions = useWorkspaceStore(state => state.decisions);
  const actionItems = useWorkspaceStore(state => state.actionItems);
  const agents = useWorkspaceStore(state => state.agents);
  const roles = useWorkspaceStore(state => state.roles);
  const teams = useWorkspaceStore(state => state.teams);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const agentContext = useWorkspaceStore(state => state.agentContext);
  const createRoom = useWorkspaceStore(state => state.createRoom);
  const setActiveRoom = useWorkspaceStore(state => state.setActiveRoom);
  const addActionItem = useWorkspaceStore(state => state.addActionItem);
  const updateActionItem = useWorkspaceStore(state => state.updateActionItem);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('registers');
  const [ops, setOps] = useState(loadOperationsSuite);
  const activeRoom = rooms.find(room => room.id === activeRoomId);
  const [projectId, setProjectId] = useState(activeRoom?.projectId ?? projects[0]?.id ?? '');

  useEffect(() => {
    const refresh = () => setOps(loadOperationsSuite());
    window.addEventListener(OPERATIONS_SUITE_EVENT, refresh);
    return () => window.removeEventListener(OPERATIONS_SUITE_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (projectId && projects.some(project => project.id === projectId)) return;
    setProjectId(activeRoom?.projectId ?? projects[0]?.id ?? '');
  }, [activeRoom?.projectId, projectId, projects]);

  const project = projects.find(item => item.id === projectId);
  const projectRooms = rooms.filter(room => room.projectId === projectId);
  const projectDecisions = decisions.filter(item => item.projectId === projectId);
  const projectActions = actionItems.filter(item => item.projectId === projectId);
  const projectRisks = ops.risks.filter(item => item.projectId === projectId);
  const projectQuestions = ops.questions.filter(item => item.projectId === projectId);
  const projectAssumptions = ops.assumptions.filter(item => item.projectId === projectId);
  const projectIdeas = ops.ideas.filter(item => item.projectId === projectId);
  const projectDeliverables = ops.deliverables.filter(item => item.projectId === projectId);

  const [assumption, setAssumption] = useState('');
  const [risk, setRisk] = useState('');
  const [question, setQuestion] = useState('');
  const [ideaTitle, setIdeaTitle] = useState('');
  const [ideaDescription, setIdeaDescription] = useState('');
  const [deliverableType, setDeliverableType] = useState<DeliverableType>('PRD');
  const [deliverableTitle, setDeliverableTitle] = useState('');
  const [deliverableRoomId, setDeliverableRoomId] = useState(activeRoomId ?? '');
  const [deliverableDraft, setDeliverableDraft] = useState('');
  const [selectedDeliverableId, setSelectedDeliverableId] = useState('');
  const [decisionDependencyA, setDecisionDependencyA] = useState('');
  const [decisionDependencyB, setDecisionDependencyB] = useState('');
  const [actionDependencyA, setActionDependencyA] = useState('');
  const [actionDependencyB, setActionDependencyB] = useState('');
  const [scoreIdeaId, setScoreIdeaId] = useState('');
  const [scoreAgentId, setScoreAgentId] = useState(agents[0]?.id ?? '');
  const [score, setScore] = useState<IdeaScore>({ customerValue: 3, feasibility: 3, differentiation: 3, cost: 3, risk: 3 });
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const selectedDeliverable = projectDeliverables.find(item => item.id === selectedDeliverableId) ?? projectDeliverables[0];
  const timer = activeRoomId ? ops.timers[activeRoomId] : undefined;
  const timerRemaining = useMemo(() => {
    if (!timer) return 0;
    if (!timer.startedAt) return timer.pausedRemainingSeconds ?? timer.durationSeconds;
    return Math.max(0, timer.durationSeconds - Math.floor((tick - timer.startedAt) / 1000));
  }, [tick, timer]);

  const notifications = useMemo(() => {
    const now = Date.now();
    const items: Array<{ key: string; text: string }> = [];
    for (const action of actionItems) {
      const due = dueTimestamp(action.deadline);
      if (action.status !== 'done' && due !== null && due < now) items.push({ key: `overdue:${action.id}`, text: `Overdue action: ${action.title}` });
    }
    for (const decision of decisions.filter(item => item.status === 'proposed')) items.push({ key: `decision:${decision.id}`, text: `Pending decision: ${decision.title}` });
    for (const item of ops.risks.filter(item => item.status === 'open' && item.impact === 'critical')) items.push({ key: `risk:${item.id}`, text: `Critical risk: ${item.description}` });
    if (activeRoom) {
      for (const agentId of activeRoom.agentIds) {
        const agent = agents.find(item => item.id === agentId);
        const cursor = agentContext[agentContextKey(activeRoom.id, agentId)];
        if (unseenMessagesForAgent(activeRoom, agentId, cursor).length > 0 && agent) items.push({ key: `unseen:${activeRoom.id}:${agentId}`, text: `${agent.name} has unseen context in ${activeRoom.name}` });
      }
    }
    return items.filter(item => !ops.dismissedNotifications.includes(item.key));
  }, [actionItems, activeRoom, agentContext, agents, decisions, ops.dismissedNotifications, ops.risks]);

  const completion = useMemo(() => {
    if (!activeRoom) return 0;
    let points = 0;
    if ((activeRoom.agenda?.length ?? 0) > 0) points += 20;
    if (projectDecisions.some(item => item.roomId === activeRoom.id && item.status === 'approved')) points += 20;
    if (projectActions.some(item => item.roomId === activeRoom.id)) points += 20;
    if (projectQuestions.filter(item => item.roomId === activeRoom.id && item.status === 'open').length === 0) points += 20;
    if (activeRoom.meetingMinutes?.content.trim()) points += 20;
    return points;
  }, [activeRoom, projectActions, projectDecisions, projectQuestions]);

  const createDecisionAction = (decision: DecisionRecord) => {
    addActionItem({
      projectId: decision.projectId,
      ...(decision.roomId ? { roomId: decision.roomId } : {}),
      title: `Implement: ${decision.title}`,
      evidence: `Decision ${decision.id}`,
      status: 'todo',
      priority: 'medium',
    });
  };

  const startChallenge = () => {
    if (!activeRoom) return;
    const mike = agents.find(agent => agent.name.toLocaleLowerCase() === 'mike');
    setMeetingPhase(activeRoom.id, 'challenge');
    if (mike && activeRoom.agentIds.includes(mike.id)) setActiveSpeaker(activeRoom.id, mike.id);
  };

  const cloneRoom = () => {
    if (!activeRoom) return;
    const id = createRoom(`${activeRoom.name} Copy`, activeRoom.emoji, activeRoom.individualAgentIds ?? [], activeRoom.teamIds ?? [], activeRoom.projectId);
    useWorkspaceStore.setState(state => ({
      rooms: state.rooms.map(room => room.id === id ? {
        ...room,
        tags: [...(activeRoom.tags ?? [])],
        agenda: [...(activeRoom.agenda ?? [])],
        knowledge: activeRoom.knowledge ? { ...activeRoom.knowledge } : undefined,
        templateId: activeRoom.templateId,
        messages: [],
      } : room),
    }));
    setActiveRoom(id);
  };

  const restoreSnapshot = (snapshotId: string) => {
    const snapshot = ops.roomSnapshots.find(item => item.id === snapshotId);
    if (!snapshot) return;
    useWorkspaceStore.setState(state => ({ rooms: state.rooms.map(room => room.id === snapshot.roomId ? JSON.parse(JSON.stringify(snapshot.room)) as Room : room) }));
  };

  const exportProjectJson = () => {
    if (!project) return;
    const payload = {
      version: 1,
      exportedAt: Date.now(),
      project,
      rooms: projectRooms,
      decisions: projectDecisions,
      actions: projectActions,
      operations: {
        assumptions: projectAssumptions,
        risks: projectRisks,
        questions: projectQuestions,
        ideas: projectIdeas,
        deliverables: projectDeliverables,
        decisionDependencies: ops.decisionDependencies.filter(dep => projectDecisions.some(item => item.id === dep.decisionId)),
        actionDependencies: ops.actionDependencies.filter(dep => projectActions.some(item => item.id === dep.actionId)),
      },
    };
    downloadText(`${safeFileName(project.name)}.vcproject.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  };

  const projectMarkdown = () => {
    const title = project?.name ?? 'Project';
    return `# ${title}\n\n## Decisions\n${projectDecisions.map(item => `- **${item.title}** — ${item.status}\n  ${item.details}`).join('\n') || '- None'}\n\n## Actions\n${projectActions.map(item => `- [${item.status === 'done' ? 'x' : ' '}] ${item.title}${item.owner ? ` — ${item.owner}` : ''}`).join('\n') || '- None'}\n\n## Risks\n${projectRisks.map(item => `- **${item.impact}** ${item.description}`).join('\n') || '- None'}\n\n## Open Questions\n${projectQuestions.filter(item => item.status === 'open').map(item => `- ${item.question}`).join('\n') || '- None'}\n`;
  };

  const printReport = () => {
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) return;
    const escaped = projectMarkdown().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    popup.document.write(`<html><head><title>${project?.name ?? 'Project'} Report</title><style>body{font:14px system-ui;max-width:900px;margin:40px auto;white-space:pre-wrap;line-height:1.6}</style></head><body>${escaped}</body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const tabs: Array<[Tab, string]> = [['registers', 'Registers'], ['ideas', 'Idea Board'], ['deliverables', 'Deliverables'], ['execution', 'Execution'], ['dashboards', 'Dashboards'], ['room', 'Room Tools'], ['export', 'Export & Alerts']];

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100" title="Registers, ideas, deliverables, execution and dashboards">◎ Operations</button>
      {open ? (
        <div className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/40 p-5" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="flex h-[88vh] w-[min(1380px,96vw)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Operations Center">
            <header className="flex items-center gap-4 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0 flex-1"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-600">Virtual Company</div><h2 className="text-lg font-bold text-slate-900">Operations Center</h2></div>
              <select value={projectId} onChange={event => setProjectId(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs">{projects.map(item => <option key={item.id} value={item.id}>{item.emoji} {item.name}</option>)}</select>
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-lg text-slate-400 hover:bg-slate-100">×</button>
            </header>
            <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 px-5 pt-2">{tabs.map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold ${tab === value ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>)}</nav>
            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50 p-5">
              {tab === 'registers' ? <div className="grid gap-4 xl:grid-cols-3">
                <section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold text-slate-800">Assumption Register</h3><textarea value={assumption} onChange={event => setAssumption(event.target.value)} placeholder="Assumption" className="mt-3 w-full rounded-lg border border-slate-300 p-2 text-xs" /><button type="button" onClick={() => { if (addAssumption({ projectId, ...(activeRoomId ? { roomId: activeRoomId } : {}), statement: assumption, evidence: '', confidence: 'medium', status: 'open' })) setAssumption(''); }} className="mt-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">+ Assumption</button><div className="mt-4 space-y-2">{projectAssumptions.map(item => <article key={item.id} className="rounded-lg border border-slate-200 p-3"><div className="text-xs font-semibold text-slate-800">{item.statement}</div><div className="mt-2 flex gap-2"><select value={item.confidence} onChange={event => updateAssumption(item.id, { confidence: event.target.value as 'low' | 'medium' | 'high' })} className="rounded border border-slate-200 px-2 py-1 text-[10px]"><option>low</option><option>medium</option><option>high</option></select><select value={item.status} onChange={event => updateAssumption(item.id, { status: event.target.value as typeof item.status })} className="rounded border border-slate-200 px-2 py-1 text-[10px]"><option>open</option><option>validated</option><option>rejected</option><option>archived</option></select></div></article>)}</div></section>
                <section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold text-slate-800">Risk Register</h3><textarea value={risk} onChange={event => setRisk(event.target.value)} placeholder="Risk description" className="mt-3 w-full rounded-lg border border-slate-300 p-2 text-xs" /><button type="button" onClick={() => { if (addRisk({ projectId, ...(activeRoomId ? { roomId: activeRoomId } : {}), description: risk, probability: 'medium', impact: 'medium', mitigation: '', status: 'open' })) setRisk(''); }} className="mt-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white">+ Risk</button><div className="mt-4 space-y-2">{projectRisks.map(item => <article key={item.id} className="rounded-lg border border-slate-200 p-3"><div className="text-xs font-semibold text-slate-800">{item.description}</div><div className="mt-2 grid grid-cols-3 gap-1"><select value={item.probability} onChange={event => updateRisk(item.id, { probability: event.target.value as RiskLevel })} className="rounded border border-slate-200 px-1 py-1 text-[9px]">{RISK_LEVELS.map(level => <option key={level}>{level}</option>)}</select><select value={item.impact} onChange={event => updateRisk(item.id, { impact: event.target.value as RiskLevel })} className="rounded border border-slate-200 px-1 py-1 text-[9px]">{RISK_LEVELS.map(level => <option key={level}>{level}</option>)}</select><select value={item.status} onChange={event => updateRisk(item.id, { status: event.target.value as typeof item.status })} className="rounded border border-slate-200 px-1 py-1 text-[9px]"><option>open</option><option>mitigated</option><option>accepted</option><option>archived</option></select></div></article>)}</div></section>
                <section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold text-slate-800">Open Questions</h3><textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder="Unresolved question" className="mt-3 w-full rounded-lg border border-slate-300 p-2 text-xs" /><button type="button" onClick={() => { if (addQuestion({ projectId, ...(activeRoomId ? { roomId: activeRoomId } : {}), question, status: 'open' })) setQuestion(''); }} className="mt-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white">+ Question</button><div className="mt-4 space-y-2">{projectQuestions.map(item => <article key={item.id} className="rounded-lg border border-slate-200 p-3"><div className="text-xs font-semibold text-slate-800">{item.question}</div><select value={item.status} onChange={event => updateQuestion(item.id, { status: event.target.value as typeof item.status })} className="mt-2 rounded border border-slate-200 px-2 py-1 text-[10px]"><option>open</option><option>resolved</option><option>archived</option></select></article>)}</div></section>
              </div> : null}

              {tab === 'ideas' ? <div className="space-y-4"><div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3"><input value={ideaTitle} onChange={event => setIdeaTitle(event.target.value)} placeholder="Idea title" className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs" /><input value={ideaDescription} onChange={event => setIdeaDescription(event.target.value)} placeholder="Description" className="min-w-64 flex-[2] rounded-lg border border-slate-300 px-3 py-2 text-xs" /><button type="button" onClick={() => { if (addIdea({ projectId, ...(activeRoomId ? { roomId: activeRoomId } : {}), title: ideaTitle, description: ideaDescription, status: 'raw' })) { setIdeaTitle(''); setIdeaDescription(''); } }} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white">+ Idea</button><button type="button" onClick={startChallenge} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">Challenge Current Consensus</button></div><div className="grid gap-3 xl:grid-cols-5">{IDEA_COLUMNS.map(status => <section key={status} className="rounded-xl border border-slate-200 bg-slate-100/60 p-2"><h3 className="px-1 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">{status}</h3><div className="space-y-2">{projectIdeas.filter(item => item.status === status).map(item => { const scores = Object.values(item.scores); const average = scores.length ? scores.reduce((sum, value) => sum + scoreAverage(value), 0) / scores.length : null; return <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3"><div className="text-xs font-bold text-slate-800">{item.title}</div><div className="mt-1 text-[10px] text-slate-500">{item.description}</div>{average !== null ? <div className="mt-2 text-[10px] font-bold text-violet-600">Team score {average.toFixed(1)}/5</div> : null}<select value={item.status} onChange={event => updateIdea(item.id, { status: event.target.value as IdeaStatus })} className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-[10px]">{IDEA_COLUMNS.map(value => <option key={value}>{value}</option>)}</select><button type="button" onClick={() => setScoreIdeaId(item.id)} className="mt-2 w-full rounded border border-violet-200 px-2 py-1 text-[10px] font-semibold text-violet-700">Score</button></article>; })}</div></section>)}</div>{scoreIdeaId ? <div className="rounded-xl border border-violet-200 bg-violet-50 p-4"><div className="flex flex-wrap items-center gap-2"><strong className="text-xs">Score idea</strong><select value={scoreAgentId} onChange={event => setScoreAgentId(event.target.value)} className="rounded border border-violet-200 bg-white px-2 py-1 text-xs">{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>{(['customerValue','feasibility','differentiation','cost','risk'] as const).map(key => <label key={key} className="text-[10px] text-slate-600">{key}<input type="number" min={1} max={5} value={score[key]} onChange={event => setScore(value => ({ ...value, [key]: Number(event.target.value) }))} className="ms-1 w-12 rounded border border-slate-200 px-1 py-1" /></label>)}<button type="button" onClick={() => { scoreIdea(scoreIdeaId, scoreAgentId, score); setScoreIdeaId(''); }} className="rounded bg-violet-600 px-3 py-1.5 text-xs font-bold text-white">Save score</button></div></div> : null}</div> : null}

              {tab === 'deliverables' ? <div className="grid gap-4 xl:grid-cols-[360px_1fr]"><section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold text-slate-800">Deliverable Generator</h3><select value={deliverableType} onChange={event => setDeliverableType(event.target.value as DeliverableType)} className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs">{DELIVERABLE_TYPES.map(type => <option key={type}>{type}</option>)}</select><input value={deliverableTitle} onChange={event => setDeliverableTitle(event.target.value)} placeholder="Title" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs" /><select value={deliverableRoomId} onChange={event => setDeliverableRoomId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"><option value="">Project-level</option>{projectRooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select><button type="button" onClick={() => setDeliverableDraft(generateDeliverableDraft(deliverableType, rooms.find(room => room.id === deliverableRoomId), project?.name ?? 'Project', projectDecisions, projectRisks, projectQuestions))} className="mt-2 w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">Generate structured draft</button><textarea value={deliverableDraft} onChange={event => setDeliverableDraft(event.target.value)} rows={14} className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-mono text-[10px]" /><button type="button" onClick={() => { const id = addDeliverable({ projectId, ...(deliverableRoomId ? { roomId: deliverableRoomId } : {}), type: deliverableType, title: deliverableTitle || `${deliverableType} · ${project?.name ?? 'Project'}`, content: deliverableDraft }); if (id) { setSelectedDeliverableId(id); setDeliverableTitle(''); } }} className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">Save Deliverable</button></section><section className="space-y-3">{projectDeliverables.map(item => { const latest = item.versions.at(-1); const previous = item.versions.at(-2); return <article key={item.id} className={`rounded-xl border bg-white p-4 ${selectedDeliverable?.id === item.id ? 'border-blue-300' : 'border-slate-200'}`} onClick={() => setSelectedDeliverableId(item.id)}><div className="flex items-center justify-between"><div><div className="text-xs font-bold text-slate-800">{item.title}</div><div className="text-[10px] text-slate-400">{item.type} · v{latest?.version ?? 0}</div></div><button type="button" onClick={() => latest && downloadText(`${safeFileName(item.title)}-v${latest.version}.md`, latest.content, 'text/markdown;charset=utf-8')} className="rounded border border-slate-200 px-2 py-1 text-[10px]">Export .md</button></div>{latest ? <textarea defaultValue={latest.content} onBlur={event => { if (event.target.value.trim() !== latest.content.trim()) addDeliverableVersion(item.id, event.target.value); }} rows={8} className="mt-3 w-full rounded border border-slate-200 p-2 font-mono text-[10px]" /> : null}{previous && latest ? <details className="mt-2"><summary className="cursor-pointer text-[10px] font-semibold text-slate-500">Diff v{previous.version} → v{latest.version}</summary><pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-900 p-2 text-[9px] text-slate-100">{diffLines(previous.content, latest.content)}</pre></details> : null}</article>; })}</section></div> : null}

              {tab === 'execution' ? <div className="space-y-5"><section className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><h3 className="font-bold text-slate-800">Kanban Board</h3><span className="text-[10px] text-slate-400">Todo → In Progress → Blocked → Review → Done</span></div><div className="mt-3 grid gap-3 xl:grid-cols-5">{KANBAN_COLUMNS.map(status => <div key={status} className="rounded-lg bg-slate-100 p-2"><div className="mb-2 text-[10px] font-bold uppercase text-slate-500">{status}</div><div className="space-y-2">{projectActions.filter(action => (ops.actionKanban[action.id] ?? action.status) === status).map(action => <article key={action.id} className="rounded-lg border border-slate-200 bg-white p-2"><div className="text-[11px] font-semibold text-slate-700">{action.title}</div><div className="mt-1 text-[9px] text-slate-400">{action.owner || 'Unassigned'}</div><select value={ops.actionKanban[action.id] ?? action.status} onChange={event => { const next = event.target.value as KanbanStatus; setKanbanStatus(action.id, next); if (next === 'todo' || next === 'in-progress' || next === 'done') updateActionItem(action.id, { status: next }); }} className="mt-2 w-full rounded border border-slate-200 px-1 py-1 text-[9px]">{KANBAN_COLUMNS.map(value => <option key={value}>{value}</option>)}</select></article>)}</div></div>)}</div></section><div className="grid gap-4 xl:grid-cols-3"><section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-xs font-bold">Decision → Action</h3><div className="mt-2 space-y-2">{projectDecisions.map(item => <div key={item.id} className="flex items-center gap-2 rounded border border-slate-200 p-2"><span className="min-w-0 flex-1 truncate text-[10px]">{item.title}</span><button type="button" onClick={() => createDecisionAction(item)} className="rounded bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700">Create Action</button></div>)}</div></section><section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-xs font-bold">Decision Dependencies</h3><select value={decisionDependencyA} onChange={event => setDecisionDependencyA(event.target.value)} className="mt-2 w-full rounded border p-2 text-[10px]"><option value="">Decision</option>{projectDecisions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><select value={decisionDependencyB} onChange={event => setDecisionDependencyB(event.target.value)} className="mt-2 w-full rounded border p-2 text-[10px]"><option value="">Depends on</option>{projectDecisions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button type="button" onClick={() => addDecisionDependency(decisionDependencyA, decisionDependencyB)} className="mt-2 rounded bg-slate-800 px-3 py-2 text-[10px] font-bold text-white">Link</button><div className="mt-3 space-y-1">{ops.decisionDependencies.filter(dep => projectDecisions.some(item => item.id === dep.decisionId)).map(dep => { const child = projectDecisions.find(item => item.id === dep.decisionId); const parent = projectDecisions.find(item => item.id === dep.dependsOnDecisionId); return <div key={dep.id} className={`rounded p-2 text-[9px] ${parent?.status === 'reversed' ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'}`}>{child?.title} ← {parent?.title}{parent?.status === 'reversed' ? ' · PARENT REVERSED' : ''}</div>; })}</div></section><section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-xs font-bold">Task Dependencies / Blockers</h3><select value={actionDependencyA} onChange={event => setActionDependencyA(event.target.value)} className="mt-2 w-full rounded border p-2 text-[10px]"><option value="">Task</option>{projectActions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><select value={actionDependencyB} onChange={event => setActionDependencyB(event.target.value)} className="mt-2 w-full rounded border p-2 text-[10px]"><option value="">Blocked by</option>{projectActions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button type="button" onClick={() => { addActionDependency(actionDependencyA, actionDependencyB); if (actionDependencyA) setKanbanStatus(actionDependencyA, 'blocked'); }} className="mt-2 rounded bg-slate-800 px-3 py-2 text-[10px] font-bold text-white">Add Blocker</button></section></div></div> : null}

              {tab === 'dashboards' ? <div className="grid gap-4 xl:grid-cols-2"><section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold text-slate-800">Meeting Dashboard</h3><div className="mt-3 grid grid-cols-3 gap-2 text-center">{[['Participants', activeRoom?.agentIds.length ?? 0], ['Decisions', projectDecisions.filter(item => item.roomId === activeRoomId).length], ['Actions', projectActions.filter(item => item.roomId === activeRoomId).length], ['Risks', projectRisks.filter(item => item.roomId === activeRoomId && item.status === 'open').length], ['Open Questions', projectQuestions.filter(item => item.roomId === activeRoomId && item.status === 'open').length], ['Completion', `${completion}%`]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-slate-50 p-3"><div className="text-lg font-bold text-slate-800">{value}</div><div className="text-[9px] uppercase text-slate-400">{label}</div></div>)}</div>{activeRoom ? <div className="mt-4 rounded-lg border border-violet-100 bg-violet-50 p-3 text-xs text-violet-700">Phase: {loadMeetingOrchestration().rooms[activeRoom.id]?.phase ?? 'open'} · Round {(loadMeetingOrchestration().rooms[activeRoom.id]?.roundIndex ?? 0) + 1}</div> : null}</section><section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold text-slate-800">Executive Dashboard</h3><div className="mt-3 grid grid-cols-3 gap-2 text-center">{[['Active Projects', projects.length], ['Pending Decisions', decisions.filter(item => item.status === 'proposed').length], ['Critical Risks', ops.risks.filter(item => item.status === 'open' && item.impact === 'critical').length], ['Overdue Actions', actionItems.filter(item => item.status !== 'done' && dueTimestamp(item.deadline) !== null && (dueTimestamp(item.deadline) ?? Infinity) < Date.now()).length], ['Recent Rooms', rooms.filter(item => Date.now() - item.createdAt < 7 * 86400000).length], ['Open Questions', ops.questions.filter(item => item.status === 'open').length]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-slate-50 p-3"><div className="text-lg font-bold text-slate-800">{value}</div><div className="text-[9px] uppercase text-slate-400">{label}</div></div>)}</div><h4 className="mt-5 text-xs font-bold text-slate-700">Agent Workload</h4><div className="mt-2 space-y-1">{agents.map(agent => { const openCount = actionItems.filter(item => item.status !== 'done' && item.owner?.toLocaleLowerCase() === agent.name.toLocaleLowerCase()).length; return <div key={agent.id} className="flex items-center justify-between rounded bg-slate-50 px-3 py-2 text-[10px]"><span>{agent.name}</span><strong>{openCount} open</strong></div>; })}</div></section><section className="xl:col-span-2 rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold text-slate-800">Project Timeline</h3><div className="mt-3 space-y-2">{[...projectRooms.map(item => ({ at: item.createdAt, text: `Room created · ${item.name}` })), ...projectDecisions.map(item => ({ at: item.createdAt, text: `Decision · ${item.title}` })), ...projectActions.map(item => ({ at: item.createdAt, text: `Action · ${item.title}` })), ...projectDeliverables.map(item => ({ at: item.createdAt, text: `Deliverable · ${item.title}` }))].sort((a,b) => b.at-a.at).map((event, index) => <div key={`${event.at}-${index}`} className="flex gap-3 border-s border-slate-200 ps-4 text-xs"><span className="w-36 shrink-0 text-slate-400">{new Date(event.at).toLocaleString()}</span><span className="text-slate-700">{event.text}</span></div>)}</div></section></div> : null}

              {tab === 'room' ? <div className="grid gap-4 xl:grid-cols-2"><section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold text-slate-800">Room Clone & Snapshots</h3><p className="mt-1 text-xs text-slate-500">Clone keeps membership, Knowledge Pack, tags and agenda but starts with no history.</p><div className="mt-3 flex gap-2"><button type="button" onClick={cloneRoom} disabled={!activeRoom} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Clone Current Room</button><button type="button" onClick={() => activeRoom && createRoomSnapshot(activeRoom)} disabled={!activeRoom} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-40">Create Snapshot</button></div><div className="mt-4 space-y-2">{ops.roomSnapshots.filter(item => item.roomId === activeRoomId).map(snapshot => <div key={snapshot.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-[10px]"><span className="min-w-0 flex-1 truncate">{snapshot.name} · {new Date(snapshot.createdAt).toLocaleString()}</span><button type="button" onClick={() => restoreSnapshot(snapshot.id)} className="rounded bg-amber-50 px-2 py-1 font-bold text-amber-700">Restore</button><button type="button" onClick={() => deleteRoomSnapshot(snapshot.id)} className="rounded bg-rose-50 px-2 py-1 font-bold text-rose-700">Delete</button></div>)}</div></section><section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold text-slate-800">Meeting Timer</h3><div className="mt-3 flex items-end gap-2"><label className="text-[10px] text-slate-500">Minutes<input type="number" min={1} max={180} value={timerMinutes} onChange={event => setTimerMinutes(Number(event.target.value))} className="mt-1 block w-24 rounded border border-slate-300 px-2 py-2 text-xs" /></label><button type="button" disabled={!activeRoomId} onClick={() => activeRoomId && setMeetingTimer({ roomId: activeRoomId, label: 'Meeting segment', durationSeconds: Math.max(60, timerMinutes * 60), startedAt: Date.now() })} className="rounded bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Start</button><button type="button" disabled={!activeRoomId} onClick={() => activeRoomId && clearMeetingTimer(activeRoomId)} className="rounded border border-slate-300 px-3 py-2 text-xs">Reset</button></div><div className={`mt-5 text-center text-5xl font-black ${timerRemaining === 0 && timer ? 'text-rose-600' : 'text-slate-800'}`}>{String(Math.floor(timerRemaining / 60)).padStart(2,'0')}:{String(timerRemaining % 60).padStart(2,'0')}</div><div className="mt-5"><div className="flex justify-between text-xs"><span>Meeting Completion</span><strong>{completion}%</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${completion}%` }} /></div><div className="mt-2 text-[10px] text-slate-400">Agenda · approved decision · actions · resolved questions · minutes</div></div></section></div> : null}

              {tab === 'export' ? <div className="grid gap-4 xl:grid-cols-2"><section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold text-slate-800">Project Export & Reports</h3><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={exportProjectJson} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">Export Project Package</button><button type="button" onClick={() => downloadText(`${safeFileName(project?.name ?? 'project')}-report.md`, projectMarkdown(), 'text/markdown;charset=utf-8')} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold">Markdown Report</button><button type="button" onClick={printReport} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold">Print / Save PDF</button></div><p className="mt-3 text-[10px] leading-4 text-slate-400">PDF uses the operating system/browser print dialog so no automatic cloud service is required.</p></section><section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold text-slate-800">Notifications Center</h3><div className="mt-3 space-y-2">{notifications.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-xs text-slate-400">No active notifications.</div> : notifications.map(item => <div key={item.key} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3"><span className="min-w-0 flex-1 text-xs text-slate-700">{item.text}</span><button type="button" onClick={() => dismissNotification(item.key)} className="rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-500">Dismiss</button></div>)}</div></section></div> : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
