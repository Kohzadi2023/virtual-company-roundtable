import { useEffect, useMemo, useState } from 'react';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { openOrFocusExternalChat } from '@/lib/externalChatWindow';
import {
  ensureMeetingRoom,
  getExternalAgentChat,
  inferExternalChatProvider,
  loadMeetingOrchestration,
  markSpeakerStatus,
  MEETING_ORCHESTRATION_EVENT,
  renameMeetingRound,
  resetCurrentRound,
  restartMeeting,
  setActiveSpeaker,
  setExternalAgentChat,
  setMeetingPhase,
  setMeetingRound,
  startNextRound,
  type MeetingPhase,
  type MeetingRoomState,
  type RoundStage,
} from '@/lib/meetingOrchestration';
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

function validExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function MeetingOrchestrationBar({ roomId }: { roomId: string }) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const agents = useWorkspaceStore(state => state.agents);
  const roles = useWorkspaceStore(state => state.roles);
  const [meeting, setMeeting] = useState<MeetingRoomState | null>(null);
  const [open, setOpen] = useState(false);
  const [chatAgentId, setChatAgentId] = useState('');
  const [chatUrl, setChatUrl] = useState('');

  useEffect(() => {
    if (!room) return;
    setMeeting(ensureMeetingRoom(room.id, room.agentIds));
    const refresh = () => setMeeting(loadMeetingOrchestration().rooms[room.id] ?? ensureMeetingRoom(room.id, room.agentIds));
    window.addEventListener(MEETING_ORCHESTRATION_EVENT, refresh);
    return () => window.removeEventListener(MEETING_ORCHESTRATION_EVENT, refresh);
  }, [room]);

  const roomAgents = useMemo(() => {
    if (!room || !meeting) return [];
    const byId = new Map(agents.map(agent => [agent.id, agent]));
    return meeting.speakerOrder.map(id => byId.get(id)).filter((agent): agent is NonNullable<typeof agent> => Boolean(agent));
  }, [agents, meeting, room]);

  useEffect(() => {
    if (roomAgents.some(agent => agent.id === chatAgentId)) return;
    setChatAgentId(roomAgents[0]?.id ?? '');
  }, [chatAgentId, roomAgents]);

  useEffect(() => {
    if (!chatAgentId) return;
    const saved = getExternalAgentChat(chatAgentId);
    setChatUrl(saved?.url ?? '');
  }, [chatAgentId]);

  if (!room || !meeting) return null;

  const specialistOrder = meeting.speakerOrder.filter(id => id !== MEETING_FACILITATOR_AGENT_ID);
  const specialistResponded = specialistOrder.filter(id => meeting.speakerStatus[id] === 'responded').length;
  const activeAgent = agents.find(agent => agent.id === meeting.activeSpeakerId);
  const currentRound = meeting.rounds[meeting.roundIndex] ?? 'Round';
  const canStartNextRound = meeting.roundStage === 'complete' && meeting.roundIndex < meeting.rounds.length - 1;
  const finalRoundComplete = meeting.roundStage === 'complete' && meeting.roundIndex >= meeting.rounds.length - 1;
  const nextLabel = meeting.roundStage === 'complete'
    ? canStartNextRound ? 'Awaiting next round' : '—'
    : activeAgent?.name ?? '—';
  const detectedProvider = validExternalUrl(chatUrl) ? inferExternalChatProvider(chatUrl) : null;

  const handlePhaseSelection = (phase: MeetingPhase) => {
    const mappedRound = ROUND_PHASE_INDEX[phase];
    if (mappedRound !== undefined && mappedRound < meeting.rounds.length) {
      setMeetingRound(room.id, mappedRound);
      return;
    }
    setMeetingPhase(room.id, phase);
  };

  const handleStartNextRound = () => {
    startNextRound(room.id);
  };

  const handleResetRound = () => {
    resetCurrentRound(room.id);
  };

  const handleRestartMeeting = () => {
    const confirmed = window.confirm('Restart this meeting from Round 1? Existing discussion messages, decisions and actions will not be deleted.');
    if (!confirmed) return;
    restartMeeting(room.id);
  };

  const saveChat = () => {
    if (chatUrl.trim() && !validExternalUrl(chatUrl.trim())) {
      window.alert('Enter a valid http:// or https:// conversation URL.');
      return;
    }
    setExternalAgentChat(chatAgentId, chatUrl);
  };

  return (
    <>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 text-[11px]">
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 font-bold text-violet-700 hover:bg-violet-100">◉ Meeting</button>
        <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-700">{phaseLabel(meeting.phase)}</span>
        <span className={`rounded-md px-2 py-1 font-semibold ${meeting.roundStage === 'synthesis' ? 'bg-violet-100 text-violet-700' : meeting.roundStage === 'complete' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{roundStageLabel(meeting.roundStage)}</span>
        <span className="text-slate-400">·</span>
        <span className="font-medium text-slate-600">Round {meeting.roundIndex + 1}/{meeting.rounds.length}: {currentRound}</span>
        <span className="text-slate-400">·</span>
        <span className="font-medium text-slate-600">Next: <strong className={meeting.roundStage === 'synthesis' ? 'text-violet-700' : 'text-slate-800'}>{nextLabel}</strong></span>
        <span className="ms-auto text-slate-400">{specialistResponded}/{specialistOrder.length} specialists responded</span>
        {canStartNextRound ? <button type="button" onClick={handleStartNextRound} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 font-bold text-emerald-700 hover:bg-emerald-100">Start Round {meeting.roundIndex + 2} →</button> : null}
        {meeting.roundStage === 'complete' ? <button type="button" onClick={handleResetRound} className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 font-semibold text-blue-700 hover:bg-blue-100">↻ Reset Round</button> : null}
        {finalRoundComplete && meeting.phase === 'decision' ? <button type="button" onClick={() => setMeetingPhase(room.id, 'actions')} className="rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50">Actions →</button> : null}
        {meeting.phase === 'actions' ? <button type="button" onClick={() => setMeetingPhase(room.id, 'closed')} className="rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50">Close meeting</button> : null}
      </div>

      {open ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/45 p-5" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="flex h-[82vh] w-[min(1080px,95vw)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Meeting orchestration">
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div><h2 className="text-base font-bold text-slate-900">Meeting Orchestration</h2><p className="mt-0.5 text-xs text-slate-500">Flow, rounds, speaking queue and external AI chat registry.</p></div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">✕</button>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-[1.2fr_1fr] divide-x divide-slate-200">
              <div className="min-h-0 overflow-y-auto p-5">
                <div className="rounded-xl border border-violet-100 bg-violet-50 p-3 text-xs leading-5 text-violet-800">
                  <strong>{roundStageLabel(meeting.roundStage)}</strong><br />
                  {meeting.roundStage === 'opening' ? 'Olivia opens this round. Only after her opening does the speaking queue move to the specialists.' : null}
                  {meeting.roundStage === 'specialists' ? 'Specialists contribute in queue order. After the final specialist, Olivia becomes next automatically.' : null}
                  {meeting.roundStage === 'synthesis' ? 'All specialist turns are complete. Copy Olivia context so she can synthesize this round.' : null}
                  {meeting.roundStage === 'complete' && canStartNextRound ? `Round ${meeting.roundIndex + 1} is complete. Review Olivia's synthesis, then explicitly start Round ${meeting.roundIndex + 2}.` : null}
                  {meeting.roundStage === 'complete' && !canStartNextRound ? 'The final round is complete. Move to Actions when the decision is ready.' : null}
                </div>

                <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-400">Meeting flow</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PHASES.map(item => <button key={item.value} type="button" onClick={() => handlePhaseSelection(item.value)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${meeting.phase === item.value ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{item.label}</button>)}
                </div>
                <p className="mt-1.5 text-[10px] leading-4 text-slate-400">Collect Opinions = Round 1 · Challenge = Round 2 · Resolve = Round 3 · Decision = Round 4. Selecting one of these phases starts that round with Olivia.</p>

                <div className="mt-6 flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Rounds</h3><span className="text-[10px] text-slate-400">A completed round never starts the next one automatically.</span></div>
                <div className="mt-2 space-y-2">
                  {meeting.rounds.map((round, index) => <div key={`${index}-${round}`} className={`flex items-center gap-2 rounded-lg border p-2 ${meeting.roundIndex === index ? 'border-blue-200 bg-blue-50' : 'border-slate-200'}`}><button type="button" onClick={() => setMeetingRound(room.id, index)} className="grid h-7 w-7 place-items-center rounded-full bg-white text-xs font-bold text-slate-600 shadow-sm">{index + 1}</button><input value={round} onChange={event => renameMeetingRound(room.id, index, event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-700 outline-none" /></div>)}
                </div>

                {canStartNextRound ? <button type="button" onClick={handleStartNextRound} className="mt-3 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100">Start Next Round · Round {meeting.roundIndex + 2}: {meeting.rounds[meeting.roundIndex + 1]} →</button> : null}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={handleResetRound} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100">↻ Reset Current Round</button>
                  <button type="button" onClick={handleRestartMeeting} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100">↻ Restart Meeting</button>
                </div>
                <p className="mt-1.5 text-[10px] leading-4 text-slate-400">Resetting orchestration never deletes room messages, decisions, actions, minutes or memories.</p>

                <div className="mt-6 flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Speaking queue</h3><span className="text-[10px] text-slate-400">Each new round starts with Olivia.</span></div>
                <div className="mt-2 space-y-2">
                  {roomAgents.map(agent => {
                    const role = roles.find(item => item.id === agent.roleId);
                    const status = meeting.speakerStatus[agent.id] ?? 'waiting';
                    const active = meeting.activeSpeakerId === agent.id;
                    return <div key={agent.id} className={`flex items-center gap-2 rounded-lg border p-2 ${active ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200'}`}><button type="button" onClick={() => setActiveSpeaker(room.id, agent.id)} className="min-w-0 flex-1 text-start"><div className="truncate text-xs font-bold text-slate-800">{agent.name}{agent.id === MEETING_FACILITATOR_AGENT_ID ? ' · Facilitator' : ''}</div><div className="truncate text-[10px] text-slate-400">{role?.name ?? 'Specialist'}</div></button><span className={`rounded px-2 py-1 text-[9px] font-bold uppercase ${status === 'responded' ? 'bg-emerald-100 text-emerald-700' : status === 'skipped' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>{status}</span><button type="button" onClick={() => markSpeakerStatus(room.id, agent.id, status === 'skipped' ? 'waiting' : 'skipped')} className="rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-500 hover:bg-white">{status === 'skipped' ? 'Unskip' : 'Skip'}</button></div>;
                  })}
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto bg-slate-50 p-5">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Agent Chat Registry</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">Save each specialist's external AI conversation URL. The provider is detected automatically from the URL; there is nothing to select manually. Virtual Company stays manual-AI and stores only the navigation link.</p>
                <label className="mt-4 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Agent</label>
                <select value={chatAgentId} onChange={event => setChatAgentId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs">{roomAgents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
                <label className="mt-3 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Conversation URL</label>
                <input value={chatUrl} onChange={event => setChatUrl(event.target.value)} placeholder="https://chatgpt.com/c/..." className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs" />
                <div className="mt-2 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px]">
                  <span className="font-semibold uppercase tracking-wide text-slate-400">Detected provider</span>
                  <span className={`font-bold ${detectedProvider && detectedProvider !== 'Other' ? 'text-violet-700' : 'text-slate-500'}`}>{detectedProvider ?? 'Waiting for valid URL'}</span>
                </div>
                <div className="mt-3 flex gap-2"><button type="button" onClick={saveChat} className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">Save Link</button><button type="button" disabled={!validExternalUrl(chatUrl)} onClick={() => openOrFocusExternalChat(chatAgentId, chatUrl)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-40">Open / Focus ↗</button></div>

                <div className="mt-6 space-y-2">
                  {roomAgents.map(agent => { const chat = getExternalAgentChat(agent.id); return <div key={agent.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2.5"><div className="min-w-0"><div className="truncate text-xs font-bold text-slate-700">{agent.name}</div><div className="truncate text-[10px] text-slate-400">{chat ? `${chat.provider} · linked` : 'No external chat saved'}</div></div>{chat && validExternalUrl(chat.url) ? <button type="button" onClick={() => openOrFocusExternalChat(agent.id, chat.url)} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-200">Open / Focus ↗</button> : null}</div>; })}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
