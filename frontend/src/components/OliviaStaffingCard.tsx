import { useMemo, useState } from 'react';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import {
  applyOliviaStaffingPlan,
  findLatestOliviaStaffingPlan,
  isOliviaStaffingPlanApplied,
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

  if (!room || !plan) return null;

  const applied = isOliviaStaffingPlanApplied(room.id, plan);
  const creatableHires = plan.hires.filter(hire => hire.type === 'ai-agent' || hire.type === 'temporary-specialist');
  const blockedHires = plan.hires.filter(hire => hire.type === 'human' || hire.type === 'contractor');
  const participants = plan.participants.map(participant => ({
    ...participant,
    name: agents.find(agent => agent.id === participant.agentId)?.name,
  })).filter(participant => Boolean(participant.name));

  const applyPlan = () => {
    const result = applyOliviaStaffingPlan(room.id, plan);
    if (!result) {
      setMessage('Could not apply this staffing plan.');
      return;
    }
    const hires = result.hiredAgentIds.length;
    const blockedNote = result.blockedHires.length > 0
      ? ` · ${result.blockedHires.length} role${result.blockedHires.length === 1 ? '' : 's'} still need${result.blockedHires.length === 1 ? 's' : ''} a human/contractor.`
      : '';
    setMessage(
      (hires > 0
        ? `${result.teamName} added to this room · ${hires} specialist${hires === 1 ? '' : 's'} created.`
        : `${result.teamName} added to this room using existing company specialists.`) + blockedNote,
    );
  };

  return (
    <section className="mx-3 mt-2 rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-3 shadow-sm" aria-label="Olivia meeting staffing plan">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-600 text-lg text-white" aria-hidden="true">🧭</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-sm font-bold text-slate-900">Olivia Staffing Plan</h3>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-700 ring-1 ring-teal-200">{plan.teamName}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${READINESS_CLASS[plan.readiness]}`}>
              {READINESS_LABEL[plan.readiness]}
            </span>
          </div>
          {plan.rationale ? <p className="mt-1 text-xs leading-5 text-slate-600">{plan.rationale}</p> : null}

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
              <p className="text-[11px] font-bold text-rose-800">Needs a human, not an AI agent — Apply will not create these:</p>
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
          disabled={applied}
          className="shrink-0 rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-default disabled:bg-emerald-100 disabled:text-emerald-700"
          title={applied ? 'This staffing plan is already active in the room.' : 'Create missing specialists, build the team, and add it to this room.'}
        >
          {applied ? '✓ Team Active' : 'Apply Staffing Plan'}
        </button>
      </div>

      <div className="sr-only">
        {roles.length} roles and {teams.length} teams are available in the company directory.
      </div>
    </section>
  );
}
