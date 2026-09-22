import { useMemo, useState } from 'react';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import {
  applyOliviaStaffingPlan,
  findLatestOliviaStaffingPlan,
  isOliviaStaffingPlanApplied,
} from '@/lib/meetingStaffing';
import { useWorkspaceStore } from '@/store/workspaceStore';

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
  const existingNames = plan.existingAgentIds
    .map(id => agents.find(agent => agent.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  const applyPlan = () => {
    const result = applyOliviaStaffingPlan(room.id, plan);
    if (!result) {
      setMessage('Could not apply this staffing plan.');
      return;
    }
    const hires = result.hiredAgentIds.length;
    setMessage(
      hires > 0
        ? `${result.teamName} added to this room · ${hires} specialist${hires === 1 ? '' : 's'} created.`
        : `${result.teamName} added to this room using existing company specialists.`,
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
          </div>
          {plan.rationale ? <p className="mt-1 text-xs leading-5 text-slate-600">{plan.rationale}</p> : null}

          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            {existingNames.length > 0 ? (
              <span className="rounded-md bg-white px-2 py-1 text-slate-600 ring-1 ring-slate-200">
                Existing: <strong className="text-slate-800">{existingNames.join(', ')}</strong>
              </span>
            ) : null}
            <span className={`rounded-md px-2 py-1 ring-1 ${plan.hires.length > 0 ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
              {plan.hires.length > 0 ? `${plan.hires.length} new hire${plan.hires.length === 1 ? '' : 's'} required` : 'No new hires required'}
            </span>
          </div>

          {plan.hires.length > 0 ? (
            <div className="mt-2 grid gap-2 xl:grid-cols-2">
              {plan.hires.map(hire => (
                <div key={`${hire.agentName}:${hire.roleName}`} className="rounded-lg border border-amber-200 bg-white p-2.5">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true">{hire.emoji || '🧑‍💼'}</span>
                    <strong className="text-xs text-slate-900">{hire.agentName}</strong>
                    <span className="text-[10px] text-slate-400">{hire.roleName}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {hire.skills.map(skill => <span key={skill} className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600">{skill}</span>)}
                  </div>
                </div>
              ))}
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
