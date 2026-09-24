import { useMemo, useState } from 'react';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { loadMeetingOrchestration, restartMeeting } from '@/lib/meetingOrchestration';
import { advanceAfterAgentResponse } from '@/lib/meetingResponseFlow';
import {
  applyOliviaStaffingPlan,
  deriveStaffingReadiness,
  findLatestOliviaStaffingPlan,
  isOliviaStaffingPlanApplied,
  type StaffingBlocker,
  type StaffingReadiness,
} from '@/lib/meetingStaffing';
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

function describeBlocker(blocker: StaffingBlocker): string {
  switch (blocker.type) {
    case 'required-participant-missing':
      return `${blocker.name ?? blocker.participantId} could not be added to the room.`;
    case 'required-ai-hire-failed':
      return `${blocker.role} could not be created.`;
    case 'human-staffing-required':
      return `Human ${blocker.hireType} required: ${blocker.role}.`;
  }
}

export function OliviaStaffingCard({ roomId }: { roomId: string }) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const agents = useWorkspaceStore(state => state.agents);
  const roles = useWorkspaceStore(state => state.roles);
  const teams = useWorkspaceStore(state => state.teams);
  const [message, setMessage] = useState('');

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
    const advancedPastStaffing = Boolean(meeting && meeting.roundStage !== 'opening');

    const returnToStaffing = () => {
      if (restartMeeting(room.id)) {
        setMessage('Meeting returned to the staffing stage. Request a fresh Olivia response before continuing.');
      } else {
        setMessage('The meeting is already waiting for Olivia to provide a staffing plan.');
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
              Olivia's latest response was saved, but no valid staffing plan was detected. No specialists have been invited and the meeting will not advance until Olivia provides a staffing plan.
            </p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Request a fresh Olivia response using the current room context, then add that response here again.
            </p>
            {advancedPastStaffing ? (
              <p className="mt-2 text-[11px] font-semibold text-rose-700">
                This room previously advanced past staffing without a valid plan. Return it to staffing before retrying Olivia.
              </p>
            ) : null}
            {message ? <p className="mt-2 text-[11px] font-medium text-amber-900" role="status">{message}</p> : null}
          </div>
          {advancedPastStaffing ? (
            <button
              type="button"
              onClick={returnToStaffing}
              className="shrink-0 rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-800"
            >
              Return to Staffing
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  const readiness = deriveStaffingReadiness(room.id, plan);
  const applied = isOliviaStaffingPlanApplied(room.id, plan);
  const creatableHires = plan.hires.filter(hire => hire.type === 'ai-agent' || hire.type === 'temporary-specialist');
  const blockedHires = plan.hires.filter(hire => hire.type === 'human' || hire.type === 'contractor');
  const participants = plan.participants.map(participant => ({
    ...participant,
    name: agents.find(agent => agent.id === participant.agentId)?.name,
  })).filter(participant => Boolean(participant.name));
  const hasActionableStaffing = plan.participants.length > 0 || plan.hires.length > 0;
  const canStartAppliedPlan = applied
    && readiness.effectiveReadiness === 'TEAM_READY'
    && meeting?.roundStage === 'opening';

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
          </div>
          {plan.rationale ? <p className="mt-1 text-xs leading-5 text-slate-600">{plan.rationale}</p> : null}

          {readiness.blockers.length > 0 ? (
            <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5">
              <p className="text-[11px] font-bold text-amber-800">
                {readiness.blockers.length} blocker{readiness.blockers.length === 1 ? '' : 's'}
              </p>
              <ul className="mt-1 space-y-0.5">
                {readiness.blockers.map(blocker => (
                  <li
                    key={blocker.type === 'required-participant-missing' ? `p:${blocker.participantId}` : `h:${blocker.role}`}
                    className="text-[11px] text-amber-800"
                  >
                    • {describeBlocker(blocker)}
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
