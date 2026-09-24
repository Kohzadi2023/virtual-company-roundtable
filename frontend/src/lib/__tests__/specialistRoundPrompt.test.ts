import { beforeEach, describe, expect, it } from 'vitest';
import { defaultAgents, defaultRoles, MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { ensureMeetingRoom, renameMeetingRound, setMeetingRound } from '@/lib/meetingOrchestration';
import { buildAgentPrompt } from '@/lib/promptBuilder';
import { useWorkspaceStore } from '@/store/workspaceStore';

describe('specialist meeting round prompts', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('injects the current round semantics into a non-facilitator prompt', () => {
    const olivia = defaultAgents.find(item => item.id === MEETING_FACILITATOR_AGENT_ID)!;
    const emma = defaultAgents.find(item => item.id === 'agent-emma')!;
    const emmaRole = defaultRoles.find(item => item.id === emma.roleId)!;

    useWorkspaceStore.setState({
      agents: [olivia, emma],
      roles: defaultRoles,
      teams: [],
      projects: [{ id: 'project-a', name: 'Project A', description: '', emoji: '📁', createdAt: 1 }],
      decisions: [],
      actionItems: [],
      rooms: [{
        id: 'room-a',
        name: 'Launch Review',
        emoji: '🚀',
        companyId: 'company-default',
        projectId: 'project-a',
        languageCode: 'en',
        agentIds: [olivia.id, emma.id],
        teamIds: [],
        individualAgentIds: [olivia.id, emma.id],
        messages: [],
        createdAt: 1,
      }],
      activeRoomId: 'room-a',
    });

    ensureMeetingRoom('room-a', [olivia.id, emma.id]);
    setMeetingRound('room-a', 2);

    const prompt = buildAgentPrompt(emma, emmaRole, []);

    expect(prompt).toContain('<MEETING_ROUND_INSTRUCTIONS>');
    expect(prompt).toContain('Round: 3/4 · Revised proposals');
    expect(prompt).toContain('Your task this round: Produce a revised proposal');
    expect(prompt).toContain('what changed');
    expect(prompt).toContain('acceptance or validation criteria');
    expect(prompt).toContain('Olivia is still opening this round');
  });

  it('keeps Round 3 semantics even if a developer renames its display label', () => {
    const olivia = defaultAgents.find(item => item.id === MEETING_FACILITATOR_AGENT_ID)!;
    const emma = defaultAgents.find(item => item.id === 'agent-emma')!;
    const emmaRole = defaultRoles.find(item => item.id === emma.roleId)!;

    useWorkspaceStore.setState({
      agents: [olivia, emma],
      roles: defaultRoles,
      teams: [],
      projects: [],
      decisions: [],
      actionItems: [],
      rooms: [{
        id: 'room-b',
        name: 'Architecture Decision',
        emoji: '🏗️',
        companyId: 'company-default',
        languageCode: 'en',
        agentIds: [olivia.id, emma.id],
        teamIds: [],
        individualAgentIds: [olivia.id, emma.id],
        messages: [],
        createdAt: 1,
      }],
      activeRoomId: 'room-b',
    });

    ensureMeetingRoom('room-b', [olivia.id, emma.id]);
    setMeetingRound('room-b', 2);
    renameMeetingRound('room-b', 2, 'Architecture convergence');

    const prompt = buildAgentPrompt(emma, emmaRole, []);

    expect(prompt).toContain('Round: 3/4 · Architecture convergence');
    expect(prompt).toContain('Produce a revised proposal');
    expect(prompt).toContain('incorporates the relevant critique');
  });
});
