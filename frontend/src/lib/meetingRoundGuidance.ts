import type { MeetingRoomState } from '@/lib/meetingOrchestration';

export interface SpecialistRoundGuidance {
  purpose: string;
  instruction: string;
}

const ROUND_GUIDANCE: SpecialistRoundGuidance[] = [
  {
    purpose: 'Establish independent first-pass professional positions before the group anchors on one solution.',
    instruction: 'Give an independent analysis from your professional scope. State the evidence and assumptions you are relying on, the main risks or opportunities you see, and your initial recommendation. Do not merely echo another specialist.',
  },
  {
    purpose: 'Stress-test the first-pass positions and expose weak assumptions, conflicts, missing evidence, and execution risk.',
    instruction: 'Critique the prior contributions from your professional perspective. Challenge unsupported assumptions, identify contradictions or feasibility gaps, distinguish material risks from minor concerns, and say where you agree when the evidence supports it. Do not repeat your Round 1 answer unchanged.',
  },
  {
    purpose: 'Turn the critique into stronger, implementable proposals that address the material objections raised so far.',
    instruction: 'Produce a revised proposal from your professional scope that explicitly incorporates the relevant critique. State what changed, the trade-offs, dependencies, unresolved blockers, and concrete acceptance or validation criteria. Prefer an implementable revision over another abstract opinion.',
  },
  {
    purpose: 'Convert the discussion into a decision-ready professional position with explicit conditions and residual risk.',
    instruction: 'Give your final professional position on the meeting decision question. State whether the evidence supports proceeding, proceeding conditionally, or deferring from your specialty\'s perspective; list any required conditions, remaining blockers, and residual risks. Do not reopen settled issues without new evidence.',
  },
];

const FALLBACK_GUIDANCE: SpecialistRoundGuidance = {
  purpose: 'Advance the current meeting round toward its stated outcome without losing the specialist\'s professional scope.',
  instruction: 'Contribute only what materially advances the current round. Use prior discussion as evidence, make assumptions explicit, address unresolved objections, and finish with a concrete professional recommendation or deliverable.',
};

export function getSpecialistRoundGuidance(
  meeting: Pick<MeetingRoomState, 'roundIndex'>,
): SpecialistRoundGuidance {
  return ROUND_GUIDANCE[meeting.roundIndex] ?? FALLBACK_GUIDANCE;
}
