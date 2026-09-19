import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { useWorkspaceStore } from '@/store/workspaceStore';

/**
 * System invariant: every discussion room has the standing meeting facilitator.
 * The facilitator is intentionally not written into individualAgentIds because
 * that field represents user-selected specialists.
 */
export function ensureMeetingFacilitatorMembership(): void {
  const state = useWorkspaceStore.getState();
  if (!state.agents.some(agent => agent.id === MEETING_FACILITATOR_AGENT_ID)) return;
  if (state.rooms.every(room => room.agentIds.includes(MEETING_FACILITATOR_AGENT_ID))) return;

  useWorkspaceStore.setState(current => ({
    rooms: current.rooms.map(room => room.agentIds.includes(MEETING_FACILITATOR_AGENT_ID)
      ? room
      : { ...room, agentIds: [...room.agentIds, MEETING_FACILITATOR_AGENT_ID] }),
  }));
}

/** Add every current company specialist to a room as an explicit member. */
export function addAllCompanyToRoom(roomId: string): void {
  useWorkspaceStore.setState(state => {
    if (!state.rooms.some(room => room.id === roomId)) return state;
    const allAgentIds = state.agents.map(agent => agent.id);

    return {
      rooms: state.rooms.map(room => {
        if (room.id !== roomId) return room;
        return {
          ...room,
          individualAgentIds: Array.from(new Set([...(room.individualAgentIds ?? []), ...allAgentIds])),
          agentIds: Array.from(new Set([...room.agentIds, ...allAgentIds])),
        };
      }),
    };
  });
}
