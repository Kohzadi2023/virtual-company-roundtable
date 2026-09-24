import { beforeEach, describe, expect, it } from 'vitest';
import { defaultAgents, defaultRoles, MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { ensureMeetingRoom } from '@/lib/meetingOrchestration';
import { buildOliviaStaffingRecoveryPrompt } from '@/lib/oliviaRegeneration';
import { useWorkspaceStore } from '@/store/workspaceStore';

describe('Olivia staffing recovery prompt', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('uses current room context and explicitly requires the missing staffing plan', () => {
    const olivia = defaultAgents.find(item => item.id === MEETING_FACILITATOR_AGENT_ID)!;
    const role = defaultRoles.find(item => item.id === olivia.roleId)!;
    const messages = [{
      id: 'msg-user',
      authorType: 'user' as const,
      content: 'Assess whether we are ready to launch in Canada.',
      createdAt: 1,
    }];

    useWorkspaceStore.setState({
      agents: defaultAgents,
      roles: defaultRoles,
      projects: [{ id: 'project-a', name: 'Launch', description: '', emoji: '📁', createdAt: 1 }],
      decisions: [],
      actionItems: [],
      rooms: [{
        id: 'room-a',
        name: 'Canadian Launch Review',
        emoji: '🏢',
        companyId: 'company-default',
        projectId: 'project-a',
        languageCode: 'en',
        agentIds: [olivia.id],
        teamIds: [],
        individualAgentIds: [olivia.id],
        messages,
        createdAt: 1,
      }],
      activeRoomId: 'room-a',
    });

    ensureMeetingRoom('room-a', [olivia.id]);
    const prompt = buildOliviaStaffingRecoveryPrompt(olivia, role, messages);

    expect(prompt).toContain('Canadian Launch Review');
    expect(prompt).toContain('Assess whether we are ready to launch in Canada.');
    expect(prompt).toContain('<STAFFING_RECOVERY_INSTRUCTION>');
    expect(prompt).toContain('Provide the missing staffing plan');
    expect(prompt).toContain('VC_STAFFING_PLAN');
    expect(prompt).toContain('Do not answer the meeting topic itself.');
  });
});
