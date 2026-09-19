import { beforeEach, describe, expect, it } from 'vitest';
import { saveRoomMeetingMinutes } from '@/lib/roomActions';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { Room } from '@/types/domain';

function sampleRoom(): Room {
  return {
    id: 'room-1',
    name: 'Review Room',
    emoji: '🏢',
    languageCode: 'en',
    agentIds: [],
    teamIds: [],
    individualAgentIds: [],
    messages: [
      { id: 'm1', authorType: 'user', content: 'First message', createdAt: 1 },
      { id: 'm2', authorType: 'user', content: 'Second message', createdAt: 2 },
    ],
    createdAt: 1,
  };
}

describe('saved room meeting minutes', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ rooms: [sampleRoom()], activeRoomId: 'room-1' });
  });

  it('stores final manual minutes with source metadata on the room', () => {
    saveRoomMeetingMinutes('room-1', '# Final Meeting Minutes');

    const saved = useWorkspaceStore.getState().rooms[0]?.meetingMinutes;
    expect(saved?.content).toBe('# Final Meeting Minutes');
    expect(saved?.source).toBe('manual-ai');
    expect(saved?.sourceMessageCount).toBe(2);
    expect(saved?.languageCode).toBe('en');
    expect(saved?.savedAt).toBeGreaterThan(0);
  });

  it('removes the saved minutes when the pasted result is cleared', () => {
    saveRoomMeetingMinutes('room-1', '# Final Meeting Minutes');
    saveRoomMeetingMinutes('room-1', '   ');

    expect(useWorkspaceStore.getState().rooms[0]?.meetingMinutes).toBeUndefined();
  });
});
