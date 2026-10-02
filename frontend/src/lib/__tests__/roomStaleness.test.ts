import { describe, expect, it } from 'vitest';
import { daysSinceActivity, isRoomStale, lastActivityAt, STALE_ROOM_THRESHOLD_MS } from '@/lib/roomStaleness';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;

const message = (createdAt: number) => ({
  id: `m${createdAt}`,
  authorType: 'user' as const,
  content: 'hi',
  createdAt,
});

describe('roomStaleness', () => {
  it('uses the newest message, not the last one in the array', () => {
    const room = { createdAt: 1, messages: [message(50 * DAY), message(10 * DAY)] };
    expect(lastActivityAt(room)).toBe(50 * DAY);
  });

  it('falls back to creation time for a room with no messages', () => {
    expect(lastActivityAt({ createdAt: 7, messages: [] })).toBe(7);
  });

  it('flags a used room once the threshold has passed, not before', () => {
    const justUnder = { createdAt: 1, messages: [message(NOW - STALE_ROOM_THRESHOLD_MS + 1)] };
    const exactly = { createdAt: 1, messages: [message(NOW - STALE_ROOM_THRESHOLD_MS)] };
    expect(isRoomStale(justUnder, NOW)).toBe(false);
    expect(isRoomStale(exactly, NOW)).toBe(true);
  });

  it('never flags empty, archived or finished rooms', () => {
    const old = { createdAt: 1, messages: [message(1)] };
    expect(isRoomStale({ createdAt: 1, messages: [] }, NOW)).toBe(false);
    expect(isRoomStale({ ...old, archivedAt: 5 }, NOW)).toBe(false);
    expect(isRoomStale(old, NOW, true)).toBe(false);
    expect(isRoomStale(old, NOW)).toBe(true);
  });

  it('counts whole days and never goes negative for clock skew', () => {
    expect(daysSinceActivity({ createdAt: 1, messages: [message(NOW - 4.9 * DAY)] }, NOW)).toBe(4);
    expect(daysSinceActivity({ createdAt: 1, messages: [message(NOW + DAY)] }, NOW)).toBe(0);
  });
});
