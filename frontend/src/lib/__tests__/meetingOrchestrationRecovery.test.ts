import { beforeEach, describe, expect, it } from 'vitest';
import {
  normalizeMeetingOrchestrationValue,
  repairMeetingOrchestrationStorage,
} from '@/lib/meetingOrchestrationRecovery';

const KEY = 'virtual-company:meeting-orchestration:v1';

describe('meeting orchestration persisted-state recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('repairs a legacy room missing rounds, status entries and round stage', () => {
    const normalized = normalizeMeetingOrchestrationValue({
      rooms: {
        'room-a': {
          roomId: 'room-a',
          phase: 'collect',
          roundIndex: 99,
          speakerOrder: ['agent-olivia', 'agent-emma'],
          speakerStatus: { 'agent-olivia': 'responded' },
          activeSpeakerId: 'missing-agent',
        },
      },
      chats: {},
    });

    const room = normalized.rooms['room-a'];
    expect(room?.rounds).toEqual(['Initial opinions', 'Critique', 'Revised proposals', 'Final decision']);
    expect(room?.roundIndex).toBe(3);
    expect(room?.roundStage).toBe('specialists');
    expect(room?.speakerStatus).toEqual({
      'agent-olivia': 'responded',
      'agent-emma': 'waiting',
    });
    expect(room?.activeSpeakerId).toBe('agent-emma');
  });

  it('drops malformed chats and normalizes malformed room containers instead of throwing', () => {
    const normalized = normalizeMeetingOrchestrationValue({
      rooms: { 'room-b': null },
      chats: {
        'agent-emma': null,
        'agent-mike': { url: 'https://example.com/chat', updatedAt: 'bad' },
      },
    });

    expect(normalized.rooms['room-b']?.rounds).toHaveLength(4);
    expect(normalized.rooms['room-b']?.speakerOrder).toEqual([]);
    expect(normalized.chats['agent-emma']).toBeUndefined();
    expect(normalized.chats['agent-mike']?.url).toBe('https://example.com/chat');
    expect(normalized.chats['agent-mike']?.updatedAt).toEqual(expect.any(Number));
  });

  it('repairs the stored value in place and resets invalid JSON to a safe empty state', () => {
    localStorage.setItem(KEY, JSON.stringify({
      rooms: {
        room: {
          roundIndex: 1,
          speakerOrder: ['agent-olivia'],
          speakerStatus: {},
        },
      },
      chats: {},
    }));

    expect(repairMeetingOrchestrationStorage()).toBe(true);
    const repaired = JSON.parse(localStorage.getItem(KEY) ?? '{}') as {
      rooms?: Record<string, { rounds?: string[]; roundStage?: string }>;
    };
    expect(repaired.rooms?.room?.rounds).toHaveLength(4);
    expect(repaired.rooms?.room?.roundStage).toBe('opening');

    localStorage.setItem(KEY, '{not-json');
    expect(repairMeetingOrchestrationStorage()).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}')).toEqual({ rooms: {}, chats: {} });
  });
});
