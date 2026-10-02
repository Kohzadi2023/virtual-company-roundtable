import type { Room } from '@/types/domain';

export const STALE_ROOM_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Latest message time, falling back to when the room was created. */
export function lastActivityAt(room: Pick<Room, 'messages' | 'createdAt'>): number {
  let latest = room.createdAt;
  for (const message of room.messages) {
    if (message.createdAt > latest) latest = message.createdAt;
  }
  return latest;
}

export function daysSinceActivity(room: Pick<Room, 'messages' | 'createdAt'>, now: number): number {
  return Math.max(0, Math.floor((now - lastActivityAt(room)) / DAY_MS));
}

/**
 * A room is stale when real discussion started but nothing has happened for a
 * few days, so it is probably an unfinished thread the user forgot. Empty rooms
 * (never used), archived rooms and finished meetings are not nagged about.
 */
export function isRoomStale(
  room: Pick<Room, 'messages' | 'createdAt' | 'archivedAt'>,
  now: number,
  meetingClosed = false,
): boolean {
  if (room.archivedAt !== undefined || meetingClosed || room.messages.length === 0) return false;
  return now - lastActivityAt(room) >= STALE_ROOM_THRESHOLD_MS;
}
