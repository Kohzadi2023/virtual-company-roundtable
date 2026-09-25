import { beforeEach, describe, expect, it } from 'vitest';
import {
  decisionEvidenceForMessage,
  decisionVoteIdForMessage,
  parseOliviaDecisionProposal,
  parseSpecialistDecisionVote,
  syncDecisionVoting,
} from '@/lib/decisionVoting';
import { useWorkspaceStore } from '@/store/workspaceStore';

const proposalContent = `Final proposal\n\nVC_DECISION_PROPOSAL\n\`\`\`json\n{\n  "title": "Genesisco Canadian Production Launch Decision",\n  "outcome": "NO_GO",\n  "details": "Do not launch until Phase Zero evidence is complete.",\n  "checklist": [\n    { "item": "Phase Zero evidence complete", "status": "blocker", "evidence": "Missing production proof" },\n    { "item": "Scope freeze agreed", "status": "satisfied", "evidence": "Accepted in Round 3" }\n  ],\n  "voteQuestion": "Do you support this NO-GO decision as written?"\n}\n\`\`\``;

const voteContent = `I support the decision with the stated blocker.\n\nVC_DECISION_VOTE\n\`\`\`json\n{\n  "choice": "agree",\n  "rationale": "The production evidence is not sufficient for launch.",\n  "conditions": []\n}\n\`\`\``;

describe('decision voting workflow', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useWorkspaceStore.setState({
      projects: [{ id: 'project-a', name: 'Project A', description: '', emoji: '📁', createdAt: 1 }],
      rooms: [{
        id: 'room-a',
        name: 'Launch Review',
        emoji: '🚀',
        projectId: 'project-a',
        agentIds: ['agent-olivia', 'agent-emma'],
        individualAgentIds: ['agent-olivia', 'agent-emma'],
        teamIds: [],
        messages: [
          { id: 'm-proposal', authorType: 'agent', authorId: 'agent-olivia', authorNameSnapshot: 'Olivia', content: proposalContent, createdAt: 10 },
          { id: 'm-vote', authorType: 'agent', authorId: 'agent-emma', authorNameSnapshot: 'Emma', content: voteContent, createdAt: 20 },
        ],
        createdAt: 1,
      }],
      decisions: [],
      actionItems: [],
      agents: [],
      roles: [],
      teams: [],
      activeRoomId: 'room-a',
      agentContext: {},
    });
  });

  it('parses Olivia proposal and specialist vote blocks', () => {
    const proposal = parseOliviaDecisionProposal(proposalContent);
    const vote = parseSpecialistDecisionVote(voteContent);

    expect(proposal?.outcome).toBe('NO_GO');
    expect(proposal?.checklist).toHaveLength(2);
    expect(proposal?.checklist[0]?.status).toBe('blocker');
    expect(vote).toEqual({
      choice: 'agree',
      rationale: 'The production evidence is not sufficient for launch.',
      conditions: [],
    });
  });

  it('creates a proposed room decision and captures specialist votes idempotently', () => {
    syncDecisionVoting('room-a');
    syncDecisionVoting('room-a');

    const state = useWorkspaceStore.getState();
    const decision = state.decisions.find(item => item.evidence === decisionEvidenceForMessage('m-proposal'));
    const room = state.rooms.find(item => item.id === 'room-a');
    const vote = room?.votes?.find(item => item.id === decisionVoteIdForMessage('m-proposal'));

    expect(state.decisions.filter(item => item.evidence === decisionEvidenceForMessage('m-proposal'))).toHaveLength(1);
    expect(decision?.status).toBe('proposed');
    expect(decision?.title).toBe('Genesisco Canadian Production Launch Decision');
    expect(vote?.votes['agent-emma']).toBe('agree');
  });
});
