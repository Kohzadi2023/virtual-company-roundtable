import { beforeEach, describe, expect, it } from 'vitest';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { addAllCompanyToRoom, ensureMeetingFacilitatorMembership } from '@/lib/roomMembershipActions';
import { useWorkspaceStore } from '@/store/workspaceStore';

function reset(): void {
  useWorkspaceStore.setState({
    rooms: [],
    activeRoomId: null,
    roles: [],
    agents: [],
    teams: [],
    projects: [],
    decisions: [],
    actionItems: [],
    agentContext: {},
    hydrated: true,
    syncState: 'idle',
  });
  useWorkspaceStore.getState().seedDefaultCompany();
}

describe('room membership actions', () => {
  beforeEach(reset);

  it('ensures the standing facilitator is present in every room', () => {
    const secondRoomId = useWorkspaceStore.getState().createRoom('Second room');
    ensureMeetingFacilitatorMembership();

    const state = useWorkspaceStore.getState();
    expect(state.rooms).toHaveLength(2);
    for (const room of state.rooms) {
      expect(room.agentIds).toContain(MEETING_FACILITATOR_AGENT_ID);
    }
    expect(state.rooms.find(room => room.id === secondRoomId)?.agentIds).toContain(MEETING_FACILITATOR_AGENT_ID);
  });

  it('adds every company member to a selected room', () => {
    const state = useWorkspaceStore.getState();
    const roomId = state.rooms[0]!.id;

    addAllCompanyToRoom(roomId);

    const current = useWorkspaceStore.getState();
    const room = current.rooms.find(item => item.id === roomId)!;
    expect(room.agentIds).toHaveLength(current.agents.length);
    expect(room.individualAgentIds).toHaveLength(current.agents.length);
    expect(room.agentIds).toEqual(expect.arrayContaining(current.agents.map(agent => agent.id)));
  });
});
