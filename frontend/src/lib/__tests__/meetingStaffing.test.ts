import { beforeEach, describe, expect, it } from 'vitest';
import { defaultAgents, defaultRoles, defaultTeams } from '@/lib/defaultCompany';
import {
  applyOliviaStaffingPlan,
  findLatestOliviaStaffingPlan,
  isOliviaStaffingPlanApplied,
  parseOliviaStaffingPlan,
} from '@/lib/meetingStaffing';
import { useWorkspaceStore } from '@/store/workspaceStore';

const staffingResponse = `I recommend a focused architecture review team.\n\nVC_STAFFING_PLAN\n\`\`\`json\n{
  "teamName": "Offline Sync Review",
  "teamDescription": "Architecture, risk, and mobile conflict review.",
  "existingAgentIds": ["agent-emma", "agent-mike"],
  "hires": [
    {
      "agentName": "Iris",
      "roleName": "Mobile Sync Specialist",
      "description": "Owns offline-first mobile synchronization and conflict semantics.",
      "skills": ["Offline-first", "Conflict Resolution", "Mobile Storage"],
      "systemPrompt": "Respond as the mobile sync specialist. Focus on offline queues, reconciliation, idempotency, and multi-device conflicts.",
      "emoji": "📱"
    }
  ],
  "rationale": "Emma and Mike cover architecture and challenge; mobile sync is the missing specialist capability."
}\n\`\`\``;

beforeEach(() => {
  useWorkspaceStore.setState({
    rooms: [{
      id: 'room-1',
      name: 'Offline Sync',
      emoji: '🏢',
      projectId: 'project-general',
      agentIds: ['agent-olivia'],
      teamIds: [],
      individualAgentIds: ['agent-olivia'],
      messages: [],
      createdAt: 1,
    }],
    activeRoomId: 'room-1',
    roles: defaultRoles.map(role => ({ ...role })),
    agents: defaultAgents.map(agent => ({ ...agent })),
    teams: defaultTeams.map(team => ({ ...team, agentIds: [...team.agentIds] })),
    projects: [],
    decisions: [],
    actionItems: [],
    agentContext: {},
    hydrated: true,
    syncState: 'idle',
  });
});

describe('Olivia meeting staffing', () => {
  it('parses the machine-readable staffing block', () => {
    const plan = parseOliviaStaffingPlan(staffingResponse);
    expect(plan?.teamName).toBe('Offline Sync Review');
    expect(plan?.existingAgentIds).toEqual(['agent-emma', 'agent-mike']);
    expect(plan?.hires).toHaveLength(1);
    expect(plan?.hires[0]?.skills).toContain('Conflict Resolution');
  });

  it('finds the latest Olivia plan and ignores other agents', () => {
    const plan = findLatestOliviaStaffingPlan([
      { authorType: 'agent', authorId: 'agent-emma', content: staffingResponse },
      { authorType: 'agent', authorId: 'agent-olivia', content: staffingResponse },
    ], 'agent-olivia');
    expect(plan?.teamName).toBe('Offline Sync Review');
  });

  it('creates a missing role and agent, builds the team, and adds it to the room', () => {
    const plan = parseOliviaStaffingPlan(staffingResponse)!;
    const result = applyOliviaStaffingPlan('room-1', plan);
    expect(result?.reusedAgentIds).toEqual(['agent-emma', 'agent-mike']);
    expect(result?.hiredAgentIds).toHaveLength(1);

    const state = useWorkspaceStore.getState();
    const role = state.roles.find(item => item.name === 'Mobile Sync Specialist');
    const hire = state.agents.find(item => item.name === 'Iris');
    const team = state.teams.find(item => item.name === 'Offline Sync Review');
    const room = state.rooms.find(item => item.id === 'room-1');

    expect(role).toBeTruthy();
    expect(hire?.roleId).toBe(role?.id);
    expect(team?.agentIds).toEqual(expect.arrayContaining(['agent-emma', 'agent-mike', hire!.id]));
    expect(room?.teamIds).toContain(team?.id);
    expect(room?.agentIds).toEqual(expect.arrayContaining(['agent-emma', 'agent-mike', hire!.id]));
    expect(isOliviaStaffingPlanApplied('room-1', plan)).toBe(true);
  });

  it('is idempotent when the same staffing plan is applied again', () => {
    const plan = parseOliviaStaffingPlan(staffingResponse)!;
    applyOliviaStaffingPlan('room-1', plan);
    const afterFirst = useWorkspaceStore.getState();
    const roleCount = afterFirst.roles.length;
    const agentCount = afterFirst.agents.length;
    const teamCount = afterFirst.teams.length;

    applyOliviaStaffingPlan('room-1', plan);
    const afterSecond = useWorkspaceStore.getState();

    expect(afterSecond.roles).toHaveLength(roleCount);
    expect(afterSecond.agents).toHaveLength(agentCount);
    expect(afterSecond.teams).toHaveLength(teamCount);
  });

  it('rejects content without a valid staffing block', () => {
    expect(parseOliviaStaffingPlan('No staffing JSON here.')).toBeNull();
    expect(parseOliviaStaffingPlan('VC_STAFFING_PLAN ```json {broken} ```')).toBeNull();
  });
});
