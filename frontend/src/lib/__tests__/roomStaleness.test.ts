import { describe, expect, it } from 'vitest';
import { daysSinceActivity, isRoomStale, lastActivityAt, STALE_ROOM_THRESHOLD_MS } from '@/lib/roomStaleness';
import type { Room } from '@/types/domain';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 10_000 * DAY_MS;

function room(overrides: Partial<Room> = {}): Room {
  return { id: 'r1', name: 'Room', emoji: '🏢', agentIds: [], messages: [], createdAt: NOW, ...overrides };
}

describe('lastActivityAt', () => {
  it('uses the last message timestamp when messages exist', () => {
    const r = room({
      createdAt: NOW - 10 * DAY_MS,
      messages: [
        { id: 'm1', authorType: 'user', content: 'a', createdAt: NOW - 5 * DAY_MS },
        { id: 'm2', authorType: 'user', content: 'b', createdAt: NOW - 1 * DAY_MS },
      ],
    });
    expect(lastActivityAt(r)).toBe(NOW - 1 * DAY_MS);
  });

  it('falls back to createdAt for a room with no messages', () => {
    expect(lastActivityAt(room({ createdAt: NOW - 2 * DAY_MS, messages: [] }))).toBe(NOW - 2 * DAY_MS);
  });
});

describe('daysSinceActivity', () => {
  it('floors to whole days', () => {
    const r = room({ createdAt: NOW - (2 * DAY_MS + DAY_MS / 2) });
    expect(daysSinceActivity(r, NOW)).toBe(2);
  });

  it('never returns a negative number for a room active in the future', () => {
    expect(daysSinceActivity(room({ createdAt: NOW + DAY_MS }), NOW)).toBe(0);
  });
});

describe('isRoomStale', () => {
  it('is false just under the threshold', () => {
    const r = room({ createdAt: NOW - (STALE_ROOM_THRESHOLD_MS - 1000) });
    expect(isRoomStale(r, NOW)).toBe(false);
  });

  it('is true just over the threshold', () => {
    const r = room({ createdAt: NOW - (STALE_ROOM_THRESHOLD_MS + 1000) });
    expect(isRoomStale(r, NOW)).toBe(true);
  });

  it('is always false for an archived room, no matter how old', () => {
    const r = room({ createdAt: NOW - 30 * DAY_MS, archivedAt: NOW - 29 * DAY_MS });
    expect(isRoomStale(r, NOW)).toBe(false);
  });

  it('is false for a room with a recent message even if it is old', () => {
    const r = room({
      createdAt: NOW - 30 * DAY_MS,
      messages: [{ id: 'm1', authorType: 'user', content: 'hi', createdAt: NOW - DAY_MS }],
    });
    expect(isRoomStale(r, NOW)).toBe(false);
  });
});
