import { useEffect, useMemo, useRef, useState } from 'react';
import { MeetingAgentRow, type MeetingAgentRowData } from '@/components/MeetingAgentRow';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { keepTabFocusInsideDialog } from '@/lib/dialogFocus';
import { normalizeExternalChatUrl } from '@/lib/externalChatLink';
import { openOrFocusExternalChat } from '@/lib/externalChatWindow';
import {
  ensureMeetingRoom,
  hasMeetingStarted,
  loadMeetingOrchestration,
  markSpeakerStatus,
  MEETING_ORCHESTRATION_EVENT,
  phaseForRound,
  renameMeetingRound,
  resetCurrentRound,
  restartMeeting,
  setActiveSpeaker,
  setExternalAgentChat,
  setMeetingBrief,
  setMeetingPhase,
  setMeetingRound,
  startNextRound,
  type MeetingPhase,
  type MeetingRoomState,
  type RoundStage,
} from '@/lib/meetingOrchestration';
import { assessMeetingReadiness } from '@/lib/meetingReadiness';
import {
  loadOperationsSuite,
  OPERATIONS_SUITE_EVENT,
  type OperationsSuiteState,
} from '@/lib/operationsSuite';
import { useWorkspaceStore } from '@/store/workspaceStore';

const PHASES: Array<{ value: MeetingPhase; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'collect', label: 'Collect Opinions' },
  { value: 'challenge', label: 'Challenge' },
  { value: 'resolve', label: 'Resolve' },
  { value: 'decision', label: 'Decision' },
  { value: 'actions', label: 'Actions' },
  { value: 'closed', label: 'Closed' },
];

const ROUND_PHASE_INDEX: Partial<Record<MeetingPhase, number>> = {
  collect: 0,
  challenge: 1,
  resolve: 2,
  decision: 3,
};

function phaseLabel(value: MeetingPhase): string {
  return PHASES.find(item => item.value === value)?.label ?? value;
}

function roundStageLabel(value: RoundStage): string {
  switch (value) {
    case 'opening': return 'Olivia opening';
    case 'specialists': return 'Specialist round';
    case 'synthesis': return 'Olivia synthesis';
    case 'complete': return 'Round complete';
  }
}

function roundStageDescription(meeting: MeetingRoomState, canStartNextRound: boolean): string {
  if (meeting.roundStage === 'opening') return 'Olivia opens this round before the specialist queue begins.';
  if (meeting.roundStage === 'specialists') return 'Specialists contribute in queue order; Olivia follows with synthesis.';
  if (meeting.roundStage === 'synthesis') return 'Specialist turns are complete. Olivia is next for synthesis.';
  if (canStartNextRound) return `Round ${meeting.roundIndex + 1} is complete. Review the synthesis, then start the next round.`;
  return 'The final round is complete. Move to Actions when the decision is ready.';
}

function showReadinessBlockers(title: string, blockers: string[]): void {
  window.alert(`${title}\n\n${blockers.map((item, index) => `${index + 1}. ${item}`).join('\n')}`);
}

export function MeetingOrchestrationBar({ roomId }: { roomId: string }) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const agents = useWorkspaceStore(state => state.agents);
  const roles = useWorkspaceStore(state => state.roles);
  const decisions = useWorkspaceStore(state => state.decisions);
  const actionItems = useWorkspaceStore(state => state.actionItems);
  const [meeting, setMeeting] = useState<MeetingRoomState | null>(null);
  const [operations, setOperations] = useState<OperationsSuiteState>(() => loadOperationsSuite());
  const [open, setOpen] = useState(false);
  const [chatRevision, setChatRevision] = useState(0);
  const meetingButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!room) return;
    setMeeting(ensureMeetingRoom(room.id, room.agentIds));
    const refresh = () => {
      setMeeting(loadMeetingOrchestration().rooms[room.id] ?? ensureMeetingRoom(room.id, room.agentIds));
      setChatRevision(value => value + 1);
    };
    window.addEventListener(MEETING_ORCHESTRATION_EVENT, refresh);
    return () => window.removeEventListener(MEETING_ORCHESTRATION_EVENT, refresh);
  }, [room]);

  useEffect(() => {
    const refresh = () => setOperations(loadOperationsSuite());
    window.addEventListener(OPERATIONS_SUITE_EVENT, refresh);
    return () => window.removeEventListener(OPERATIONS_SUITE_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusFrame = window.requestAnimationFrame(() => dialog.focus());
    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        window.requestAnimationFrame(() => meetingButtonRef.current?.focus());
        return;
      }
      keepTabFocusInsideDialog(event, dialog);
    };

    document.addEventListener('keydown', handleDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleDialogKeyDown);
    };
  }, [open]);

  const agentRows = useMemo<MeetingAgentRowData[]>(() => {
    if (!meeting) return [];
    const agentById = new Map(agents.map(agent => [agent.id, agent]));
    const roleById = new Map(roles.map(role => [role.id, role]));
    const chats = loadMeetingOrchestration().chats;

    return meeting.speakerOrder.flatMap(agentId => {
      const agent = agentById.get(agentId);
      if (!agent) return [];
      const chat = chats[agentId];
      return [{
        agent,
        role: roleById.get(agent.roleId),
        status: meeting.speakerStatus[agentId] ?? 'waiting',
        active: meeting.activeSpeakerId === agentId,
        facilitator: agentId === MEETING_FACILITATOR_AGENT_ID,
        provider: chat?.provider,
        chatUrl: chat?.url,
      } satisfies MeetingAgentRowData];
    });
  }, [agents, chatRevision, meeting, roles]);

  if (!room || !meeting) return null;

  const readiness = assessMeetingReadiness({ roomId: room.id, meeting, operations, decisions, actionItems });
  const meetingStarted = hasMeetingStarted(meeting);
  const specialistRows = agentRows.filter(row => !row.facilitator);
  const specialistResponded = specialistRows.filter(row => row.status === 'responded').length;
  const activeRow = agentRows.find(row => row.active);
  const currentRound = meeting.rounds[meeting.roundIndex] ?? 'Round';
  const canStartNextRound = meeting.roundStage === 'complete' && meeting.roundIndex < meeting.rounds.length - 1;
  const finalRoundComplete = meeting.roundStage === 'complete' && meeting.roundIndex >= meeting.rounds.length - 1;
  const nextLabel = meeting.roundStage === 'complete'
    ? canStartNextRound ? 'Awaiting next round' : '—'
    : activeRow?.agent.name ?? '—';

  const closeMeetingModal = () => {
    setOpen(false);
    window.requestAnimationFrame(() => meetingButtonRef.current?.focus());
  };

  const handleRoundSelection = (roundIndex: number) => {
    if (phaseForRound(roundIndex) === 'decision' && !readiness.decisionReady) {
      showReadinessBlockers('Decision round is blocked until readiness issues are resolved:', readiness.decisionBlockers);
      return;
    }
    setMeetingRound(room.id, roundIndex);
  };

  const handlePhaseSelection = (phase: MeetingPhase) => {
    if (phase === 'decision' && !readiness.decisionReady) {
      showReadinessBlockers('Decision phase is blocked until readiness issues are resolved:', readiness.decisionBlockers);
      return;
    }
    if (phase === 'closed' && !readiness.closeReady) {
      showReadinessBlockers('Meeting close is blocked until readiness issues are resolved:', readiness.closeBlockers);
      return;
    }
    const mappedRound = ROUND_PHASE_INDEX[phase];
    if (mappedRound !== undefined && mappedRound < meeting.rounds.length) {
      setMeetingRound(room.id, mappedRound);
      return;
    }
    setMeetingPhase(room.id, phase);
  };

  const handleStartNextRound = () => {
    const nextRoundIndex = meeting.roundIndex + 1;
    if (phaseForRound(nextRoundIndex) === 'decision' && !readiness.decisionReady) {
      showReadinessBlockers('Decision round is blocked until readiness issues are resolved:', readiness.decisionBlockers);
      return;
    }
    startNextRound(room.id);
  };

  const handleRestartMeeting = () => {
    const confirmed = window.confirm('Restart this meeting from Round 1? Existing discussion messages, decisions and actions will not be deleted.');
    if (!confirmed) return;
    restartMeeting(room.id);
  };

  const handleCloseMeeting = () => {
    if (!readiness.closeReady) {
      showReadinessBlockers('Meeting close is blocked until readiness issues are resolved:', readiness.closeBlockers);
      return;
    }
    setMeetingPhase(room.id, 'closed');
  };

  const handleSaveChat = (agentId: string, url: string) => {
    setExternalAgentChat(agentId, normalizeExternalChatUrl(url));
  };

  const handleOpenChat = (agentId: string, url: string) => {
    openOrFocusExternalChat(agentId, normalizeExternalChatUrl(url));
  };

  return (
    <>
      <div className="flex h-10 shrink-0 items-center gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 text-[11px]">
        <button ref={meetingButtonRef} type="button" onClick={() => setOpen(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 font-bold text-violet-700 hover:bg-violet-100">◉ Meeting</button>
        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-700">{phaseLabel(meeting.phase)}</span>
        <span className={`shrink-0 rounded-md px-2 py-1 font-semibold ${meeting.roundStage === 'synthesis' ? 'bg-violet-100 text-violet-700' : meeting.roundStage === 'complete' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{roundStageLabel(meeting.roundStage)}</span>
        <span className={`shrink-0 rounded-md px-2 py-1 font-semibold ${readiness.decisionReady ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{readiness.decisionReady ? 'Decision ready' : `${readiness.decisionBlockers.length} readiness blocker${readiness.decisionBlockers.length === 1 ? '' : 's'}`}</span>
        <span className="text-slate-400">·</span>
        <span className="shrink-0 font-medium text-slate-600">Round {meeting.roundIndex + 1}/{meeting.rounds.length}: {currentRound}</span>
        <span className="text-slate-400">·</span>
        <span className="shrink-0 font-medium text-slate-600">Next: <strong className={meeting.roundStage === 'synthesis' ? 'text-violet-700' : 'text-slate-800'}>{nextLabel}</strong></span>
        <span className="ms-auto shrink-0 text-slate-400">{specialistResponded}/{specialistRows.length} specialists responded</span>
        {canStartNextRound ? <button type="button" onClick={handleStartNextRound} className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 font-bold text-emerald-700 hover:bg-emerald-100">Start Round {meeting.roundIndex + 2} →</button> : null}
        {meetingStarted && meeting.roundStage === 'complete' ? <button type="button" onClick={() => resetCurrentRound(room.id)} className="shrink-0 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 font-semibold text-blue-700 hover:bg-blue-100">↻ Reset Round</button> : null}
        {finalRoundComplete && meeting.phase === 'decision' ? <button type="button" onClick={() => setMeetingPhase(room.id, 'actions')} className="shrink-0 rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50">Actions →</button> : null}
        {meeting.phase === 'actions' ? <button type="button" onClick={handleCloseMeeting} className={`shrink-0 rounded-md border px-2 py-1 font-semibold ${readiness.closeReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>{readiness.closeReady ? 'Close meeting' : 'Close blocked'}</button> : null}
      </div>

      {open ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/45 p-2 sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) closeMeetingModal(); }}>
          <section
            ref={dialogRef}
            tabIndex={-1}
            className="flex h-[96vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl sm:h-[90vh] sm:w-[96vw] sm:rounded-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meeting-orchestration-title"
            aria-describedby="meeting-orchestration-description"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white px-3 py-3 sm:items-center sm:px-5 sm:py-4">
              <div className="min-w-0">
                <h2 id="meeting-orchestration-title" className="text-base font-bold text-slate-900">Meeting Orchestration</h2>
                <p id="meeting-orchestration-description" className="mt-0.5 text-xs text-slate-500">One operational view for meeting state, specialist turns and external AI chats.</p>
              </div>
              <button type="button" onClick={closeMeetingModal} aria-label="Close meeting orchestration" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">✕</button>
            </header>

            <div className="max-h-[46vh] shrink-0 overflow-y-auto border-b border-slate-200 bg-slate-50/70 px-3 py-3 sm:max-h-none sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${meeting.roundStage === 'complete' ? 'bg-emerald-100 text-emerald-700' : meeting.roundStage === 'synthesis' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>{roundStageLabel(meeting.roundStage)}</span>
                <span className="min-w-0 flex-1 text-xs text-slate-600">{roundStageDescription(meeting, canStartNextRound)}</span>
                <span className="w-full text-xs font-semibold text-slate-500 sm:ms-auto sm:w-auto">Next: <span className="text-slate-800">{nextLabel}</span></span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Objective</span>
                  <textarea value={meeting.objective ?? ''} onChange={event => setMeetingBrief(room.id, { objective: event.target.value })} rows={2} placeholder="What must this meeting accomplish?" className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs leading-4 outline-none focus:border-violet-400" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Expected outcome</span>
                  <textarea value={meeting.expectedOutcome ?? ''} onChange={event => setMeetingBrief(room.id, { expectedOutcome: event.target.value })} rows={2} placeholder="What concrete output should exist?" className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs leading-4 outline-none focus:border-violet-400" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Decision question</span>
                  <textarea value={meeting.decisionQuestion ?? ''} onChange={event => setMeetingBrief(room.id, { decisionQuestion: event.target.value })} rows={2} placeholder="What exact decision must be made?" className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs leading-4 outline-none focus:border-violet-400" />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="me-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Flow</span>
                {PHASES.map(item => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => handlePhaseSelection(item.value)}
                    className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold ${meeting.phase === item.value ? 'border-violet-300 bg-violet-50 text-violet-700' : item.value === 'decision' && !readiness.decisionReady || item.value === 'closed' && !readiness.closeReady ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    {item.label}
                  </button>
                ))}
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold sm:ms-2 ${readiness.decisionReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>Decision {readiness.decisionReady ? 'READY' : `BLOCKED · ${readiness.decisionBlockers.length}`}</span>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${readiness.closeReady ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>Close {readiness.closeReady ? 'READY' : `BLOCKED · ${readiness.closeBlockers.length}`}</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="me-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Rounds</span>
                {meeting.rounds.map((round, index) => (
                  <div key={`${index}-${round}`} className={`flex min-w-0 max-w-full items-center gap-1 rounded-md border px-1.5 py-1 ${meeting.roundIndex === index ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                    <button type="button" onClick={() => handleRoundSelection(index)} className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white text-[10px] font-bold text-slate-600 shadow-sm">{index + 1}</button>
                    <input value={round} onChange={event => renameMeetingRound(room.id, index, event.target.value)} className="w-28 min-w-0 bg-transparent text-[11px] font-semibold text-slate-700 outline-none sm:w-32" />
                  </div>
                ))}
              </div>

              {!readiness.decisionReady && readiness.decisionBlockers.length > 0 ? <div className="mt-2 break-words text-[10px] text-amber-700 sm:truncate" title={readiness.decisionBlockers.join(' · ')}>Decision blockers: {readiness.decisionBlockers.join(' · ')}</div> : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white">
              <div className="sticky top-0 z-10 hidden grid-cols-[minmax(250px,1.2fr)_minmax(220px,0.9fr)_minmax(340px,1.4fr)] items-center gap-4 border-b border-slate-200 bg-slate-100/95 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 backdrop-blur lg:grid">
                <span>Agent</span>
                <span>Meeting Status</span>
                <span>External Chat</span>
              </div>
              {agentRows.length > 0 ? (
                agentRows.map(data => (
                  <MeetingAgentRow
                    key={data.agent.id}
                    data={data}
                    onActivate={agentId => setActiveSpeaker(room.id, agentId)}
                    onToggleSkip={(agentId, status) => markSpeakerStatus(room.id, agentId, status === 'skipped' ? 'waiting' : 'skipped')}
                    onSaveChat={handleSaveChat}
                    onOpenChat={handleOpenChat}
                  />
                ))
              ) : (
                <div className="grid h-full place-items-center p-8 text-sm text-slate-400">No agents are assigned to this meeting.</div>
              )}
            </div>

            <footer className="flex shrink-0 flex-col items-stretch gap-2 border-t border-slate-200 bg-white px-3 py-3 sm:px-5 lg:flex-row lg:items-center lg:gap-3">
              <div className="min-w-0 text-xs text-slate-500">
                <span className="font-bold text-slate-800">Round {meeting.roundIndex + 1}/{meeting.rounds.length}</span>
                <span className="mx-2 text-slate-300">·</span>
                <span>{currentRound}</span>
                <span className="mx-2 text-slate-300">·</span>
                <span>{specialistResponded}/{specialistRows.length} specialists responded</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:ms-auto lg:justify-end">
                {canStartNextRound ? <button type="button" onClick={handleStartNextRound} className={`rounded-lg border px-3 py-2 text-xs font-bold ${phaseForRound(meeting.roundIndex + 1) === 'decision' && !readiness.decisionReady ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>Start Round {meeting.roundIndex + 2} →</button> : null}
                {meetingStarted ? <button type="button" onClick={() => resetCurrentRound(room.id)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100">↻ Reset Current Round</button> : null}
                {meetingStarted ? <button type="button" onClick={handleRestartMeeting} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100">↻ Restart Meeting</button> : null}
                {finalRoundComplete && meeting.phase === 'decision' ? <button type="button" onClick={() => setMeetingPhase(room.id, 'actions')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Actions →</button> : null}
                {meeting.phase === 'actions' ? <button type="button" onClick={handleCloseMeeting} className={`rounded-lg border px-3 py-2 text-xs font-bold ${readiness.closeReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>{readiness.closeReady ? 'Close meeting' : 'Close blocked'}</button> : null}
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
