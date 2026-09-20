import { describe, expect, it } from 'vitest';
import { getAgentRoomMembership } from '@/lib/roomMembership';
import type { Room, TeamDefinition } from '@/types/domain';

const teams: TeamDefinition[] = [
  {
    id: 'team-growth',
    name: 'Growth Team',
    description: '',
    emoji: '👥',
    agentIds: ['sarah', 'emma'],
    builtIn: false,
    createdAt: 1,
  },
];

function room(input: Partial<Room>): Room {
  return {
    id: 'room-1',
    name: 'Room',
    emoji: '💬',
    agentIds: [],
    messages: [],
    createdAt: 1,
    ...input,
  };
}

describe('getAgentRoomMembership', () => {
  it('reports no membership when the agent is absent', () => {
    expect(getAgentRoomMembership(room({}), 'sarah', teams).kind).toBe('none');
  });

  it('reports direct membership independently of teams', () => {
    const result = getAgentRoomMembership(room({
      agentIds: ['sarah'],
      individualAgentIds: ['sarah'],
      teamIds: [],
    }), 'sarah', teams);

    expect(result).toMatchObject({ kind: 'direct', present: true, direct: true, teamIds: [] });
  });

  it('reports team-only membership without pretending the agent is directly selected', () => {
    const result = getAgentRoomMembership(room({
      agentIds: ['sarah', 'emma'],
      individualAgentIds: [],
      teamIds: ['team-growth'],
    }), 'sarah', teams);

    expect(result).toMatchObject({
      kind: 'team',
      present: true,
      direct: false,
      teamIds: ['team-growth'],
      teamNames: ['Growth Team'],
    });
  });

  it('reports direct + team membership so removing direct membership does not imply removal from the room', () => {
    const result = getAgentRoomMembership(room({
      agentIds: ['sarah', 'emma'],
      individualAgentIds: ['sarah'],
      teamIds: ['team-growth'],
    }), 'sarah', teams);

    expect(result.kind).toBe('direct-and-team');
    expect(result.direct).toBe(true);
    expect(result.teamNames).toEqual(['Growth Team']);
  });

  it('handles legacy rooms without individualAgentIds', () => {
    expect(getAgentRoomMembership(room({ agentIds: ['sarah'], teamIds: [] }), 'sarah', teams).kind).toBe('direct');
    expect(getAgentRoomMembership(room({ agentIds: ['sarah', 'emma'], teamIds: ['team-growth'] }), 'sarah', teams).kind).toBe('team');
  });
});
