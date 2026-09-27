import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { loadMeetingOrchestration } from '@/lib/meetingOrchestration';
import {
  deriveStaffingReadiness,
  findLatestOliviaStaffingPlan,
  isOliviaStaffingPlanApplied,
} from '@/lib/meetingStaffing';
import type { Room } from '@/types/domain';

export type MeetingAttentionReason = 'staffing-plan-missing' | 'staffing-blocked';

export interface MeetingAttentionItem {
  roomId: string;
  roomName: string;
  reason: MeetingAttentionReason;
}

const REASON_LABEL: Record<MeetingAttentionReason, string> = {
  'staffing-plan-missing': 'No valid staffing plan detected',
  'staffing-blocked': 'Staffing blocker unresolved',
};

export function attentionReasonLabel(reason: MeetingAttentionReason): string {
  return REASON_LABEL[reason];
}

/**
 * Finds every active room genuinely stuck waiting on the user, using the
 * same signals OliviaStaffingCard already uses per-room (kept in sync with
 * it deliberately, rather than re-deriving a separate notion of "stuck") --
 * this just aggregates them across the whole workspace instead of only the
 * currently open room, so a paused meeting doesn't go unnoticed until
 * someone happens to open it.
 */
export function findRoomsNeedingAttention(rooms: readonly Room[]): MeetingAttentionItem[] {
  const orchestration = loadMeetingOrchestration();
  const items: MeetingAttentionItem[] = [];

  for (const room of rooms) {
    if (room.archivedAt) continue;
    if (!orchestration.rooms[room.id]) continue;

    const latestOliviaResponse = [...room.messages].reverse()
      .find(message => message.authorType === 'agent' && message.authorId === MEETING_FACILITATOR_AGENT_ID);
    if (!latestOliviaResponse) continue;

    const plan = findLatestOliviaStaffingPlan(room.messages, MEETING_FACILITATOR_AGENT_ID);
    if (!plan) {
      items.push({ roomId: room.id, roomName: room.name, reason: 'staffing-plan-missing' });
      continue;
    }

    if (!isOliviaStaffingPlanApplied(room.id, plan)) continue;
    const readiness = deriveStaffingReadiness(room.id, plan);
    if (readiness.effectiveReadiness !== 'TEAM_READY') {
      items.push({ roomId: room.id, roomName: room.name, reason: 'staffing-blocked' });
    }
  }

  return items;
}
