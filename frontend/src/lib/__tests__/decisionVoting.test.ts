import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildChecklistFollowUpRoomName,
  buildChecklistFollowUpSeedMessage,
  decisionEvidenceForMessage,
  decisionVoteIdForMessage,
  findChecklistFollowUp,
  parseOliviaDecisionProposal,
  parseSpecialistDecisionVote,
  syncDecisionVoting,
} from '@/lib/decisionVoting';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { ActionItem } from '@/types/domain';

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

describe('checklist item follow-up', () => {
  const actionItems: ActionItem[] = [{
    id: 'action-1',
    projectId: 'project-a',
    roomId: 'room-followup',
    sourceDecisionId: 'decision-1',
    title: 'Phase Zero evidence complete',
    status: 'in-progress',
    priority: 'high',
    createdAt: 1,
    updatedAt: 1,
  }];

  it('finds an existing follow-up action item for a checklist item', () => {
    expect(findChecklistFollowUp(actionItems, 'decision-1', 'Phase Zero evidence complete')).toBe(actionItems[0]);
    expect(findChecklistFollowUp(actionItems, 'decision-1', 'Some other item')).toBeUndefined();
    expect(findChecklistFollowUp(actionItems, 'decision-2', 'Phase Zero evidence complete')).toBeUndefined();
  });

  it('builds a follow-up room name, truncating long checklist item text', () => {
    expect(buildChecklistFollowUpRoomName('Scope freeze agreed')).toBe('Follow-up: Scope freeze agreed');

    const longItem = 'A'.repeat(80);
    const name = buildChecklistFollowUpRoomName(longItem);
    expect(name.startsWith('Follow-up: ')).toBe(true);
    expect(name.length).toBeLessThan(80);
    expect(name.endsWith('…')).toBe(true);
  });

  it('builds a seed message referencing the decision and checklist item', () => {
    const message = buildChecklistFollowUpSeedMessage(
      'Genesisco Canadian Production Launch Decision',
      'NO_GO',
      'Phase Zero evidence complete',
      'Missing production proof',
    );

    expect(message).toContain('Genesisco Canadian Production Launch Decision');
    expect(message).toContain('NO GO');
    expect(message).toContain('Phase Zero evidence complete');
    expect(message).toContain('Missing production proof');
  });

  it('omits the evidence line when the checklist item has no evidence', () => {
    const message = buildChecklistFollowUpSeedMessage('Title', 'DEFER', 'Item text', undefined);
    expect(message).not.toContain('Evidence noted');
  });
});
