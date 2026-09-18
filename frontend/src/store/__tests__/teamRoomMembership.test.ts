import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkspaceStore } from '@/store/workspaceStore';

function reset(): void {
  useWorkspaceStore.setState({
    rooms: [],
    activeRoomId: null,
    roles: [],
    agents: [],
    teams: [],
    agentContext: {},
    hydrated: true,
    syncState: 'idle',
  });
  useWorkspaceStore.getState().seedDefaultCompany();
}

describe('room team membership', () => {
  beforeEach(reset);

  it('can add and remove a whole team from a room', () => {
    const state = useWorkspaceStore.getState();
    const roomId = state.rooms[0]!.id;
    const team = state.teams.find(item => item.id === 'team-sales-growth')!;

    useWorkspaceStore.getState().addTeamToRoom(roomId, team.id);
    let room = useWorkspaceStore.getState().rooms.find(item => item.id === roomId)!;
    expect(room.teamIds).toContain(team.id);
    expect(room.agentIds).toEqual(expect.arrayContaining(team.agentIds));

    useWorkspaceStore.getState().removeTeamFromRoom(roomId, team.id);
    room = useWorkspaceStore.getState().rooms.find(item => item.id === roomId)!;
    expect(room.teamIds).not.toContain(team.id);
    for (const agentId of team.agentIds) expect(room.agentIds).not.toContain(agentId);
  });

  it('keeps a specialist who was also added individually when the team is removed', () => {
    const state = useWorkspaceStore.getState();
    const roomId = state.rooms[0]!.id;
    const team = state.teams.find(item => item.id === 'team-product-engineering')!;
    const emma = state.agents.find(agent => agent.id === 'agent-emma')!;

    useWorkspaceStore.getState().toggleAgentInRoom(roomId, emma.id);
    useWorkspaceStore.getState().addTeamToRoom(roomId, team.id);
    useWorkspaceStore.getState().removeTeamFromRoom(roomId, team.id);

    const room = useWorkspaceStore.getState().rooms.find(item => item.id === roomId)!;
    expect(room.teamIds).not.toContain(team.id);
    expect(room.individualAgentIds).toContain(emma.id);
    expect(room.agentIds).toContain(emma.id);
    for (const agentId of team.agentIds.filter(id => id !== emma.id)) {
      expect(room.agentIds).not.toContain(agentId);
    }
  });

  it('keeps shared specialists while another selected team still supplies them', () => {
    const state = useWorkspaceStore.getState();
    const roomId = state.rooms[0]!.id;
    const product = state.teams.find(item => item.id === 'team-product-engineering')!;
    const production = state.teams.find(item => item.id === 'team-production-operations')!;
    const david = state.agents.find(agent => agent.id === 'agent-david')!;

    useWorkspaceStore.getState().addTeamToRoom(roomId, product.id);
    useWorkspaceStore.getState().addTeamToRoom(roomId, production.id);
    useWorkspaceStore.getState().removeTeamFromRoom(roomId, product.id);

    const room = useWorkspaceStore.getState().rooms.find(item => item.id === roomId)!;
    expect(room.teamIds).not.toContain(product.id);
    expect(room.teamIds).toContain(production.id);
    expect(room.agentIds).toContain(david.id);
  });

  it('creates a room with tracked initial team membership', () => {
    const state = useWorkspaceStore.getState();
    const team = state.teams.find(item => item.id === 'team-legal-finance')!;
    const roomId = useWorkspaceStore.getState().createRoom('Legal review', '⚖️', [], [team.id]);
    const room = useWorkspaceStore.getState().rooms.find(item => item.id === roomId)!;

    expect(room.teamIds).toEqual([team.id]);
    expect(room.individualAgentIds).toEqual([]);
    expect(room.agentIds).toEqual(expect.arrayContaining(team.agentIds));
  });
});
