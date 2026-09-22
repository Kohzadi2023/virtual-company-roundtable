import { beforeEach, describe, expect, it } from 'vitest';
import { defaultAgents, defaultRoles, MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { ensureMeetingRoom, setMeetingBrief } from '@/lib/meetingOrchestration';
import { buildAgentPrompt } from '@/lib/promptBuilder';
import { useWorkspaceStore } from '@/store/workspaceStore';

describe('Olivia meeting prompt', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('injects meeting readiness and a company staffing roster only for Olivia', () => {
    const olivia = defaultAgents.find(item => item.id === MEETING_FACILITATOR_AGENT_ID)!;
    const emma = defaultAgents.find(item => item.id === 'agent-emma')!;
    const oliviaRole = defaultRoles.find(item => item.id === olivia.roleId)!;
    const emmaRole = defaultRoles.find(item => item.id === emma.roleId)!;

    useWorkspaceStore.setState({
      agents: defaultAgents,
      roles: defaultRoles,
      projects: [{ id: 'project-a', name: 'Project A', description: '', emoji: '📁', createdAt: 1 }],
      decisions: [],
      actionItems: [],
      rooms: [{
        id: 'room-a',
        name: 'Architecture Decision',
        emoji: '🏗️',
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
    setMeetingBrief('room-a', {
      objective: 'Choose the persistence architecture.',
      expectedOutcome: 'An approved decision with explicit follow-up actions.',
      decisionQuestion: 'Should v4 snapshot persistence be canonical?',
    });

    const oliviaPrompt = buildAgentPrompt(olivia, oliviaRole, []);
    expect(oliviaPrompt).toContain('MEETING FACILITATION STATE');
    expect(oliviaPrompt).toContain('Choose the persistence architecture.');
    expect(oliviaPrompt).toContain('Should v4 snapshot persistence be canonical?');
    expect(oliviaPrompt).toContain('Decision readiness: READY');
    expect(oliviaPrompt).toContain('Do not answer for them.');
    expect(oliviaPrompt).toContain('MEETING STAFFING');
    expect(oliviaPrompt).toContain('COMPANY ROSTER');
    expect(oliviaPrompt).toContain('agent-emma: Emma — Software Architect');
    expect(oliviaPrompt).toContain('VC_STAFFING_PLAN');
    expect(oliviaPrompt).toContain('Never hire a new person for a skill that an existing specialist already covers adequately.');

    const emmaPrompt = buildAgentPrompt(emma, emmaRole, []);
    expect(emmaPrompt).not.toContain('MEETING FACILITATION STATE');
    expect(emmaPrompt).not.toContain('MEETING STAFFING');
    expect(emmaPrompt).not.toContain('VC_STAFFING_PLAN');
  });
});
