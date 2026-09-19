import { useMemo, useState } from 'react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { ActionItemPriority, ActionItemStatus, DecisionStatus } from '@/types/domain';

type ProjectTab = 'overview' | 'decisions' | 'actions';

const decisionStatusLabel: Record<DecisionStatus, string> = {
  proposed: 'Proposed',
  approved: 'Approved',
  reversed: 'Reversed',
};

const actionStatusLabel: Record<ActionItemStatus, string> = {
  todo: 'Todo',
  'in-progress': 'In Progress',
  done: 'Done',
};

export function ProjectCenterLauncher() {
  const projects = useWorkspaceStore(state => state.projects);
  const rooms = useWorkspaceStore(state => state.rooms);
  const decisions = useWorkspaceStore(state => state.decisions);
  const actionItems = useWorkspaceStore(state => state.actionItems);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const setActiveRoom = useWorkspaceStore(state => state.setActiveRoom);
  const createProject = useWorkspaceStore(state => state.createProject);
  const setRoomProject = useWorkspaceStore(state => state.setRoomProject);
  const addDecision = useWorkspaceStore(state => state.addDecision);
  const updateDecision = useWorkspaceStore(state => state.updateDecision);
  const deleteDecision = useWorkspaceStore(state => state.deleteDecision);
  const addActionItem = useWorkspaceStore(state => state.addActionItem);
  const updateActionItem = useWorkspaceStore(state => state.updateActionItem);
  const deleteActionItem = useWorkspaceStore(state => state.deleteActionItem);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ProjectTab>('overview');
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [decisionTitle, setDecisionTitle] = useState('');
  const [decisionDetails, setDecisionDetails] = useState('');
  const [decisionEvidence, setDecisionEvidence] = useState('');
  const [decisionRoomId, setDecisionRoomId] = useState('');
  const [actionTitle, setActionTitle] = useState('');
  const [actionOwner, setActionOwner] = useState('');
  const [actionDeadline, setActionDeadline] = useState('');
  const [actionPriority, setActionPriority] = useState<ActionItemPriority>('medium');
  const [actionEvidence, setActionEvidence] = useState('');
  const [actionRoomId, setActionRoomId] = useState('');

  const activeRoom = rooms.find(room => room.id === activeRoomId);
  const resolvedProjectId = projects.some(project => project.id === projectId)
    ? projectId
    : activeRoom?.projectId && projects.some(project => project.id === activeRoom.projectId)
      ? activeRoom.projectId
      : projects[0]?.id ?? '';
  const selectedProject = projects.find(project => project.id === resolvedProjectId);

  const projectRooms = useMemo(
    () => rooms.filter(room => room.projectId === resolvedProjectId),
    [rooms, resolvedProjectId],
  );
  const projectDecisions = useMemo(
    () => decisions.filter(decision => decision.projectId === resolvedProjectId),
    [decisions, resolvedProjectId],
  );
  const projectActions = useMemo(
    () => actionItems.filter(actionItem => actionItem.projectId === resolvedProjectId),
    [actionItems, resolvedProjectId],
  );

  const openCenter = () => {
    setProjectId(activeRoom?.projectId ?? projects[0]?.id ?? '');
    setOpen(true);
  };

  const submitProject = () => {
    const id = createProject(projectName, '📁', projectDescription);
    if (!id) return;
    setProjectId(id);
    setProjectName('');
    setProjectDescription('');
  };

  const submitDecision = () => {
    if (!resolvedProjectId) return;
    const id = addDecision({
      projectId: resolvedProjectId,
      roomId: decisionRoomId || undefined,
      title: decisionTitle,
      details: decisionDetails,
      evidence: decisionEvidence || undefined,
      status: 'proposed',
    });
    if (!id) return;
    setDecisionTitle('');
    setDecisionDetails('');
    setDecisionEvidence('');
    setDecisionRoomId('');
  };

  const submitAction = () => {
    if (!resolvedProjectId) return;
    const id = addActionItem({
      projectId: resolvedProjectId,
      roomId: actionRoomId || undefined,
      title: actionTitle,
      owner: actionOwner || undefined,
      deadline: actionDeadline || undefined,
      evidence: actionEvidence || undefined,
      status: 'todo',
      priority: actionPriority,
    });
    if (!id) return;
    setActionTitle('');
    setActionOwner('');
    setActionDeadline('');
    setActionEvidence('');
    setActionRoomId('');
    setActionPriority('medium');
  };

  return (
    <>
      <button
        type="button"
        onClick={openCenter}
        className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[13px] font-semibold text-violet-700 shadow-sm transition hover:bg-violet-100"
        title="Projects, decisions and action items"
      >
        <span aria-hidden="true">▦</span> Projects
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/35 p-6" role="dialog" aria-modal="true" aria-label="Project Center">
          <div className="flex h-[82vh] w-[min(1180px,94vw)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <aside className="flex w-72 shrink-0 flex-col border-e border-slate-200 bg-slate-50">
              <div className="border-b border-slate-200 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-500">Workspace</div>
                <h2 className="mt-1 text-lg font-bold text-slate-900">Project Center</h2>
                <p className="mt-1 text-xs text-slate-500">Rooms, decisions and execution in one place.</p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className="space-y-1.5">
                  {projects.map(project => {
                    const selected = project.id === resolvedProjectId;
                    const roomCount = rooms.filter(room => room.projectId === project.id).length;
                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => setProjectId(project.id)}
                        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-start transition ${selected ? 'border-violet-300 bg-white shadow-sm' : 'border-transparent hover:border-slate-200 hover:bg-white'}`}
                      >
                        <span className="text-lg" aria-hidden="true">{project.emoji}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-slate-800">{project.name}</span>
                          <span className="block text-[10px] text-slate-400">{roomCount} rooms</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-slate-200 bg-white p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">New Project</div>
                <input
                  value={projectName}
                  onChange={event => setProjectName(event.target.value)}
                  placeholder="Project name"
                  className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-xs outline-none focus:border-violet-400"
                />
                <textarea
                  value={projectDescription}
                  onChange={event => setProjectDescription(event.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                  className="mt-2 w-full resize-none rounded-md border border-slate-300 px-2.5 py-2 text-xs outline-none focus:border-violet-400"
                />
                <button type="button" onClick={submitProject} disabled={!projectName.trim()} className="mt-2 w-full rounded-md bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">+ Create Project</button>
              </div>
            </aside>

            <section className="flex min-w-0 flex-1 flex-col">
              <header className="flex items-center gap-4 border-b border-slate-200 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl" aria-hidden="true">{selectedProject?.emoji ?? '📁'}</span>
                    <h3 className="truncate text-lg font-bold text-slate-900">{selectedProject?.name ?? 'Project'}</h3>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">{selectedProject?.description || 'No project description yet.'}</p>
                </div>
                <div className="flex gap-2 text-[11px]">
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">{projectRooms.length} rooms</span>
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">{projectDecisions.length} decisions</span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">{projectActions.filter(item => item.status !== 'done').length} open actions</span>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close Project Center">×</button>
              </header>

              <div className="flex gap-1 border-b border-slate-200 px-5 pt-2">
                {([
                  ['overview', 'Overview'],
                  ['decisions', 'Decision Register'],
                  ['actions', 'Action Items'],
                ] as Array<[ProjectTab, string]>).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setTab(value)} className={`border-b-2 px-3 py-2 text-xs font-semibold transition ${tab === value ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {tab === 'overview' && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">Rooms in this project</h4>
                      <p className="mt-1 text-xs text-slate-500">Assign any room to a workspace. New rooms inherit the active room's project.</p>
                    </div>
                    <div className="grid gap-2 lg:grid-cols-2">
                      {rooms.map(room => {
                        const roomProject = projects.find(project => project.id === room.projectId);
                        return (
                          <div key={room.id} className="rounded-xl border border-slate-200 p-3">
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => { setActiveRoom(room.id); setOpen(false); }} className="min-w-0 flex-1 truncate text-start text-sm font-semibold text-slate-800 hover:text-blue-600">
                                <span className="me-2">{room.emoji}</span>{room.name}
                              </button>
                              <span className="text-[10px] text-slate-400">{room.messages.length} msgs</span>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-[10px] font-medium text-slate-400">Project</span>
                              <select value={room.projectId ?? ''} onChange={event => setRoomProject(room.id, event.target.value)} className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs">
                                {projects.map(project => <option key={project.id} value={project.id}>{project.emoji} {project.name}</option>)}
                              </select>
                            </div>
                            {roomProject ? <div className="mt-1 text-[10px] text-slate-400">Currently in {roomProject.name}</div> : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {tab === 'decisions' && (
                  <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
                    <div className="h-fit rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <h4 className="text-sm font-bold text-slate-800">Record a decision</h4>
                      <p className="mt-1 text-[11px] text-slate-500">Start as Proposed, then explicitly approve or reverse it.</p>
                      <input value={decisionTitle} onChange={event => setDecisionTitle(event.target.value)} placeholder="Decision title" className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs" />
                      <textarea value={decisionDetails} onChange={event => setDecisionDetails(event.target.value)} placeholder="Decision details / rationale" rows={4} className="mt-2 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-xs" />
                      <select value={decisionRoomId} onChange={event => setDecisionRoomId(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs">
                        <option value="">Project-level decision</option>
                        {projectRooms.map(room => <option key={room.id} value={room.id}>{room.emoji} {room.name}</option>)}
                      </select>
                      <input value={decisionEvidence} onChange={event => setDecisionEvidence(event.target.value)} placeholder="Evidence, message ID or note (optional)" className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs" />
                      <button type="button" onClick={submitDecision} disabled={!decisionTitle.trim()} className="mt-3 w-full rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Add Proposed Decision</button>
                    </div>

                    <div className="space-y-2">
                      {projectDecisions.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-400">No decisions recorded for this project.</div> : null}
                      {projectDecisions.map(decision => {
                        const room = rooms.find(item => item.id === decision.roomId);
                        return (
                          <article key={decision.id} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex items-start gap-3">
                              <div className="min-w-0 flex-1">
                                <h5 className="text-sm font-bold text-slate-800">{decision.title}</h5>
                                {decision.details ? <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{decision.details}</p> : null}
                                <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-400">
                                  {room ? <span>{room.emoji} {room.name}</span> : <span>Project level</span>}
                                  {decision.evidence ? <span>Evidence: {decision.evidence}</span> : null}
                                </div>
                              </div>
                              <select value={decision.status} onChange={event => updateDecision(decision.id, { status: event.target.value as DecisionStatus })} className="rounded-md border border-slate-200 px-2 py-1.5 text-[11px] font-semibold">
                                {(Object.keys(decisionStatusLabel) as DecisionStatus[]).map(status => <option key={status} value={status}>{decisionStatusLabel[status]}</option>)}
                              </select>
                              <button type="button" onClick={() => deleteDecision(decision.id)} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete decision">⌫</button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                )}

                {tab === 'actions' && (
                  <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
                    <div className="h-fit rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <h4 className="text-sm font-bold text-slate-800">Create an action item</h4>
                      <input value={actionTitle} onChange={event => setActionTitle(event.target.value)} placeholder="Action / task" className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs" />
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input value={actionOwner} onChange={event => setActionOwner(event.target.value)} placeholder="Owner" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs" />
                        <input type="date" value={actionDeadline} onChange={event => setActionDeadline(event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs" />
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <select value={actionPriority} onChange={event => setActionPriority(event.target.value as ActionItemPriority)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs">
                          <option value="low">Low priority</option>
                          <option value="medium">Medium priority</option>
                          <option value="high">High priority</option>
                        </select>
                        <select value={actionRoomId} onChange={event => setActionRoomId(event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs">
                          <option value="">Project level</option>
                          {projectRooms.map(room => <option key={room.id} value={room.id}>{room.emoji} {room.name}</option>)}
                        </select>
                      </div>
                      <input value={actionEvidence} onChange={event => setActionEvidence(event.target.value)} placeholder="Evidence or source note (optional)" className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs" />
                      <button type="button" onClick={submitAction} disabled={!actionTitle.trim()} className="mt-3 w-full rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">+ Add Action Item</button>
                    </div>

                    <div className="space-y-2">
                      {projectActions.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-400">No action items for this project.</div> : null}
                      {projectActions.map(actionItem => {
                        const room = rooms.find(item => item.id === actionItem.roomId);
                        return (
                          <article key={actionItem.id} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex items-start gap-3">
                              <div className="min-w-0 flex-1">
                                <h5 className={`text-sm font-bold ${actionItem.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{actionItem.title}</h5>
                                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                                  <span>Owner: {actionItem.owner || 'Not assigned'}</span>
                                  <span>Deadline: {actionItem.deadline || 'Not set'}</span>
                                  <span className="font-semibold uppercase">{actionItem.priority}</span>
                                  {room ? <span>{room.emoji} {room.name}</span> : <span>Project level</span>}
                                  {actionItem.evidence ? <span>Evidence: {actionItem.evidence}</span> : null}
                                </div>
                              </div>
                              <select value={actionItem.status} onChange={event => updateActionItem(actionItem.id, { status: event.target.value as ActionItemStatus })} className="rounded-md border border-slate-200 px-2 py-1.5 text-[11px] font-semibold">
                                {(Object.keys(actionStatusLabel) as ActionItemStatus[]).map(status => <option key={status} value={status}>{actionStatusLabel[status]}</option>)}
                              </select>
                              <button type="button" onClick={() => deleteActionItem(actionItem.id)} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete action item">⌫</button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
