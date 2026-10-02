import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadMeetingOrchestration,
  saveMeetingOrchestration,
  type MeetingOrchestrationState,
} from '@/lib/meetingOrchestration';

const KEY = 'virtual-company:meeting-orchestration:v1';
const FALLBACK_KEY = 'virtual-company:meeting-orchestration:overflow:v1';

function meetingState(roomId: string): MeetingOrchestrationState {
  return {
    rooms: {
      [roomId]: {
        roomId,
        phase: 'open',
        rounds: ['Initial opinions', 'Critique', 'Revised proposals', 'Final decision'],
        roundIndex: 0,
        roundStage: 'opening',
        speakerOrder: ['agent-olivia'],
        speakerStatus: { 'agent-olivia': 'waiting' },
        objective: 'Keep the meeting usable when browser storage is full.',
        updatedAt: 1,
      },
    },
    chats: {},
  };
}

describe('meeting orchestration quota resilience', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // A successful save clears the module-level overflow cache so this file
    // cannot leak quota fallback state into another test.
    saveMeetingOrchestration({ rooms: {}, chats: {} });
    localStorage.clear();
    sessionStorage.clear();
  });

  it('does not throw and keeps the newest state readable when the dedicated localStorage key is full', () => {
    // In some Windows/Vitest/jsdom combinations, window.localStorage does not
    // dispatch through the global Storage.prototype object. Spy on the actual
    // prototype backing this localStorage instance so the quota simulation is
    // portable across environments.
    const storagePrototype = Object.getPrototypeOf(localStorage) as Storage;
    const originalSetItem = storagePrototype.setItem;
    vi.spyOn(storagePrototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (this === localStorage && key === KEY) {
        throw new DOMException('storage full', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });

    const state = meetingState('room-quota');

    expect(() => saveMeetingOrchestration(state)).not.toThrow();
    expect(loadMeetingOrchestration().rooms['room-quota']?.objective).toContain('storage is full');
    expect(sessionStorage.getItem(FALLBACK_KEY)).toContain('room-quota');
  });

  it('returns to durable localStorage and removes the session fallback after quota pressure clears', () => {
    const storagePrototype = Object.getPrototypeOf(localStorage) as Storage;
    const originalSetItem = storagePrototype.setItem;
    let blockMeetingWrites = true;
    vi.spyOn(storagePrototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (this === localStorage && key === KEY && blockMeetingWrites) {
        throw new DOMException('storage full', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });

    saveMeetingOrchestration(meetingState('room-recovered'));
    expect(sessionStorage.getItem(FALLBACK_KEY)).toContain('room-recovered');

    blockMeetingWrites = false;
    const recovered = meetingState('room-recovered');
    recovered.rooms['room-recovered']!.phase = 'collect';
    saveMeetingOrchestration(recovered);

    expect(sessionStorage.getItem(FALLBACK_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}').rooms['room-recovered'].phase).toBe('collect');
    expect(loadMeetingOrchestration().rooms['room-recovered']?.phase).toBe('collect');
  });
});
