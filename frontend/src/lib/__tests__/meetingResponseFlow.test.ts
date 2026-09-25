import { beforeEach, describe, expect, it } from 'vitest';
import { defaultAgents, defaultRoles, defaultTeams, MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { ensureMeetingRoom, loadMeetingOrchestration, setMeetingRound } from '@/lib/meetingOrchestration';
import { advanceAfterAgentResponse } from '@/lib/meetingResponseFlow';
import { applyOliviaStaffingPlan, findLatestOliviaStaffingPlan } from '@/lib/meetingStaffing';
import { useWorkspaceStore } from '@/store/workspaceStore';

const staffingResponse = `I assembled the minimum team.\n\nVC_STAFFING_PLAN\n\`\`\`json\n{
  "teamName": "Launch Review Team",
  "teamDescription": "Minimum specialists needed for the decision.",
  "participants": [
    { "agentId": "agent-emma", "priority": "required", "reason": "Architecture is required.", "expectedContribution": "Architecture decision." }
  ],
  "hires": [],
  "readiness": "STAFFING_ACTION_REQUIRED",
  "rationale": "Emma is required before discussion starts."
}\n\`\`\``;

const falseReadyWithHumanBlocker = `I assembled the team.\n\nVC_STAFFING_PLAN\n\`\`\`json\n{
  "teamName": "Canadian Launch Review",
  "teamDescription": "Launch and legal review.",
  "participants": [
    { "agentId": "agent-emma", "priority": "required" }
  ],
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

function setOliviaMessage(content: string) {
  useWorkspaceStore.setState(state => ({
    rooms: state.rooms.map(room => room.id === 'room-1'
      ? {
          ...room,
          messages: [{
            id: 'msg-olivia',
            authorType: 'agent' as const,
            authorId: MEETING_FACILITATOR_AGENT_ID,
            authorNameSnapshot: 'Olivia',
            roleNameSnapshot: 'Meeting Facilitator',
            content,
            createdAt: 2,
          }],
        }
      : room),
  }));
}

beforeEach(() => {
  localStorage.clear();
  useWorkspaceStore.setState({
    rooms: [{
      id: 'room-1',
      name: 'Launch Review',
      emoji: '🏢',
      projectId: 'project-general',
      agentIds: [MEETING_FACILITATOR_AGENT_ID],
      teamIds: [],
      individualAgentIds: [MEETING_FACILITATOR_AGENT_ID],
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
  ensureMeetingRoom('room-1', [MEETING_FACILITATOR_AGENT_ID]);
});

describe('Olivia opening staffing gate', () => {
  it('keeps the meeting in opening when Olivia response has no staffing plan', () => {
    setOliviaMessage('I answered the topic directly but forgot to assemble the team.');

    const result = advanceAfterAgentResponse('room-1', MEETING_FACILITATOR_AGENT_ID);
    const meeting = loadMeetingOrchestration().rooms['room-1'];

    expect(result).toEqual({ advanced: false, reason: 'staffing-plan-missing' });
    expect(meeting?.roundStage).toBe('opening');
    expect(meeting?.phase).toBe('open');
    expect(meeting?.speakerStatus[MEETING_FACILITATOR_AGENT_ID]).toBe('waiting');
  });

  it('does not advance until the detected staffing plan is explicitly applied', () => {
    setOliviaMessage(staffingResponse);

    const result = advanceAfterAgentResponse('room-1', MEETING_FACILITATOR_AGENT_ID);
    const meeting = loadMeetingOrchestration().rooms['room-1'];

    expect(result.reason).toBe('staffing-plan-pending-approval');
    expect(result.advanced).toBe(false);
    expect(meeting?.roundStage).toBe('opening');
  });

  it('advances to the first specialist after Invite Team resolves required staffing', () => {
    setOliviaMessage(staffingResponse);
    const room = useWorkspaceStore.getState().rooms.find(item => item.id === 'room-1')!;
    const plan = findLatestOliviaStaffingPlan(room.messages, MEETING_FACILITATOR_AGENT_ID)!;

    const applied = applyOliviaStaffingPlan('room-1', plan);
    expect(applied?.reusedAgentIds).toContain('agent-emma');
    expect(useWorkspaceStore.getState().rooms.find(item => item.id === 'room-1')?.agentIds).toContain('agent-emma');

    const result = advanceAfterAgentResponse('room-1', MEETING_FACILITATOR_AGENT_ID);
    const meeting = loadMeetingOrchestration().rooms['room-1'];

    expect(result.advanced).toBe(true);
    expect(result.reason).toBe('advanced');
    expect(meeting?.phase).toBe('collect');
    expect(meeting?.roundStage).toBe('specialists');
    expect(meeting?.activeSpeakerId).toBe('agent-emma');
    expect(meeting?.speakerStatus[MEETING_FACILITATOR_AGENT_ID]).toBe('responded');
  });

  it('cannot bypass a required human blocker even when Olivia reports TEAM_READY', () => {
    setOliviaMessage(falseReadyWithHumanBlocker);
    const room = useWorkspaceStore.getState().rooms.find(item => item.id === 'room-1')!;
    const plan = findLatestOliviaStaffingPlan(room.messages, MEETING_FACILITATOR_AGENT_ID)!;

    const applied = applyOliviaStaffingPlan('room-1', plan);
    expect(applied?.blockedHires).toHaveLength(1);

    const result = advanceAfterAgentResponse('room-1', MEETING_FACILITATOR_AGENT_ID);
    const meeting = loadMeetingOrchestration().rooms['room-1'];

    expect(result.advanced).toBe(false);
    expect(result.reason).toBe('staffing-not-ready');
    expect(result.readiness?.modelReadiness).toBe('TEAM_READY');
    expect(result.readiness?.effectiveReadiness).toBe('STAFFING_ACTION_REQUIRED');
    expect(result.readiness?.blockers).toEqual([
      { type: 'human-staffing-required', role: 'Canadian Legal Counsel', hireType: 'human' },
    ]);
    expect(meeting?.roundStage).toBe('opening');
  });

  it('advances Olivia normally when a later round reopens, without re-requiring a staffing plan', () => {
    setMeetingRound('room-1', 1);
    setOliviaMessage('Opening round 2: recapping where we left off and what this round must resolve.');

    const result = advanceAfterAgentResponse('room-1', MEETING_FACILITATOR_AGENT_ID);
    const meeting = loadMeetingOrchestration().rooms['room-1'];

    expect(result).toEqual({ advanced: true, reason: 'advanced' });
    expect(meeting?.roundIndex).toBe(1);
    // No specialists in this room, so the queue moves straight to synthesis —
    // the key assertion is `advanced: true`, proving the round-2 opening gate
    // did not stall the queue waiting for a staffing plan that was already
    // resolved before round 1 started.
    expect(meeting?.roundStage).toBe('synthesis');
  });
});
