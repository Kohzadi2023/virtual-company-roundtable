import { beforeEach, describe, expect, it } from 'vitest';
import { defaultAgents, defaultRoles, defaultTeams } from '@/lib/defaultCompany';
import { buildDebugSnapshot } from '@/lib/devDebugSnapshot';
import { useWorkspaceStore } from '@/store/workspaceStore';

beforeEach(() => {
  localStorage.clear();
  useWorkspaceStore.setState({
    rooms: [{
      id: 'room-debug',
      name: 'Investment Review',
      emoji: '🏢',
      projectId: 'project-general',
      agentIds: ['agent-olivia'],
      teamIds: [],
      individualAgentIds: ['agent-olivia'],
      messages: [
        {
          id: 'message-user',
          authorType: 'user',
          content: 'How should I invest $5,000?',
          createdAt: 10,
        },
        {
          id: 'message-olivia',
          authorType: 'agent',
          authorId: 'agent-olivia',
          authorNameSnapshot: 'Olivia',
          roleNameSnapshot: 'Meeting Facilitator',
          content: 'The meeting brief is now set, but this response contains no staffing block.',
          createdAt: 20,
        },
      ],
      createdAt: 1,
    }],
    activeRoomId: 'room-debug',
    roles: defaultRoles.map(role => ({ ...role })),
    agents: defaultAgents.map(agent => ({ ...agent })),
    teams: defaultTeams.map(team => ({ ...team, agentIds: [...team.agentIds] })),
    projects: [],
    decisions: [],
    actionItems: [],
    agentContext: {},
    hydrated: true,
    syncState: 'saved',
  });

  localStorage.setItem('virtual-company:meeting-orchestration:v1', JSON.stringify({
    rooms: {
      'room-debug': {
        roomId: 'room-debug',
        phase: 'collect',
        rounds: ['Initial opinions', 'Critique', 'Revised proposals', 'Final decision'],
        roundIndex: 0,
        roundStage: 'synthesis',
        speakerOrder: ['agent-olivia'],
        speakerStatus: { 'agent-olivia': 'waiting' },
        activeSpeakerId: 'agent-olivia',
        updatedAt: 30,
      },
    },
    chats: {},
  }));
  localStorage.setItem('secret-token', 'do-not-export-me');
});

describe('developer debug snapshot', () => {
  it('captures the active room, orchestration, and missing Olivia staffing state without dumping unrelated storage', () => {
    const file = buildDebugSnapshot('room-debug');
    const jsonStart = file.text.indexOf('{');
    const snapshot = JSON.parse(file.text.slice(jsonStart));

    expect(file.filename).toMatch(/^virtual-company-debug-investment-review-.*\.txt$/);
    expect(snapshot.activeRoom.id).toBe('room-debug');
    expect(snapshot.activeRoom.messages[1].content).toContain('no staffing block');
    expect(snapshot.meetingOrchestration.roundStage).toBe('synthesis');
    expect(snapshot.staffing.latestOliviaMessageId).toBe('message-olivia');
    expect(snapshot.staffing.latestOliviaMessageContainsStaffingMarker).toBe(false);
    expect(snapshot.staffing.planParsed).toBe(false);
    expect(snapshot.storage.keys.some((entry: { key: string }) => entry.key === 'virtual-company:meeting-orchestration:v1')).toBe(true);
    expect(file.text).not.toContain('secret-token');
    expect(file.text).not.toContain('do-not-export-me');
  });
});
