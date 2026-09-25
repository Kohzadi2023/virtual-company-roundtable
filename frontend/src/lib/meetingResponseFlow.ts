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
  | 'staffing-not-ready';

export interface MeetingResponseAdvanceResult {
  advanced: boolean;
  reason: MeetingResponseAdvanceReason;
  readiness?: StaffingReadinessResult;
}

/**
 * Advances the speaking queue after an agent response, with one authoritative
 * exception: Olivia cannot leave the opening stage until a staffing plan has
 * been detected, explicitly applied to the room, and independently verified
 * as TEAM_READY by the app.
 *
 * This keeps "Add Response" safe: Olivia's text can always be persisted for
 * audit/history, but an incomplete or malformed staffing response can no
 * longer silently move the meeting to synthesis before specialists exist.
 */
export function advanceAfterAgentResponse(roomId: string, agentId: string): MeetingResponseAdvanceResult {
  const state = useWorkspaceStore.getState();
  const room = state.rooms.find(item => item.id === roomId);
  if (!room) return { advanced: false, reason: 'room-missing' };

  const meeting = ensureMeetingRoom(room.id, room.agentIds);

  // The staffing gate is only for Olivia's very first turn, before the
  // meeting has ever started. roundStage cycles back to 'opening' at the
  // start of every round (not just round 1), so gating on roundStage alone
  // re-triggers the staffing check on every round's opening (rounds 2, 3, …)
  // and stalls the speaker queue there. hasMeetingStarted is the correct
  // "has this meeting actually begun" signal.
  if (agentId !== MEETING_FACILITATOR_AGENT_ID || meeting.roundStage !== 'opening' || hasMeetingStarted(meeting)) {
    markSpeakerStatus(room.id, agentId, 'responded');
    return { advanced: true, reason: 'advanced' };
  }

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
