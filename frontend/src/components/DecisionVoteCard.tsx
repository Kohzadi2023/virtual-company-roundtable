import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import {
  buildChecklistFollowUpRoomName,
  buildChecklistFollowUpSeedMessage,
  decisionEvidenceForMessage,
  decisionVoteIdForMessage,
  findChecklistFollowUp,
  findLatestDecisionProposal,
  parseSpecialistDecisionVote,
  type DecisionChecklistStatus,
} from '@/lib/decisionVoting';
import { loadMeetingOrchestration, resetCurrentRound } from '@/lib/meetingOrchestration';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { ActionItemStatus, VoteChoice } from '@/types/domain';

const followUpStatusLabel: Record<ActionItemStatus, string> = {
  todo: 'Todo',
  'in-progress': 'In progress',
  done: 'Done',
};

const voteTone: Record<VoteChoice, string> = {
  agree: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  concern: 'border-amber-200 bg-amber-50 text-amber-700',
  disagree: 'border-rose-200 bg-rose-50 text-rose-700',
  abstain: 'border-slate-200 bg-slate-50 text-slate-600',
};

const checklistTone = {
  satisfied: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  condition: 'border-amber-200 bg-amber-50 text-amber-800',
  blocker: 'border-rose-200 bg-rose-50 text-rose-800',
} as const;

export function DecisionVoteCard({ roomId }: { roomId: string }) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const agents = useWorkspaceStore(state => state.agents);
  const decisions = useWorkspaceStore(state => state.decisions);
  const actionItems = useWorkspaceStore(state => state.actionItems);
  const updateDecision = useWorkspaceStore(state => state.updateDecision);
  const addUserMessage = useWorkspaceStore(state => state.addUserMessage);
  const addActionItem = useWorkspaceStore(state => state.addActionItem);
  const createRoom = useWorkspaceStore(state => state.createRoom);
  const setActiveRoom = useWorkspaceStore(state => state.setActiveRoom);

  if (!room) return null;
  const record = findLatestDecisionProposal(room.messages);
  if (!record) return null;

  const evidence = decisionEvidenceForMessage(record.message.id);
  const decision = decisions.find(item => item.roomId === room.id && item.evidence === evidence);
  const vote = room.votes?.find(item => item.id === decisionVoteIdForMessage(record.message.id));
  const meeting = loadMeetingOrchestration().rooms[room.id];
  const eligibleAgentIds = (meeting?.speakerOrder ?? room.agentIds)
    .filter(agentId => agentId !== MEETING_FACILITATOR_AGENT_ID);

  const proposalIndex = room.messages.findIndex(item => item.id === record.message.id);
  const rationaleByAgent = new Map<string, ReturnType<typeof parseSpecialistDecisionVote>>();
  for (const message of room.messages.slice(Math.max(0, proposalIndex + 1))) {
    if (message.authorType !== 'agent' || !message.authorId || message.authorId === MEETING_FACILITATOR_AGENT_ID) continue;
    const parsed = parseSpecialistDecisionVote(message.content);
    if (parsed) rationaleByAgent.set(message.authorId, parsed);
  }

  const resolvedAgentIds = eligibleAgentIds.filter(agentId => (
    Boolean(vote?.votes[agentId]) || meeting?.speakerStatus[agentId] === 'skipped'
  ));
  const voteComplete = eligibleAgentIds.length > 0 && resolvedAgentIds.length === eligibleAgentIds.length;
  const finalRoundComplete = Boolean(
    meeting
    && meeting.roundStage === 'complete'
    && meeting.roundIndex >= meeting.rounds.length - 1,
  );
  const canApprove = Boolean(decision && decision.status === 'proposed' && voteComplete && finalRoundComplete);

  const approve = () => {
    if (!decision || !canApprove) return;
    updateDecision(decision.id, { status: 'approved' });
  };

  const requestRevision = () => {
    if (!meeting) return;
    const confirmed = window.confirm('Request a revised decision proposal from Olivia and restart the current final round?');
    if (!confirmed) return;
    addUserMessage(room.id, 'Revise the current final decision proposal using the specialist vote concerns and blockers. Produce a new decision checklist and put the revised proposal back to the team for a fresh vote.');
    resetCurrentRound(room.id);
  };

  const continueChecklistItemInFollowUp = (itemText: string, itemEvidence: string | undefined, itemStatus: DecisionChecklistStatus) => {
    if (!decision) return;
    const confirmed = window.confirm(`Open a follow-up meeting to continue "${itemText}"?`);
    if (!confirmed) return;
    const followUpRoomId = createRoom(
      buildChecklistFollowUpRoomName(itemText),
      '🔁',
      room.individualAgentIds ?? [],
      room.teamIds ?? [],
      decision.projectId,
    );
    addUserMessage(followUpRoomId, buildChecklistFollowUpSeedMessage(decision.title, record.proposal.outcome, itemText, itemEvidence));
    addActionItem({
      projectId: decision.projectId,
      roomId: followUpRoomId,
      sourceDecisionId: decision.id,
      title: itemText,
      evidence: itemEvidence,
      status: 'todo',
      priority: itemStatus === 'blocker' ? 'high' : 'medium',
    });
  };

  const tally = (['agree', 'concern', 'disagree', 'abstain'] as VoteChoice[])
    .map(choice => [choice, Object.values(vote?.votes ?? {}).filter(value => value === choice).length] as const);

  return (
    <section className="mx-auto w-full max-w-[1000px] rounded-xl border border-indigo-200 bg-white shadow-sm" aria-label="Decision proposal and vote">
      <header className="flex flex-wrap items-start gap-3 border-b border-indigo-100 bg-indigo-50/70 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">Olivia decision proposal</span>
            <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">{record.proposal.outcome.replaceAll('_', ' ')}</span>
            {decision ? <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${decision.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : decision.status === 'reversed' ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>{decision.status}</span> : null}
          </div>
          <h3 className="mt-2 text-sm font-bold text-slate-900" dir="auto">{record.proposal.title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600" dir="auto">{record.proposal.details}</p>
        </div>
        <div className="text-end text-[10px] leading-4 text-slate-500">
          <div className="font-bold text-slate-700">{resolvedAgentIds.length}/{eligibleAgentIds.length} votes resolved</div>
          <div>{finalRoundComplete ? 'Final round complete' : 'Voting round in progress'}</div>
        </div>
      </header>

      <p className="px-4 pt-3 text-xs text-slate-600" dir="auto">{record.proposal.voteQuestion}</p>

      <div className="grid gap-4 p-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Decision checklist</h4>
          <div className="mt-2 space-y-2">
            {record.proposal.checklist.map((item, index) => {
              const followUp = decision ? findChecklistFollowUp(actionItems, decision.id, item.item) : undefined;
              return (
                <div key={`${index}-${item.item}`} className={`rounded-lg border px-3 py-2 text-xs ${checklistTone[item.status]}`}>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 font-bold">{item.status === 'satisfied' ? '✓' : item.status === 'condition' ? '△' : '!'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold" dir="auto">{item.item}</div>
                      {item.evidence ? <div className="mt-1 text-[10px] opacity-75" dir="auto">{item.evidence}</div> : null}
                      {item.status !== 'satisfied' ? (
                        <div className="mt-1.5">
                          {followUp ? (
                            <button
                              type="button"
                              onClick={() => followUp.roomId && setActiveRoom(followUp.roomId)}
                              disabled={!followUp.roomId}
                              className="rounded-full border border-current/30 bg-white/60 px-2 py-0.5 text-[10px] font-bold hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              ↪ Follow-up: {followUpStatusLabel[followUp.status]}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => continueChecklistItemInFollowUp(item.item, item.evidence, item.status)}
                              disabled={!decision}
                              className="rounded-full border border-current/30 bg-white/60 px-2 py-0.5 text-[10px] font-bold hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Continue in follow-up meeting
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Team vote</h4>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tally.map(([choice, count]) => <span key={choice} className={`rounded-full border px-2 py-1 text-[10px] font-bold ${voteTone[choice]}`}>{choice}: {count}</span>)}
          </div>
          <div className="mt-3 space-y-1.5">
            {eligibleAgentIds.map(agentId => {
              const agent = agents.find(item => item.id === agentId);
              const choice = vote?.votes[agentId];
              const skipped = meeting?.speakerStatus[agentId] === 'skipped';
              const parsed = rationaleByAgent.get(agentId);
              return (
                <div key={agentId} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-slate-700">{agent?.name ?? agentId}</span>
                    {choice ? <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${voteTone[choice]}`}>{choice}</span> : skipped ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-bold text-slate-500">skipped</span> : <span className="text-[9px] font-semibold text-slate-400">waiting for vote</span>}
                  </div>
                  {parsed?.rationale ? <div className="mt-1 text-[10px] leading-4 text-slate-500" dir="auto">{parsed.rationale}</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
        <p className="max-w-2xl text-[10px] leading-4 text-slate-500">
          Specialist votes are decision evidence, not final authority. The user remains the final approver. Approval is enabled after the final round and all specialist votes are resolved or explicitly skipped.
        </p>
        <div className="flex gap-2">
          {decision?.status === 'approved' ? (
            <span className="rounded-lg bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-700">✓ Decision approved</span>
          ) : (
            <>
              <button type="button" onClick={requestRevision} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Request revision</button>
              <button type="button" onClick={approve} disabled={!canApprove} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">Approve voted decision</button>
            </>
          )}
        </div>
      </footer>
    </section>
  );
}
