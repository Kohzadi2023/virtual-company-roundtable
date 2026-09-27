import { beforeEach, describe, expect, it } from 'vitest';
import { defaultAgents, defaultRoles, MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { ensureMeetingRoom, setMeetingBrief, setMeetingRound } from '@/lib/meetingOrchestration';
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
    expect(oliviaPrompt).toContain('<MEETING_CONTEXT>');
    expect(oliviaPrompt).toContain('Choose the persistence architecture.');
    expect(oliviaPrompt).toContain('Should v4 snapshot persistence be canonical?');
    expect(oliviaPrompt).toContain('Decision readiness: READY');
    expect(oliviaPrompt).toContain('Do not answer for them.');
    expect(oliviaPrompt).toContain('<MEETING_STAFFING_RULES>');
    expect(oliviaPrompt).toContain('<CURRENT_PARTICIPANTS>');
    expect(oliviaPrompt).toContain('<AVAILABLE_ORGANIZATION_ROSTER>');
    expect(oliviaPrompt).toContain('agent-emma: Emma — Software Architect');
    expect(oliviaPrompt).toContain('VC_STAFFING_PLAN');
    expect(oliviaPrompt).toContain('Never hire a new person for a skill that an existing specialist already covers adequately.');

    const emmaPrompt = buildAgentPrompt(emma, emmaRole, []);
    expect(emmaPrompt).not.toContain('<MEETING_CONTEXT>');
    expect(emmaPrompt).not.toContain('<MEETING_STAFFING_RULES>');
    expect(emmaPrompt).not.toContain('VC_STAFFING_PLAN');
    // Emma is already in the room here, alongside Olivia — the solo
    // bootstrap framing below must never leak into a non-solo meeting.
    expect(oliviaPrompt).not.toContain('YOU ARE CURRENTLY THE ONLY PARTICIPANT');
  });

  it('reframes Olivia as team assembler only when she is the sole room participant', () => {
    const olivia = defaultAgents.find(item => item.id === MEETING_FACILITATOR_AGENT_ID)!;
    const oliviaRole = defaultRoles.find(item => item.id === olivia.roleId)!;

    useWorkspaceStore.setState({
      agents: defaultAgents,
      roles: defaultRoles,
      projects: [{ id: 'project-a', name: 'Project A', description: '', emoji: '📁', createdAt: 1 }],
      decisions: [],
      actionItems: [],
      rooms: [{
        id: 'room-solo',
        name: 'New Meeting',
        emoji: '🏢',
        companyId: 'company-default',
        projectId: 'project-a',
        languageCode: 'en',
        agentIds: [olivia.id],
        teamIds: [],
        individualAgentIds: [olivia.id],
        messages: [],
        createdAt: 1,
      }],
      activeRoomId: 'room-solo',
    });

    ensureMeetingRoom('room-solo', [olivia.id]);
    const oliviaPrompt = buildAgentPrompt(olivia, oliviaRole, []);

    expect(oliviaPrompt).toContain('YOU ARE CURRENTLY THE ONLY PARTICIPANT IN THIS MEETING.');
    expect(oliviaPrompt).toContain('Your first responsibility this turn is NOT to answer the meeting question yourself.');
    expect(oliviaPrompt).toContain('"participants"');
    expect(oliviaPrompt).toContain('"readiness": "TEAM_READY"');
  });

  it('marks the room boundary and stops the revise loop once the final vote has consensus', () => {
    const olivia = defaultAgents.find(item => item.id === MEETING_FACILITATOR_AGENT_ID)!;
    const emma = defaultAgents.find(item => item.id === 'agent-emma')!;
    const ryan = defaultAgents.find(item => item.id === 'agent-ryan')!;
    const oliviaRole = defaultRoles.find(item => item.id === olivia.roleId)!;
    const proposal = 'VC_DECISION_PROPOSAL\n```json\n{"title":"Launch","outcome":"NO_GO","details":"Hold.","checklist":[{"item":"Evidence","status":"blocker"}],"voteQuestion":"Support?"}\n```';
    const vote = (choice: string) => `VC_DECISION_VOTE\n\`\`\`json\n{"choice":"${choice}","rationale":"r","conditions":[]}\n\`\`\``;
    const baseRoom = {
      id: 'room-final',
      name: 'Launch Decision',
      emoji: '🚀',
      companyId: 'company-default',
      projectId: 'project-a',
      languageCode: 'en',
      agentIds: [olivia.id, emma.id, ryan.id],
      teamIds: [],
      individualAgentIds: [olivia.id, emma.id, ryan.id],
      createdAt: 1,
    };
    const messages = [
      { id: 'p', authorType: 'agent' as const, authorId: olivia.id, authorNameSnapshot: 'Olivia', content: proposal, createdAt: 1 },
      { id: 'v1', authorType: 'agent' as const, authorId: emma.id, authorNameSnapshot: 'Emma', content: vote('agree'), createdAt: 2 },
      { id: 'v2', authorType: 'agent' as const, authorId: ryan.id, authorNameSnapshot: 'Ryan', content: vote('concern'), createdAt: 3 },
    ];
    useWorkspaceStore.setState({
      agents: defaultAgents,
      roles: defaultRoles,
      projects: [{ id: 'project-a', name: 'Project A', description: '', emoji: '📁', createdAt: 1 }],
      decisions: [],
      actionItems: [],
      rooms: [{
        ...baseRoom,
        messages,
        votes: [{ id: 'vc-decision-vote:p', question: 'Support?', votes: { [emma.id]: 'agree', [ryan.id]: 'concern' }, createdAt: 4 }],
      }],
      activeRoomId: 'room-final',
    });
    ensureMeetingRoom('room-final', baseRoom.agentIds);
    setMeetingRound('room-final', 3);

    const prompt = buildAgentPrompt(olivia, oliviaRole, []);
    expect(prompt).toContain('<ROOM_SCOPE>');
    expect(prompt).toContain('Active room: "Launch Decision" (room id room-final).');
    expect(prompt).toContain('<CONSENSUS_REACHED>');
    expect(prompt).toContain('(1 agree, 1 concern, 0 abstain)');

    // A user request after the vote (e.g. "revise anyway") takes precedence.
    useWorkspaceStore.setState(state => ({
      rooms: state.rooms.map(room => ({ ...room, messages: [...room.messages, { id: 'u', authorType: 'user' as const, content: 'Revise it anyway.', createdAt: 5 }] })),
    }));
    expect(buildAgentPrompt(olivia, oliviaRole, [])).not.toContain('<CONSENSUS_REACHED>');
  });
});
