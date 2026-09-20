import { useEffect, useMemo, useState } from 'react';
import { loadMemoryV2 } from '@/lib/memoryV2';
import { loadOperationsSuite, OPERATIONS_SUITE_EVENT } from '@/lib/operationsSuite';
import {
  actionReminderState,
  buildDecisionGraph,
  decisionIdForAction,
  loadReminderPreferences,
  ROADMAP_COMPLETION_EVENT,
  saveReminderPreferences,
} from '@/lib/roadmapCompletion';
import { downloadTextFile, loadWorkspaceSuite } from '@/lib/workspaceSuite';
import { useWorkspaceStore } from '@/store/workspaceStore';

function safeName(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'project';
}

export function TraceabilityCenterLauncher() {
  const projects = useWorkspaceStore(state => state.projects);
  const rooms = useWorkspaceStore(state => state.rooms);
  const decisions = useWorkspaceStore(state => state.decisions);
  const actionItems = useWorkspaceStore(state => state.actionItems);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const [open, setOpen] = useState(false);
  const [ops, setOps] = useState(loadOperationsSuite);
  const [preferences, setPreferences] = useState(loadReminderPreferences);
  const [projectId, setProjectId] = useState('');
  const [permissionStatus, setPermissionStatus] = useState(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

  const activeRoom = rooms.find(room => room.id === activeRoomId);
  const resolvedProjectId = projects.some(project => project.id === projectId)
    ? projectId
    : activeRoom?.projectId && projects.some(project => project.id === activeRoom.projectId)
      ? activeRoom.projectId
      : projects[0]?.id ?? '';
  const project = projects.find(item => item.id === resolvedProjectId);
  const projectRooms = rooms.filter(room => room.projectId === resolvedProjectId);
  const roomIds = useMemo(() => new Set(projectRooms.map(room => room.id)), [projectRooms]);
  const projectDecisions = decisions.filter(item => item.projectId === resolvedProjectId);
  const projectActions = actionItems.filter(item => item.projectId === resolvedProjectId);
  const dependencies = ops.decisionDependencies.filter(dep => projectDecisions.some(item => item.id === dep.decisionId));
  const graph = useMemo(() => buildDecisionGraph(projectDecisions, dependencies), [dependencies, projectDecisions]);
  const maxDepth = Math.max(0, ...graph.map(node => node.depth));

  useEffect(() => {
    const refreshOps = () => setOps(loadOperationsSuite());
    const refreshPrefs = () => setPreferences(loadReminderPreferences());
    window.addEventListener(OPERATIONS_SUITE_EVENT, refreshOps);
    window.addEventListener(ROADMAP_COMPLETION_EVENT, refreshPrefs);
    return () => {
      window.removeEventListener(OPERATIONS_SUITE_EVENT, refreshOps);
      window.removeEventListener(ROADMAP_COMPLETION_EVENT, refreshPrefs);
    };
  }, []);

  const dueItems = projectActions
    .map(action => ({ action, state: actionReminderState(action, Date.now(), preferences.dueSoonHours) }))
    .filter((item): item is { action: typeof projectActions[number]; state: 'overdue' | 'due-soon' } => Boolean(item.state));

  const reviewRequests = ops.reviewRequests.filter(request => roomIds.has(request.roomId));

  const requestDesktopPermission = async () => {
    if (typeof Notification === 'undefined') {
      setPermissionStatus('unsupported');
      return;
    }
    const permission = await Notification.requestPermission();
    setPermissionStatus(permission);
    if (permission === 'granted') {
      saveReminderPreferences({ ...preferences, desktopEnabled: true });
    }
  };

  const toggleDesktop = (enabled: boolean) => {
    if (enabled && permissionStatus !== 'granted') {
      void requestDesktopPermission();
      return;
    }
    saveReminderPreferences({ ...preferences, desktopEnabled: enabled });
  };

  const exportCompleteProject = () => {
    if (!project) return;
    const suite = loadWorkspaceSuite();
    const memory = loadMemoryV2();
    const projectDecisionIds = new Set(projectDecisions.map(item => item.id));
    const projectActionIds = new Set(projectActions.map(item => item.id));
    const payload = {
      format: 'virtual-company-project-package',
      version: 2,
      exportedAt: Date.now(),
      project,
      rooms: projectRooms,
      decisions: projectDecisions,
      actions: projectActions,
      memories: {
        agent: suite.agentMemories.filter(item => item.projectId === project.id),
        shared: memory.sharedMemories.filter(item => item.scope === 'project' && item.projectId === project.id),
        relations: memory.relations,
        conflicts: memory.conflicts,
      },
      operations: {
        assumptions: ops.assumptions.filter(item => item.projectId === project.id),
        risks: ops.risks.filter(item => item.projectId === project.id),
        questions: ops.questions.filter(item => item.projectId === project.id),
        ideas: ops.ideas.filter(item => item.projectId === project.id),
        deliverables: ops.deliverables.filter(item => item.projectId === project.id),
        decisionDependencies: ops.decisionDependencies.filter(item => projectDecisionIds.has(item.decisionId)),
        actionDependencies: ops.actionDependencies.filter(item => projectActionIds.has(item.actionId)),
        actionKanban: Object.fromEntries(Object.entries(ops.actionKanban).filter(([id]) => projectActionIds.has(id))),
        reviewRequests: reviewRequests,
        roomSnapshots: ops.roomSnapshots.filter(item => roomIds.has(item.roomId)),
      },
    };
    downloadTextFile(`${safeName(project.name)}-complete.vcproject.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setProjectId(activeRoom?.projectId ?? projects[0]?.id ?? ''); setOpen(true); }}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-cyan-50 hover:text-cyan-700"
        title="Decision traceability, dependency graph and due reminders"
      >
        <span aria-hidden="true">◇</span> Traceability
      </button>

      {open ? (
        <div className="fixed inset-0 z-[150] grid place-items-center bg-slate-950/45 p-5" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="flex h-[86vh] w-[min(1280px,96vw)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Traceability Center">
            <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-slate-900">Decision Traceability & Reminders</h2>
                <p className="mt-0.5 text-xs text-slate-500">Explicit Decision → Action links, dependency impact, review lifecycle and due-date reminders.</p>
              </div>
              <select value={resolvedProjectId} onChange={event => setProjectId(event.target.value)} className="max-w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs">
                {projects.map(item => <option key={item.id} value={item.id}>{item.emoji} {item.name}</option>)}
              </select>
              <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">✕</button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-5">
              <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div><h3 className="text-sm font-bold text-slate-800">Decision Dependency Graph</h3><p className="mt-1 text-[10px] text-slate-400">Columns represent dependency depth. Red cards depend on a reversed parent.</p></div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">{dependencies.length} links</span>
                  </div>
                  {graph.length === 0 ? <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">No project decisions yet.</div> : (
                    <div className="mt-4 grid gap-3 overflow-x-auto" style={{ gridTemplateColumns: `repeat(${maxDepth + 1}, minmax(210px, 1fr))` }}>
                      {Array.from({ length: maxDepth + 1 }, (_, depth) => (
                        <div key={depth} className="min-w-0 space-y-2 rounded-lg bg-slate-50 p-2">
                          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Depth {depth}</div>
                          {graph.filter(node => node.depth === depth).map(node => {
                            const linked = projectActions.filter(action => decisionIdForAction(action) === node.decision.id);
                            return <article key={node.decision.id} className={`rounded-lg border p-3 ${node.impactedByReversal ? 'border-rose-300 bg-rose-50' : node.decision.status === 'approved' ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'}`}>
                              <div className="text-[11px] font-bold text-slate-800">{node.decision.title}</div>
                              <div className="mt-1 text-[9px] uppercase text-slate-400">{node.decision.status}</div>
                              {node.parentIds.length > 0 ? <div className="mt-2 text-[9px] text-slate-500">← {node.parentIds.map(id => projectDecisions.find(item => item.id === id)?.title ?? id).join(' · ')}</div> : <div className="mt-2 text-[9px] text-slate-400">Root decision</div>}
                              <div className="mt-2 flex justify-between text-[9px]"><span className="text-blue-600">{linked.length} linked actions</span><span className="text-slate-400">{node.childIds.length} dependents</span></div>
                              {node.impactedByReversal ? <div className="mt-2 rounded bg-rose-100 px-2 py-1 text-[9px] font-bold text-rose-700">⚠ Parent decision reversed</div> : null}
                            </article>;
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-bold text-slate-800">Due-Date Reminders</h3>
                  <p className="mt-1 text-[10px] leading-4 text-slate-400">In-app reminders remain local. Desktop notifications are optional and require browser/WebView permission.</p>
                  <label className="mt-4 flex items-center justify-between rounded-lg border border-slate-200 p-3 text-xs"><span>Desktop notifications</span><input type="checkbox" checked={preferences.desktopEnabled} onChange={event => toggleDesktop(event.target.checked)} /></label>
                  <label className="mt-2 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Due-soon window
                    <select value={preferences.dueSoonHours} onChange={event => saveReminderPreferences({ ...preferences, dueSoonHours: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-normal normal-case text-slate-700">
                      {[1, 4, 12, 24, 48, 72, 168].map(hours => <option key={hours} value={hours}>{hours < 24 ? `${hours} hours` : `${hours / 24} days`}</option>)}
                    </select>
                  </label>
                  <label className="mt-2 flex items-center justify-between rounded-lg border border-slate-200 p-3 text-xs"><span>Notify when meeting timer ends</span><input type="checkbox" checked={preferences.timerNotifications} onChange={event => saveReminderPreferences({ ...preferences, timerNotifications: event.target.checked })} /></label>
                  <div className="mt-2 text-[10px] text-slate-400">Permission: <strong>{permissionStatus}</strong></div>
                  {permissionStatus !== 'granted' && permissionStatus !== 'unsupported' ? <button type="button" onClick={() => void requestDesktopPermission()} className="mt-2 w-full rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-700">Enable Desktop Reminders</button> : null}

                  <div className="mt-4 space-y-2">
                    {dueItems.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-[10px] text-slate-400">No overdue or due-soon actions.</div> : dueItems.map(({ action, state }) => <div key={action.id} className={`rounded-lg border p-2.5 ${state === 'overdue' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}><div className="text-[10px] font-bold text-slate-700">{action.title}</div><div className="mt-1 text-[9px] text-slate-500">{state === 'overdue' ? 'OVERDUE' : 'DUE SOON'} · {action.deadline} · {action.owner || 'Unassigned'}</div></div>)}
                  </div>
                </section>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-bold text-slate-800">Decision → Action Traceability</h3>
                  <div className="mt-3 space-y-2">{projectDecisions.map(decision => { const linked = projectActions.filter(action => decisionIdForAction(action) === decision.id); return <details key={decision.id} className="rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-700">{decision.title} <span className="ms-2 text-[9px] font-normal text-slate-400">{linked.length} actions</span></summary><div className="mt-2 space-y-1">{linked.length ? linked.map(action => <div key={action.id} className="rounded bg-slate-50 px-2 py-1.5 text-[10px] text-slate-600">↳ {action.title} · {action.status}</div>) : <div className="text-[10px] text-slate-400">No linked action yet.</div>}</div></details>; })}</div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-800">Second Opinion / Handoff Queue</h3><span className="text-[10px] text-slate-400">Auto-completes when target agent replies</span></div>
                  <div className="mt-3 space-y-2">{reviewRequests.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-[10px] text-slate-400">No review requests for this project.</div> : reviewRequests.map(request => <div key={request.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5"><span className={`rounded px-2 py-1 text-[9px] font-bold ${request.status === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{request.status}</span><div className="min-w-0 flex-1"><div className="truncate text-[10px] font-semibold text-slate-700">{request.kind === 'second-opinion' ? 'Second Opinion' : 'Handoff'} → {request.targetAgentId}</div><div className="truncate text-[9px] text-slate-400">{request.note}</div></div></div>)}</div>
                </section>
              </div>

              <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-800">Complete Project Package v2</h3><p className="mt-1 text-[10px] text-slate-400">Includes rooms, messages, files, minutes, decisions, actions, deliverables, project memories, dependencies, Kanban state, reviews and room snapshots.</p></div><button type="button" onClick={exportCompleteProject} disabled={!project} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Export Complete Package</button></div>
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
