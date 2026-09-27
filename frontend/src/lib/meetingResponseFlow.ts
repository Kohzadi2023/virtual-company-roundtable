import { findLatestDecisionProposal } from '@/lib/decisionVoting';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { ensureMeetingRoom, hasMeetingStarted, markSpeakerStatus } from '@/lib/meetingOrchestration';
import {
  deriveStaffingReadiness,
  findLatestOliviaStaffingPlan,
  isOliviaStaffingPlanApplied,
  type StaffingReadinessResult,
} from '@/lib/meetingStaffing';
import { useWorkspaceStore } from '@/store/workspaceStore';

export type MeetingResponseAdvanceReason =
  | 'advanced'
  | 'room-missing'
  | 'staffing-plan-missing'
  | 'staffing-plan-pending-approval'
  | 'staffing-not-ready'
  | 'decision-proposal-missing';

export interface MeetingResponseAdvanceResult {
  advanced: boolean;
  reason: MeetingResponseAdvanceReason;
  readiness?: StaffingReadinessResult;
}

/**
 * Advances the speaking queue after an agent response, with two authoritative
 * exceptions:
 *
 * 1. Olivia cannot leave the opening stage of round 1 until a staffing plan
 *    has been detected, explicitly applied to the room, and independently
 *    verified as TEAM_READY by the app.
 * 2. Olivia cannot leave the opening stage of the FINAL round until a valid
 *    VC_DECISION_PROPOSAL has been detected. The prompt (see
 *    finalDecisionWorkflowInstruction in contextModes.ts) already tells her
 *    this response must end with that block, but nothing previously verified
 *    compliance -- a model that answered in prose only still silently
 *    advanced the round, so a meeting could run all four rounds and report
 *    "ready" without ever creating a DecisionRecord: no checklist, no vote
 *    card, and nothing for a decision follow-up meeting to attach to.
 *
 * This keeps "Add Response" safe: Olivia's text can always be persisted for
 * audit/history, but an incomplete or malformed response at either of these
 * two checkpoints can no longer silently move the meeting forward.
 */
export function advanceAfterAgentResponse(roomId: string, agentId: string): MeetingResponseAdvanceResult {
  const state = useWorkspaceStore.getState();
  const room = state.rooms.find(item => item.id === roomId);
  if (!room) return { advanced: false, reason: 'room-missing' };

  const meeting = ensureMeetingRoom(room.id, room.agentIds);
  const isOliviaOpeningTurn = agentId === MEETING_FACILITATOR_AGENT_ID && meeting.roundStage === 'opening';

  // The staffing gate is only for Olivia's very first turn, before the
  // meeting has ever started. roundStage cycles back to 'opening' at the
  // start of every round (not just round 1), so gating on roundStage alone
  // re-triggers the staffing check on every round's opening (rounds 2, 3, …)
  // and stalls the speaker queue there. hasMeetingStarted is the correct
  // "has this meeting actually begun" signal.
  if (isOliviaOpeningTurn && !hasMeetingStarted(meeting)) {
    const plan = findLatestOliviaStaffingPlan(room.messages, MEETING_FACILITATOR_AGENT_ID);
    if (!plan) {
      return { advanced: false, reason: 'staffing-plan-missing' };
    }

    if (!isOliviaStaffingPlanApplied(room.id, plan)) {
      return { advanced: false, reason: 'staffing-plan-pending-approval' };
    }

    const readiness = deriveStaffingReadiness(room.id, plan);
    if (readiness.effectiveReadiness !== 'TEAM_READY') {
      return { advanced: false, reason: 'staffing-not-ready', readiness };
    }

    markSpeakerStatus(room.id, agentId, 'responded');
    return { advanced: true, reason: 'advanced', readiness };
  }

  const isFinalRound = meeting.roundIndex >= meeting.rounds.length - 1;
  if (isOliviaOpeningTurn && isFinalRound && !findLatestDecisionProposal(room.messages)) {
    return { advanced: false, reason: 'decision-proposal-missing' };
  }

  markSpeakerStatus(room.id, agentId, 'responded');
  return { advanced: true, reason: 'advanced' };
}
