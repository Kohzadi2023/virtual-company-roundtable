import { beforeEach, describe, expect, it } from 'vitest';
import { defaultAgents, defaultRoles, defaultTeams, MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { ensureMeetingRoom } from '@/lib/meetingOrchestration';
import { findRoomsNeedingAttention } from '@/lib/meetingAttention';
import { applyOliviaStaffingPlan } from '@/lib/meetingStaffing';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { Message, Room } from '@/types/domain';

const staffingResponse = `I assembled the team.\n\nVC_STAFFING_PLAN\n\`\`\`json\n{
  "teamName": "Launch Review Team",
  "teamDescription": "Minimum specialists needed for the decision.",
  "participants": [{ "agentId": "agent-emma", "priority": "required" }],
  "hires": [],
  "readiness": "TEAM_READY"
}\n\`\`\``;

const blockedStaffingResponse = `I assembled the team.\n\nVC_STAFFING_PLAN\n\`\`\`json\n{
  "teamName": "Canadian Launch Review",
  "teamDescription": "Launch and legal review.",
  "participants": [{ "agentId": "agent-emma", "priority": "required" }],
  "hires": [
    {
      "agentName": "Legal Counsel",
      "roleName": "Canadian Legal Counsel",
      "description": "Licensed legal review.",
      "skills": ["Canadian privacy law"],
      "systemPrompt": "Provide licensed legal review.",
      "priority": "required",
      "type": "human",
      "reason": "Requires a real licensed professional."
    }
  ],
  "readiness": "TEAM_READY"
}\n\`\`\``;

function oliviaMessage(content: string): Message {
  return {
    id: 'msg-olivia',
    authorType: 'agent',
    authorId: MEETING_FACILITATOR_AGENT_ID,
    authorNameSnapshot: 'Olivia',
    roleNameSnapshot: 'Meeting Facilitator',
    content,
    createdAt: 2,
  };
}

function room(id: string, overrides: Partial<Room> = {}): Room {
  return {
    id,
    name: id,
    emoji: '🏢',
    projectId: 'project-general',
    agentIds: [MEETING_FACILITATOR_AGENT_ID],
    teamIds: [],
    individualAgentIds: [MEETING_FACILITATOR_AGENT_ID],
    messages: [],
    createdAt: 1,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  useWorkspaceStore.setState({
    rooms: [],
    activeRoomId: null,
    roles: defaultRoles.map(item => ({ ...item })),
    agents: defaultAgents.map(item => ({ ...item })),
    teams: defaultTeams.map(item => ({ ...item, agentIds: [...item.agentIds] })),
    projects: [],
    decisions: [],
    actionItems: [],
    agentContext: {},
    hydrated: true,
    syncState: 'idle',
  });
});

describe('findRoomsNeedingAttention', () => {
  it('ignores a room Olivia has not responded in yet', () => {
    useWorkspaceStore.setState({ rooms: [room('r1')] });
    ensureMeetingRoom('r1', [MEETING_FACILITATOR_AGENT_ID]);

    expect(findRoomsNeedingAttention(useWorkspaceStore.getState().rooms)).toEqual([]);
  });

  it('flags a room whose latest Olivia response has no valid staffing plan', () => {
    useWorkspaceStore.setState({
      rooms: [room('r1', { messages: [oliviaMessage('I answered directly but forgot to staff the room.')] })],
    });
    ensureMeetingRoom('r1', [MEETING_FACILITATOR_AGENT_ID]);

    const found = findRoomsNeedingAttention(useWorkspaceStore.getState().rooms);
    expect(found).toEqual([{ roomId: 'r1', roomName: 'r1', reason: 'staffing-plan-missing' }]);
  });

  it('does not flag a plan that is still pending the user clicking Invite Team', () => {
    useWorkspaceStore.setState({
      rooms: [room('r1', { messages: [oliviaMessage(staffingResponse)] })],
    });
    ensureMeetingRoom('r1', [MEETING_FACILITATOR_AGENT_ID]);

    expect(findRoomsNeedingAttention(useWorkspaceStore.getState().rooms)).toEqual([]);
  });

  it('flags an applied plan that still has an unresolved blocker (e.g. a human hire)', () => {
    useWorkspaceStore.setState({
      rooms: [room('r1', { messages: [oliviaMessage(blockedStaffingResponse)] })],
    });
    ensureMeetingRoom('r1', [MEETING_FACILITATOR_AGENT_ID]);
    const plan = JSON.parse(blockedStaffingResponse.match(/```json\s*([\s\S]*?)```/)?.[1] ?? '{}');
    applyOliviaStaffingPlan('r1', {
      teamName: plan.teamName,
      teamDescription: plan.teamDescription,
      existingAgentIds: ['agent-emma'],
      participants: plan.participants,
      hires: plan.hires,
      readiness: plan.readiness,
    });

    const found = findRoomsNeedingAttention(useWorkspaceStore.getState().rooms);
    expect(found).toEqual([{ roomId: 'r1', roomName: 'r1', reason: 'staffing-blocked' }]);
  });

  it('does not flag an applied, fully-resolved plan', () => {
    useWorkspaceStore.setState({
      rooms: [room('r1', { messages: [oliviaMessage(staffingResponse)] })],
    });
    ensureMeetingRoom('r1', [MEETING_FACILITATOR_AGENT_ID]);
    applyOliviaStaffingPlan('r1', {
      teamName: 'Launch Review Team',
      teamDescription: 'Minimum specialists needed for the decision.',
      existingAgentIds: ['agent-emma'],
      participants: [{ agentId: 'agent-emma', priority: 'required' }],
      hires: [],
      readiness: 'TEAM_READY',
    });

    expect(findRoomsNeedingAttention(useWorkspaceStore.getState().rooms)).toEqual([]);
  });

  it('ignores an archived room', () => {
    useWorkspaceStore.setState({
      rooms: [room('r1', { archivedAt: Date.now(), messages: [oliviaMessage('No staffing plan here.')] })],
    });
    ensureMeetingRoom('r1', [MEETING_FACILITATOR_AGENT_ID]);

    expect(findRoomsNeedingAttention(useWorkspaceStore.getState().rooms)).toEqual([]);
  });
});
