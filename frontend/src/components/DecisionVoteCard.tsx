import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import {
  decisionEvidenceForMessage,
  decisionVoteIdForMessage,
  findLatestDecisionProposal,
  parseSpecialistDecisionVote,
} from '@/lib/decisionVoting';
import { loadMeetingOrchestration, resetCurrentRound } from '@/lib/meetingOrchestration';
import { textDirection } from '@/lib/textDirection';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { VoteChoice } from '@/types/domain';

const voteTone: Record<VoteChoice, string> = {
  agree: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  concern: 'border-amber-300 bg-amber-50 text-amber-900',
  disagree: 'border-red-300 bg-red-50 text-red-900',
  abstain: 'border-slate-300 bg-slate-50 text-slate-700',
};

const checklistTone = {
  satisfied: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  condition: 'border-amber-200 bg-amber-50 text-amber-950',
  blocker: 'border-red-200 bg-red-50 text-red-950',
} as const;

export function DecisionVoteCard({ roomId }: { roomId: string }) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const agents = useWorkspaceStore(state => state.agents);
  const decisions = useWorkspaceStore(state => state.decisions);
  const updateDecision = useWorkspaceStore(state => state.updateDecision);
  const addUserMessage = useWorkspaceStore(state => state.addUserMessage);

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

  const tally = (['agree', 'concern', 'disagree', 'abstain'] as VoteChoice[])
    .map(choice => [choice, Object.values(vote?.votes ?? {}).filter(value => value === choice).length] as const);
  const proposalDirection = textDirection(`${record.proposal.title} ${record.proposal.details}`);

  return (
    <section className="mx-auto w-full max-w-[1000px] rounded-xl border border-indigo-200 bg-white shadow-sm" aria-label="Decision proposal and vote">
      <header className="flex flex-wrap items-start gap-4 border-b border-indigo-100 bg-indigo-50/70 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="cursor-default select-none rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-indigo-800">Olivia decision proposal</span>
            <span className="cursor-default select-none rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-700 ring-1 ring-inset ring-slate-200">{record.proposal.outcome.replaceAll('_', ' ')}</span>
            {decision ? (
              <span className={`cursor-default select-none rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset ${decision.status === 'approved' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : decision.status === 'reversed' ? 'bg-slate-100 text-slate-600 ring-slate-200' : 'bg-amber-50 text-amber-900 ring-amber-200'}`}>
                {decision.status}
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 text-base font-bold leading-6 text-slate-950" dir={proposalDirection}>{record.proposal.title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-700" dir={proposalDirection}>{record.proposal.details}</p>
        </div>
        <div className="text-end text-xs leading-5 text-slate-600" aria-live="polite">
          <div className="font-bold text-slate-800">{resolvedAgentIds.length}/{eligibleAgentIds.length} votes resolved</div>
          <div>{finalRoundComplete ? 'Final round complete' : 'Voting round in progress'}</div>
        </div>
      </header>

      <div className="decision-vote-scroll max-h-[calc(100dvh-280px)] overflow-y-auto overscroll-contain">
        <div className="grid items-start gap-4 p-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">Decision checklist</h4>
            <div className="mt-2 space-y-2.5">
              {record.proposal.checklist.map((item, index) => {
                const itemDirection = textDirection(`${item.item} ${item.evidence ?? ''}`);
                return (
                  <div
                    key={`${index}-${item.item}`}
                    className={`rounded-xl border px-3.5 py-3 ${checklistTone[item.status]}`}
                    dir={itemDirection}
                  >
                    <div className="flex items-start gap-2.5 text-start">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current/20 bg-white/70 text-sm font-black leading-none"
                      >
                        {item.status === 'satisfied' ? '✓' : item.status === 'condition' ? '△' : '!'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 text-sm font-semibold leading-6">{item.item}</div>
                          <span className="cursor-default select-none rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ring-current/20">
                            {item.status}
                          </span>
                        </div>
                        {item.evidence ? <div className="mt-1 text-sm leading-6">{item.evidence}</div> : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="self-start rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-0" aria-label="Team vote">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">Team vote</h4>
            <p className="mt-1 text-sm leading-6 text-slate-700" dir="auto">{record.proposal.voteQuestion}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tally.map(([choice, count]) => (
                <span key={choice} className={`cursor-default select-none rounded-full border px-2 py-1 text-xs font-bold ${voteTone[choice]}`}>
                  {choice}: {count}
                </span>
              ))}
            </div>
            <div className="mt-3 space-y-1.5">
              {eligibleAgentIds.map(agentId => {
                const agent = agents.find(item => item.id === agentId);
                const choice = vote?.votes[agentId];
                const skipped = meeting?.speakerStatus[agentId] === 'skipped';
                const parsed = rationaleByAgent.get(agentId);
                return (
                  <div key={agentId} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-semibold text-slate-800">{agent?.name ?? agentId}</span>
                      {choice ? (
                        <span className={`cursor-default select-none rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${voteTone[choice]}`}>{choice}</span>
                      ) : skipped ? (
                        <span className="cursor-default select-none rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">skipped</span>
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-500">waiting for vote</span>
                      )}
                    </div>
                    {parsed?.rationale ? <div className="mt-1 text-sm leading-5 text-slate-600" dir="auto">{parsed.rationale}</div> : null}
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      </div>

      <footer className="sticky bottom-0 z-50 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_10px_-6px_rgba(15,23,42,0.28)] backdrop-blur">
        <p className="max-w-2xl text-xs leading-5 text-slate-600">
          Specialist votes are decision evidence, not final authority. The user remains the final approver. Approval is enabled after the final round and all specialist votes are resolved or explicitly skipped.
        </p>
        <div className="flex flex-wrap gap-2">
          {decision?.status === 'approved' ? (
            <span className="cursor-default rounded-lg bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-800">✓ Decision approved</span>
          ) : (
            <>
              <button
                type="button"
                onClick={requestRevision}
                disabled={!meeting}
                className="rounded-lg border border-indigo-300 bg-white px-3.5 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
              >
                Request revision
              </button>
              <button
                type="button"
                onClick={approve}
                disabled={!canApprove}
                className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-indigo-600"
              >
                Approve voted decision
              </button>
            </>
          )}
        </div>
      </footer>
    </section>
  );
}
