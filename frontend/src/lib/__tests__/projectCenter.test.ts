import { describe, expect, it } from 'vitest';
import { roomsForProject, roomsOutsideProject } from '@/lib/projectCenter';
import type { Room } from '@/types/domain';

function room(id: string, projectId: string): Room {
  return {
    id,
    name: id,
    emoji: '🏢',
    projectId,
    agentIds: [],
    teamIds: [],
    individualAgentIds: [],
    messages: [],
    createdAt: 1,
  };
}

describe('Project Center room membership', () => {
  const rooms = [room('alpha-room', 'alpha'), room('beta-room', 'beta'), room('alpha-room-2', 'alpha')];

  it('shows only rooms that belong to the selected project', () => {
    expect(roomsForProject(rooms, 'alpha').map(item => item.id)).toEqual(['alpha-room', 'alpha-room-2']);
  });

  it('separates rooms from other projects so they can be moved explicitly', () => {
    expect(roomsOutsideProject(rooms, 'alpha').map(item => item.id)).toEqual(['beta-room']);
  });
});
