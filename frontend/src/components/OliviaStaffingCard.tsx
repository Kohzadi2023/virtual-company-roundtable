import { useEffect, useMemo, useState } from 'react';
import { copyText } from '@/lib/clipboard';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { openOrFocusExternalChat } from '@/lib/externalChatWindow';
import { getExternalAgentChat, hasMeetingStarted, loadMeetingOrchestration, restartMeeting } from '@/lib/meetingOrchestration';
import { advanceAfterAgentResponse } from '@/lib/meetingResponseFlow';
import {
  applyOliviaStaffingPlan,
  deriveStaffingReadiness,
  findLatestOliviaStaffingPlan,
  isOliviaStaffingPlanApplied,
  type StaffingBlocker,
  type StaffingReadiness,
} from '@/lib/meetingStaffing';
import { buildOliviaStaffingRecoveryPrompt } from '@/lib/oliviaRegeneration';
import { useWorkspaceStore } from '@/store/workspaceStore';

const READINESS_LABEL: Record<StaffingReadiness, string> = {
  TEAM_READY: 'Team ready',
  STAFFING_ACTION_REQUIRED: 'Staffing action required',
  INSUFFICIENT_CONTEXT: 'Needs clarification',
};

const READINESS_CLASS: Record<StaffingReadiness, string> = {
  TEAM_READY: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  STAFFING_ACTION_REQUIRED: 'bg-amber-50 text-amber-800 ring-amber-200',
  INSUFFICIENT_CONTEXT: 'bg-rose-50 text-rose-700 ring-rose-200',
};

function describeStaffingAction(blocker: StaffingBlocker, pendingApproval: boolean): string {
  switch (blocker.type) {
    case 'required-participant-missing':
      return pendingApproval
        ? `${blocker.name ?? blocker.participantId} will be added to the room when you approve Invite Team.`
        : `${blocker.name ?? blocker.participantId} is still missing from the room after the staffing action.`;
    case 'required-ai-hire-failed':
      return pendingApproval
        ? `${blocker.role} will be created and added to the room when you approve Invite Team.`
        : `${blocker.role} is still missing after the staffing action.`;
    case 'human-staffing-required':
      return `Human ${blocker.hireType} required: ${blocker.role}. Invite Team cannot create this role.`;
  }
}

export function OliviaStaffingCard({ roomId }: { roomId: string }) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const agents = useWorkspaceStore(state => state.agents);
  const roles = useWorkspaceStore(state => state.roles);
  const teams = useWorkspaceStore(state => state.teams);
  const [message, setMessage] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  const [applyAttempted, setApplyAttempted] = useState(false);

  useEffect(() => {
    setMessage('');
    setIsRegenerating(false);
    setManuallyExpanded(false);
    setApplyAttempted(false);
  }, [roomId]);

  const plan = useMemo(
    () => room ? findLatestOliviaStaffingPlan(room.messages, MEETING_FACILITATOR_AGENT_ID) : null,
    [room],
  );
  const latestOliviaResponse = useMemo(
    () => room ? [...room.messages].reverse().find(item => item.authorType === 'agent' && item.authorId === MEETING_FACILITATOR_AGENT_ID) : undefined,
    [room],
  );

  if (!room) return null;

  const meeting = loadMeetingOrchestration().rooms[room.id];

  if (!plan) {
    if (!latestOliviaResponse) return null;
    const advancedPastStaffing = Boolean(meeting && hasMeetingStarted(meeting));
    const olivia = agents.find(agent => agent.id === MEETING_FACILITATOR_AGENT_ID);
    const oliviaRole = olivia ? roles.find(role => role.id === olivia.roleId) : undefined;

    const returnToStaffing = () => {
      if (restartMeeting(room.id)) {
        setMessage('Meeting returned to the staffing stage. Regenerate Olivia’s response to continue.');
      } else {
        setMessage('The meeting is already waiting for Olivia to provide a staffing plan.');
      }
    };

    const regenerateResponse = async () => {
      if (!olivia || !oliviaRole) {
        setMessage('Olivia or her role configuration is missing, so a recovery prompt cannot be generated.');
        return;
      }

      if (advancedPastStaffing) restartMeeting(room.id);
      setIsRegenerating(true);
      setMessage('Preparing Olivia’s staffing recovery prompt…');

      try {
        const prompt = buildOliviaStaffingRecoveryPrompt(olivia, oliviaRole, room.messages);
        await copyText(prompt);

        const chat = getExternalAgentChat(MEETING_FACILITATOR_AGENT_ID);
        if (!chat?.url) {
          setIsRegenerating(false);
          setMessage('Recovery prompt copied. Add Olivia’s external chat link in Meeting controls, then open that chat and paste the prompt.');
          return;
        }

        const openResult = await openOrFocusExternalChat(MEETING_FACILITATOR_AGENT_ID, chat.url);
        if (openResult === 'blocked') {
          setIsRegenerating(false);
          setMessage(`Recovery prompt copied, but ${chat.provider} could not be opened automatically. Open Olivia’s saved chat and paste the prompt manually.`);
          return;
        }

        setMessage(`Recovery prompt copied and Olivia’s ${chat.provider} chat opened. Send the prompt there. This warning will disappear automatically after a valid staffing response is added to the room.`);
      } catch {
        setIsRegenerating(false);
        setMessage('Could not prepare the regeneration prompt. Try again or use Dev → Export Debug Snapshot.');
      }
    };

    return (
      <section className="mx-3 mt-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-sm" aria-label="Olivia staffing plan missing">
        <div className="flex flex-wrap items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-500 text-lg text-white" aria-hidden="true">⚠</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">Waiting for Olivia to assemble the team</h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">Meeting paused</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-700">
              Olivia’s latest response was saved, but no valid staffing plan was detected. No specialists have been invited and the meeting will not advance until Olivia provides a staffing plan.
            </p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Use Regenerate Response to prepare the correct staffing request and open Olivia’s linked AI chat. The meeting stays paused until a valid VC_STAFFING_PLAN is added.
            </p>
            {advancedPastStaffing ? (
              <p className="mt-2 text-[11px] font-semibold text-rose-700">
                This room previously advanced past staffing without a valid plan. Regeneration will return it to staffing first.
              </p>
            ) : null}
            {message ? <p className="mt-2 text-[11px] font-medium text-amber-900" role="status">{message}</p> : null}
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <button
              type="button"
              onClick={() => void regenerateResponse()}
              disabled={isRegenerating}
              className="inline-flex min-w-[150px] items-center justify-center gap-2 rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-800 disabled:cursor-wait disabled:bg-amber-500"
            >
              {isRegenerating ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                  Regenerating…
                </>
              ) : 'Regenerate Response'}
            </button>
            {advancedPastStaffing ? (
              <button
                type="button"
                onClick={returnToStaffing}
                disabled={isRegenerating}
                className="rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
              >
                Return to Staffing
              </button>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  const readiness = deriveStaffingReadiness(room.id, plan);
  const applied = isOliviaStaffingPlanApplied(room.id, plan);
  const pendingApproval = !applied && !applyAttempted;
  const creatableHires = plan.hires.filter(hire => hire.type === 'ai-agent' || hire.type === 'temporary-specialist');
  const blockedHires = plan.hires.filter(hire => hire.type === 'human' || hire.type === 'contractor');
  const participants = plan.participants.map(participant => ({
    ...participant,
    name: agents.find(agent => agent.id === participant.agentId)?.name,
  })).filter(participant => Boolean(participant.name));
  const hasActionableStaffing = plan.participants.length > 0 || plan.hires.length > 0;
  // roundStage cycles back through 'opening' at the start of every round
  // (Round 2's opening, Round 3's opening, ...), not just once before the
  // meeting's first round -- hasMeetingStarted() is the one signal that
  // stays true for the rest of the meeting once it has actually begun.
  const meetingStarted = Boolean(meeting) && hasMeetingStarted(meeting!);
  const canStartAppliedPlan = applied
    && readiness.effectiveReadiness === 'TEAM_READY'
    && !meetingStarted;
  // Once the team is active and specialists have actually started
  // discussing, the full plan (participants, hires, rationale) has no more
  // decisions left to make. Leaving it expanded permanently pushed the
  // message list down for the rest of the meeting; collapse it to a small
  // summary pill instead, expandable again on click.
  const resolved = applied && readiness.effectiveReadiness === 'TEAM_READY' && meetingStarted;

  if (resolved && !manuallyExpanded) {
    const hireNames = creatableHires.map(hire => hire.agentName).join(', ');
    return (
      <section className="mx-3 mt-2" aria-label="Olivia meeting staffing plan">
        <button
          type="button"
          onClick={() => setManuallyExpanded(true)}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[11px] font-semibold text-teal-700 transition hover:bg-teal-100"
          title="Show the full staffing plan"
        >
          <span aria-hidden="true">🧭</span>
          <span className="truncate">{plan.teamName} active{hireNames ? ` · ${hireNames} hired` : ''}</span>
          <span className="shrink-0 text-teal-400" aria-hidden="true">▾</span>
        </button>
      </section>
    );
  }

  const applyPlan = () => {
    if (applied) {
      const advance = advanceAfterAgentResponse(room.id, MEETING_FACILITATOR_AGENT_ID);
      if (advance.advanced) {
        setMessage('Team is ready. Specialist discussion has started.');
      } else if (advance.reason === 'staffing-not-ready') {
        setMessage('The available team is active, but required staffing blockers still prevent the meeting from starting.');
      } else {
        setMessage('The team is active, but the meeting could not be started from the current state.');
      }
      return;
    }

    setApplyAttempted(true);
    const result = applyOliviaStaffingPlan(room.id, plan);
    if (!result) {
      setMessage('Could not invite this staffing plan to the room.');
      return;
    }

    const afterApply = deriveStaffingReadiness(room.id, plan);
    const hires = result.hiredAgentIds.length;
    const blockedNote = result.blockedHires.length > 0
      ? ` · ${result.blockedHires.length} role${result.blockedHires.length === 1 ? '' : 's'} still need${result.blockedHires.length === 1 ? 's' : ''} a human/contractor.`
      : '';
    const invitedNote = hires > 0
      ? `${result.teamName} invited · ${hires} specialist${hires === 1 ? '' : 's'} created.`
      : `${result.teamName} invited using existing company specialists.`;

    if (afterApply.effectiveReadiness === 'TEAM_READY') {
      const advance = advanceAfterAgentResponse(room.id, MEETING_FACILITATOR_AGENT_ID);
      if (advance.advanced) {
        setMessage(`${invitedNote} Specialist discussion has started.`);
        return;
      }
    }

    setMessage(`${invitedNote}${blockedNote} The meeting remains paused until required staffing is resolved.`);
  };

  const buttonDisabled = !hasActionableStaffing || (applied && !canStartAppliedPlan);
  const buttonLabel = !hasActionableStaffing
    ? 'Needs Clarification'
    : !applied
      ? 'Invite Team'
      : canStartAppliedPlan
        ? 'Start Meeting'
        : readiness.effectiveReadiness === 'TEAM_READY'
          ? '✓ Team Active'
          : '✓ Available Team Added';

  return (
    <section className="mx-3 mt-2 rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-3 shadow-sm" aria-label="Olivia meeting staffing plan">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-600 text-lg text-white" aria-hidden="true">🧭</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-sm font-bold text-slate-900">Olivia Staffing Plan</h3>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-700 ring-1 ring-teal-200">{plan.teamName}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${READINESS_CLASS[readiness.effectiveReadiness]}`}
              title={readiness.modelReadiness !== readiness.effectiveReadiness
                ? `Olivia reported ${READINESS_LABEL[readiness.modelReadiness]}; shown here is Virtual Company's own check of the room's actual state.`
                : undefined}
            >
              {READINESS_LABEL[readiness.effectiveReadiness]}
            </span>
            {resolved ? (
              <button
                type="button"
                onClick={() => setManuallyExpanded(false)}
                className="ms-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-teal-600 hover:bg-white hover:text-teal-800"
                title="Collapse to a summary"
              >
                ▴ Collapse
              </button>
            ) : null}
          </div>
          {plan.rationale ? <p className="mt-1 text-xs leading-5 text-slate-600">{plan.rationale}</p> : null}

          {readiness.blockers.length > 0 ? (
            <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5">
              <p className="text-[11px] font-bold text-amber-800">
                {pendingApproval
                  ? `${readiness.blockers.length} pending staffing action${readiness.blockers.length === 1 ? '' : 's'}`
                  : `${readiness.blockers.length} unresolved staffing blocker${readiness.blockers.length === 1 ? '' : 's'}`}
              </p>
              {pendingApproval ? (
                <p className="mt-1 text-[11px] leading-4 text-amber-700">
                  These are planned changes awaiting your approval, not failed operations. Review Olivia’s plan, then choose Invite Team.
                </p>
              ) : null}
              <ul className="mt-1 space-y-0.5">
                {readiness.blockers.map(blocker => (
                  <li
                    key={blocker.type === 'required-participant-missing' ? `p:${blocker.participantId}` : `h:${blocker.role}`}
                    className="text-[11px] text-amber-800"
                  >
                    • {describeStaffingAction(blocker, pendingApproval)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {participants.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {participants.map(participant => (
                <span
                  key={participant.agentId}
                  title={participant.reason}
                  className="rounded-md bg-white px-2 py-1 text-[11px] text-slate-600 ring-1 ring-slate-200"
                >
                  <strong className="text-slate-800">{participant.name}</strong>
                  <span className={`ms-1 ${participant.priority === 'required' ? 'text-teal-700' : 'text-slate-400'}`}>
                    {participant.priority === 'required' ? '· required' : '· optional'}
                  </span>
                </span>
              ))}
            </div>
          ) : null}

          {creatableHires.length > 0 ? (
            <div className="mt-2 grid gap-2 xl:grid-cols-2">
              {creatableHires.map(hire => (
                <div key={`${hire.agentName}:${hire.roleName}`} className="rounded-lg border border-amber-200 bg-white p-2.5">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true">{hire.emoji || '🧑‍💼'}</span>
                    <strong className="text-xs text-slate-900">{hire.agentName}</strong>
                    <span className="text-[10px] text-slate-400">{hire.roleName}</span>
                    <span className={`text-[9px] font-bold uppercase ${hire.priority === 'required' ? 'text-amber-700' : 'text-slate-400'}`}>
                      {hire.priority}
                    </span>
                  </div>
                  {hire.reason ? <p className="mt-1 text-[11px] text-slate-500">{hire.reason}</p> : null}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {hire.skills.map(skill => <span key={skill} className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600">{skill}</span>)}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {blockedHires.length > 0 ? (
            <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5">
              <p className="text-[11px] font-bold text-rose-800">Needs a human, not an AI agent — Invite Team will not create these:</p>
              <ul className="mt-1 space-y-1">
                {blockedHires.map(hire => (
                  <li key={`${hire.agentName}:${hire.roleName}`} className="text-[11px] text-rose-700">
                    <strong>{hire.roleName}</strong> ({hire.type}){hire.reason ? ` — ${hire.reason}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {message ? <p className="mt-2 text-[11px] font-medium text-teal-800" role="status">{message}</p> : null}
        </div>

        <button
          type="button"
          onClick={applyPlan}
          disabled={buttonDisabled}
          className="shrink-0 rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-default disabled:bg-emerald-100 disabled:text-emerald-700"
          title={!hasActionableStaffing
            ? 'Olivia needs more context before a team can be invited.'
            : !applied
              ? 'Invite existing specialists, create approved AI specialists, and add the team to this room.'
              : canStartAppliedPlan
                ? 'The team is ready; start specialist discussion.'
                : readiness.effectiveReadiness === 'TEAM_READY'
                  ? 'This staffing plan is already active in the room.'
                  : 'The available team is active, but required staffing blockers remain.'}
        >
          {buttonLabel}
        </button>
      </div>

      <div className="sr-only">
        {roles.length} roles and {teams.length} teams are available in the company directory.
      </div>
    </section>
  );
}
