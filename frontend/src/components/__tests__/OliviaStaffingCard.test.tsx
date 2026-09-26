import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { OliviaStaffingCard } from '@/components/OliviaStaffingCard';
import { defaultAgents, defaultRoles, defaultTeams, MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { useWorkspaceStore } from '@/store/workspaceStore';

const staffingResponse = `Team recommendation.\n\nVC_STAFFING_PLAN\n\`\`\`json\n{
  "teamName": "Voice Delivery Review",
  "teamDescription": "Architecture and channel integration review.",
  "participants": [
    {
      "agentId": "agent-emma",
      "priority": "required",
      "reason": "Owns architecture direction.",
      "expectedContribution": "Integration architecture."
    }
  ],
  "hires": [
    {
      "agentName": "Evan",
      "roleName": "Voice AI & Messaging Integrations Specialist",
      "description": "Owns voice AI, telephony and provider messaging integrations.",
      "skills": ["SIP/PSTN", "WhatsApp Business API", "Telegram Bot API"],
      "systemPrompt": "Focus on telephony and provider-specific messaging integration architecture.",
      "priority": "required",
      "type": "ai-agent",
      "reason": "No current specialist owns this capability.",
      "expectedContribution": "Voice and messaging integration design."
    }
  ],
  "readiness": "STAFFING_ACTION_REQUIRED"
}\n\`\`\``;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useWorkspaceStore.setState({
    rooms: [{
      id: 'room-voice',
      name: 'Voice Integration Review',
      emoji: '🏢',
      projectId: 'project-general',
      agentIds: [MEETING_FACILITATOR_AGENT_ID],
      teamIds: [],
      individualAgentIds: [MEETING_FACILITATOR_AGENT_ID],
      messages: [{
        id: 'message-olivia',
        authorType: 'agent',
        authorId: MEETING_FACILITATOR_AGENT_ID,
        authorNameSnapshot: 'Olivia',
        roleNameSnapshot: 'Operations Manager',
        content: staffingResponse,
        createdAt: 1,
      }],
      createdAt: 1,
    }],
    activeRoomId: 'room-voice',
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

describe('OliviaStaffingCard', () => {
  it('describes required pre-approval changes as pending actions rather than failed operations', () => {
    const html = renderToStaticMarkup(<OliviaStaffingCard roomId="room-voice" />);

    expect(html).toContain('2 pending staffing actions');
    expect(html).toContain('These are planned changes awaiting your approval, not failed operations.');
    expect(html).toContain('Emma will be added to the room when you approve Invite Team.');
    expect(html).toContain('Voice AI &amp; Messaging Integrations Specialist will be created and added to the room when you approve Invite Team.');
    expect(html).not.toContain('could not be added to the room');
    expect(html).not.toContain('could not be created');
  });
});
