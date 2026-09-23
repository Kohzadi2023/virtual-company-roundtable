import { beforeEach, describe, expect, it } from 'vitest';
import { restoreWorkspaceExtensions } from '@/lib/workspaceExtensions';

const KEY = 'virtual-company:meeting-orchestration:v1';

describe('workspace extension meeting recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('sanitizes malformed meeting orchestration embedded in a v4 extension bundle', () => {
    expect(restoreWorkspaceExtensions({
      version: 1,
      meetingOrchestration: {
        rooms: {
          'room-a': {
            roomId: 'room-a',
            phase: 'collect',
            roundIndex: 2,
            speakerOrder: ['agent-olivia', 'agent-emma'],
            speakerStatus: null,
            rounds: null,
          },
        },
        chats: {},
      },
    })).toBe(true);

    const restored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as {
      rooms?: Record<string, {
        rounds?: string[];
        roundStage?: string;
        speakerStatus?: Record<string, string>;
      }>;
    };

    expect(restored.rooms?.['room-a']?.rounds).toHaveLength(4);
    expect(restored.rooms?.['room-a']?.roundStage).toBe('opening');
    expect(restored.rooms?.['room-a']?.speakerStatus).toEqual({
      'agent-olivia': 'waiting',
      'agent-emma': 'waiting',
    });
  });
});
