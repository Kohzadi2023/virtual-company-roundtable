import { beforeEach, describe, expect, it } from 'vitest';
import {
  assessDecisionConsensus,
  buildChecklistFollowUpRoomName,
  buildChecklistFollowUpSeedMessage,
  buildDecisionFollowUpSeedMessage,
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

describe('Olivia decision follow-up recommendation', () => {
  it('parses a follow-up recommendation when followUpNeeded is true', () => {
    const content = `VC_DECISION_PROPOSAL\n\`\`\`json\n{
      "title": "AI Secretary Agent Foundation",
      "outcome": "CONDITIONAL_GO",
      "details": "Foundation implementation only.",
      "checklist": [{ "item": "Privacy contracts executable", "status": "blocker", "evidence": "PIA/TIA pending." }],
      "voteQuestion": "Do you support this?",
      "followUpNeeded": true,
      "followUpTitle": "Privacy & Provider Readiness Review",
      "followUpReason": "PIA/TIA, DPAs and provider selection remain unresolved."
    }\n\`\`\``;

    const proposal = parseOliviaDecisionProposal(content);
    expect(proposal?.followUp).toEqual({
      title: 'Privacy & Provider Readiness Review',
      reason: 'PIA/TIA, DPAs and provider selection remain unresolved.',
    });
  });

  it('leaves followUp undefined when followUpNeeded is false or a title is missing', () => {
    const withoutNeed = `VC_DECISION_PROPOSAL\n\`\`\`json\n{
      "title": "T", "outcome": "GO", "details": "D",
      "checklist": [{ "item": "Item", "status": "satisfied" }],
      "voteQuestion": "Q", "followUpNeeded": false, "followUpTitle": "", "followUpReason": ""
    }\n\`\`\``;
    expect(parseOliviaDecisionProposal(withoutNeed)?.followUp).toBeUndefined();

    const missingTitle = `VC_DECISION_PROPOSAL\n\`\`\`json\n{
      "title": "T", "outcome": "GO", "details": "D",
      "checklist": [{ "item": "Item", "status": "satisfied" }],
      "voteQuestion": "Q", "followUpNeeded": true, "followUpTitle": "", "followUpReason": "Some reason"
    }\n\`\`\``;
    expect(parseOliviaDecisionProposal(missingTitle)?.followUp).toBeUndefined();
  });

  it('builds a consolidated seed message listing every open checklist item', () => {
    const message = buildDecisionFollowUpSeedMessage(
      'AI Secretary Agent Foundation',
      'CONDITIONAL_GO',
      { title: 'Privacy & Provider Readiness Review', reason: 'PIA/TIA remain unresolved.' },
      [
        { item: 'PIA/TIA complete', status: 'blocker', evidence: 'Not started' },
        { item: 'Telephony provider selected', status: 'condition' },
      ],
    );

    expect(message).toContain('AI Secretary Agent Foundation');
    expect(message).toContain('CONDITIONAL GO');
    expect(message).toContain('PIA/TIA remain unresolved.');
    expect(message).toContain('PIA/TIA complete (Not started)');
    expect(message).toContain('Telephony provider selected');
  });

  it('falls back to a generic reason line when none was given', () => {
    const message = buildDecisionFollowUpSeedMessage('T', 'GO', { title: 'Title', reason: '' }, []);
    expect(message).toContain('Unresolved items remain from the decision checklist.');
  });

  it('treats a complete vote with no disagreement as consensus on direction', () => {
    const eligible = ['a', 'b', 'c'];
    expect(assessDecisionConsensus({ a: 'agree', b: 'agree', c: 'agree' }, eligible).status).toBe('unanimous');
    expect(assessDecisionConsensus({ a: 'agree', b: 'concern', c: 'concern' }, eligible).status).toBe('direction');
    expect(assessDecisionConsensus({ a: 'agree', b: 'concern', c: 'disagree' }, eligible).status).toBe('split');
    expect(assessDecisionConsensus({ a: 'abstain', b: 'abstain', c: 'abstain' }, eligible).status).toBe('split');
    const pending = assessDecisionConsensus({ a: 'agree' }, eligible, ['c']);
    expect(pending.status).toBe('incomplete');
    expect(pending.pendingAgentIds).toEqual(['b']);
    expect(assessDecisionConsensus({ a: 'agree', b: 'concern' }, eligible, ['c']).status).toBe('direction');
  });
});
