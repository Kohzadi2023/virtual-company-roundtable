import type { Room } from '@/types/domain';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A room with no activity for this long is flagged as possibly forgotten -- follow-up meetings created from a decision checklist item are the main case, but this applies to any room. */
export const STALE_ROOM_THRESHOLD_MS = 3 * DAY_MS;

type StalenessInput = Pick<Room, 'messages' | 'createdAt' | 'archivedAt'>;

/** The last message's timestamp, or the room's own creation time if it never got one -- a room created and never discussed is itself a form of staleness. */
export function lastActivityAt(room: Pick<Room, 'messages' | 'createdAt'>): number {
  return room.messages[room.messages.length - 1]?.createdAt ?? room.createdAt;
}

export function daysSinceActivity(room: Pick<Room, 'messages' | 'createdAt'>, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - lastActivityAt(room)) / DAY_MS));
}

/** Archived rooms are already deliberately set aside, so they're never "stale" -- that label is for active rooms someone forgot about. */
export function isRoomStale(room: StalenessInput, now: number = Date.now()): boolean {
  if (room.archivedAt) return false;
  return now - lastActivityAt(room) > STALE_ROOM_THRESHOLD_MS;
}
