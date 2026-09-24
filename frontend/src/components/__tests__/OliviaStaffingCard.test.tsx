import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { OliviaStaffingCard } from '@/components/OliviaStaffingCard';
import { defaultAgents, defaultRoles, defaultTeams, MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { ensureMeetingRoom, loadMeetingOrchestration, markSpeakerStatus } from '@/lib/meetingOrchestration';
import { useWorkspaceStore } from '@/store/workspaceStore';

beforeEach(() => {
  localStorage.clear();
  useWorkspaceStore.setState({
    rooms: [{
      id: 'room-1',
      name: 'Investment Review',
      emoji: '🏢',
      projectId: 'project-general',
      agentIds: [MEETING_FACILITATOR_AGENT_ID],
      teamIds: [],
      individualAgentIds: [MEETING_FACILITATOR_AGENT_ID],
      messages: [{
        id: 'msg-1',
        authorType: 'agent',
        authorId: MEETING_FACILITATOR_AGENT_ID,
        authorNameSnapshot: 'Olivia',
        roleNameSnapshot: 'Meeting Facilitator',
        content: 'The meeting brief is now set, but this response has no staffing block.',
        createdAt: 2,
      }],
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
  ensureMeetingRoom('room-1', [MEETING_FACILITATOR_AGENT_ID]);
});

describe('OliviaStaffingCard missing-plan recovery', () => {
  it('shows an explicit paused staffing state when Olivia response has no plan', () => {
    const html = renderToStaticMarkup(<OliviaStaffingCard roomId="room-1" />);

    expect(html).toContain('Waiting for Olivia to assemble the team');
    expect(html).toContain('Meeting paused');
    expect(html).not.toContain('Invite Team');
  });

  it('offers recovery when a legacy room already advanced to synthesis without a plan', () => {
    // Reproduce the old bug by calling the low-level queue primitive directly.
    markSpeakerStatus('room-1', MEETING_FACILITATOR_AGENT_ID, 'responded');
    expect(loadMeetingOrchestration().rooms['room-1']?.roundStage).toBe('synthesis');

    const html = renderToStaticMarkup(<OliviaStaffingCard roomId="room-1" />);

    expect(html).toContain('Return to Staffing');
    expect(html).toContain('previously advanced past staffing without a valid plan');
  });
});
