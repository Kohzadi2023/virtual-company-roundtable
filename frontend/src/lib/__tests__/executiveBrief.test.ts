import { describe, expect, it } from 'vitest';
import { decisionEvidenceForMessage, decisionVoteIdForMessage } from '@/lib/decisionVoting';
import { BRIEF_DISCLAIMER, buildExecutiveDecisionBrief } from '@/lib/executiveBrief';
import type { ActionItem, DecisionRecord, Message, Room, VoteChoice } from '@/types/domain';

const NOW = new Date('2026-10-04T12:00:00Z');

function proposalMessage(): Message {
  const block = JSON.stringify({
    title: 'Pilot Go Decision',
    outcome: 'CONDITIONAL_GO',
    details: 'Run a bounded pilot once the signing certificate exists.',
    checklist: [
      { item: 'Architecture agreed', status: 'satisfied', evidence: 'Round 3' },
      { item: 'Code signing issued', status: 'condition', evidence: 'Needs 7-14 business days' },
      { item: 'Billing audit done', status: 'blocker' },
    ],
    voteQuestion: 'Do you support this?',
  });
  return {
    id: 'm-proposal',
    authorType: 'agent',
    authorId: 'agent-olivia',
    authorNameSnapshot: 'Olivia',
    roleNameSnapshot: 'Operations',
    content: `Proposal\n\nVC_DECISION_PROPOSAL\n\`\`\`json\n${block}\n\`\`\``,
    createdAt: 10,
  };
}

function voteMessage(id: string, name: string, role: string, choice: VoteChoice, rationale: string, conditions: string[] = []): Message {
  return {
    id: `m-${id}`,
    authorType: 'agent',
    authorId: id,
    authorNameSnapshot: name,
    roleNameSnapshot: role,
    content: `My vote.\n\nVC_DECISION_VOTE\n\`\`\`json\n${JSON.stringify({ choice, rationale, conditions })}\n\`\`\``,
    createdAt: 20,
  };
}

function room(overrides: Partial<Room> = {}): Room {
  const messages = [
    proposalMessage(),
    voteMessage('agent-emma', 'Emma', 'Architect', 'agree', 'Boundaries are sound.'),
    voteMessage('agent-ryan', 'Ryan', 'Security', 'concern', 'Telemetry could leak prompts.', ['Add a canary leak test']),
    voteMessage('agent-grace', 'Grace', 'Accountant', 'disagree', 'Costs are unmeasured | risky.'),
  ];
  return {
    id: 'room-1',
    name: 'Pilot Review',
    emoji: '🏢',
    languageCode: 'en',
    agentIds: ['agent-olivia', 'agent-emma', 'agent-ryan', 'agent-grace'],
    teamIds: [],
    individualAgentIds: [],
    messages,
    votes: [{
      id: decisionVoteIdForMessage('m-proposal'),
      question: 'Do you support this?',
      votes: { 'agent-emma': 'agree', 'agent-ryan': 'concern', 'agent-grace': 'disagree' },
      createdAt: 15,
    }],
    createdAt: 1,
    ...overrides,
  };
}

function decision(status: DecisionRecord['status']): DecisionRecord {
  return {
    id: 'd1',
    projectId: 'p1',
    roomId: 'room-1',
    title: 'Pilot Go Decision',
    details: '',
    evidence: decisionEvidenceForMessage('m-proposal'),
    status,
    createdAt: 1,
    updatedAt: 1,
  };
}

function action(overrides: Partial<ActionItem>): ActionItem {
  return {
    id: 'a1',
    projectId: 'p1',
    roomId: 'room-1',
    title: 'Open the Apple developer account',
    status: 'todo',
    priority: 'medium',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('buildExecutiveDecisionBrief', () => {
  it('prints the legal disclaimer at both the top and the bottom', () => {
    const brief = buildExecutiveDecisionBrief(room(), [], [], NOW);
    expect(brief.startsWith(`> ${BRIEF_DISCLAIMER}`)).toBe(true);
    expect(brief.trimEnd().endsWith(`> ${BRIEF_DISCLAIMER}`)).toBe(true);
  });

  it('has the four sections in order, then the audit appendix', () => {
    const brief = buildExecutiveDecisionBrief(room(), [], [], NOW);
    const order = [
      '## 1. Executive Summary & Verdict',
      '## 2. Adversarial Matrix',
      '## 3. Unresolved Minority Dissents',
      '## 4. Action Item Ledger',
      '## Audit Appendix',
    ].map(heading => brief.indexOf(heading));
    expect(order.every(index => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('reports verdict, vote tally and checklist counts from the recorded proposal', () => {
    const brief = buildExecutiveDecisionBrief(room(), [], [], NOW);
    expect(brief).toContain('**Verdict:** CONDITIONAL GO');
    expect(brief).toContain('1 agree · 1 concern · 1 disagree · 0 abstain');
    expect(brief).toContain('Split');
    expect(brief).toContain('satisfied 1 · conditions 1 · blockers 1');
    expect(brief).toContain('Run a bounded pilot once the signing certificate exists.');
  });

  it('never presents specialist agreement as the user\'s approval', () => {
    const unanimous = room({
      messages: [
        proposalMessage(),
        voteMessage('agent-emma', 'Emma', 'Architect', 'agree', 'Fine.'),
        voteMessage('agent-ryan', 'Ryan', 'Security', 'agree', 'Fine.'),
      ],
      votes: [{ id: decisionVoteIdForMessage('m-proposal'), question: '', votes: { 'agent-emma': 'agree', 'agent-ryan': 'agree' }, createdAt: 1 }],
    });
    const pending = buildExecutiveDecisionBrief(unanimous, [decision('proposed')], [], NOW);
    expect(pending).toContain('Unanimous');
    expect(pending).toContain('Awaiting your ratification');
    expect(pending).not.toContain('Approved by you');

    const approved = buildExecutiveDecisionBrief(unanimous, [decision('approved')], [], NOW);
    expect(approved).toContain('Approved by you');
    expect(buildExecutiveDecisionBrief(unanimous, [decision('reversed')], [], NOW)).toContain('Superseded');
  });

  it('lists concerns and disagreements as dissents with their reasoning and conditions', () => {
    const brief = buildExecutiveDecisionBrief(room(), [], [], NOW);
    const dissent = brief.slice(brief.indexOf('## 3.'), brief.indexOf('## 4.'));
    expect(dissent).toContain('Ryan · Security — Concern');
    expect(dissent).toContain('Telemetry could leak prompts.');
    expect(dissent).toContain('Add a canary leak test');
    expect(dissent).toContain('Grace · Accountant — Disagree');
    expect(dissent).not.toContain('Emma');
  });

  it('warns that unanimity among AI personas is not independent validation', () => {
    const unanimous = room({
      messages: [proposalMessage(), voteMessage('agent-emma', 'Emma', 'Architect', 'agree', 'Fine.')],
      votes: [{ id: decisionVoteIdForMessage('m-proposal'), question: '', votes: { 'agent-emma': 'agree' }, createdAt: 1 }],
    });
    const brief = buildExecutiveDecisionBrief(unanimous, [], [], NOW);
    expect(brief).toContain('No concern or disagreement was recorded.');
    expect(brief).toContain('not independent validation');
  });

  it('puts topics with conflicting stated verdicts in the adversarial matrix', () => {
    const messages: Message[] = [
      proposalMessage(),
      { id: 'a', authorType: 'agent', authorId: 'agent-tom', authorNameSnapshot: 'Tom', content: 'Managed SaaS: GO', createdAt: 11 },
      { id: 'b', authorType: 'agent', authorId: 'agent-ryan', authorNameSnapshot: 'Ryan', content: 'Managed SaaS: NO-GO', createdAt: 12 },
      { id: 'c', authorType: 'agent', authorId: 'agent-emma', authorNameSnapshot: 'Emma', content: 'Desktop pilot: GO', createdAt: 13 },
    ];
    const brief = buildExecutiveDecisionBrief(room({ messages }), [], [], NOW);
    const matrix = brief.slice(brief.indexOf('## 2.'), brief.indexOf('## 3.'));
    expect(matrix).toContain('| Managed SaaS |');
    expect(matrix).toContain('**GO** (Tom)');
    expect(matrix).toContain('**NO-GO** (Ryan)');
    expect(matrix).not.toContain('Desktop pilot');
  });

  it('builds the action ledger from tracked items first, then spoken ones, ordered by priority', () => {
    const messages = [...room().messages, { id: 'x', authorType: 'agent' as const, authorId: 'agent-emma', authorNameSnapshot: 'Emma', content: 'Action: Draft the pilot agreement', createdAt: 30 }];
    const brief = buildExecutiveDecisionBrief(
      room({ messages }),
      [],
      [
        action({ id: 'a1', title: 'Low thing', priority: 'low', owner: 'Sam' }),
        action({ id: 'a2', title: 'Urgent thing', priority: 'high', deadline: '2026-10-20' }),
        action({ id: 'a3', title: 'Other room', roomId: 'room-2' }),
      ],
      NOW,
    );
    const ledger = brief.slice(brief.indexOf('## 4.'), brief.indexOf('## Audit'));
    expect(ledger.indexOf('Urgent thing')).toBeGreaterThan(-1);
    expect(ledger.indexOf('Urgent thing')).toBeLessThan(ledger.indexOf('Low thing'));
    expect(ledger).toContain('| Urgent thing | Not assigned | 2026-10-20 | high | todo |');
    expect(ledger).toContain('| Low thing | Sam |');
    expect(ledger).toContain('| Draft the pilot agreement | Not assigned |');
    expect(ledger).not.toContain('Other room');
  });

  it('lists unresolved checklist items and voter conditions, not satisfied ones', () => {
    const brief = buildExecutiveDecisionBrief(room(), [], [], NOW);
    const conditions = brief.slice(brief.indexOf('### Conditions to satisfy'), brief.indexOf('## Audit'));
    expect(conditions).toContain('Code signing issued (Condition)');
    expect(conditions).toContain('Billing audit done (Blocker)');
    expect(conditions).toContain('Add a canary leak test — Ryan');
    expect(conditions).not.toContain('Architecture agreed');
  });

  it('escapes pipes so a cell cannot break the table', () => {
    const brief = buildExecutiveDecisionBrief(room(), [], [action({ title: 'Pay A | B' })], NOW);
    expect(brief).toContain('Pay A \\| B');
  });

  it('produces an honest draft when no decision proposal exists', () => {
    const brief = buildExecutiveDecisionBrief(
      room({ messages: [{ id: 'u', authorType: 'user', content: 'Should we launch?', createdAt: 1 }], votes: [] }),
      [],
      [],
      NOW,
    );
    expect(brief).toContain('No decision proposal recorded yet');
    expect(brief).toContain('This is a draft');
    expect(brief).not.toContain('**Verdict:**');
    expect(brief).toContain(`> ${BRIEF_DISCLAIMER}`);
  });

  it('uses Persian labels for Persian rooms and English for languages without a reviewed translation', () => {
    expect(buildExecutiveDecisionBrief(room({ languageCode: 'fa' }), [], [], NOW)).toContain('خلاصه اجرایی و حکم نهایی');
    expect(buildExecutiveDecisionBrief(room({ languageCode: 'de' }), [], [], NOW)).toContain('Executive Summary & Verdict');
  });

  it('records in the audit appendix that no AI wrote it, with source counts and per-voter table', () => {
    const brief = buildExecutiveDecisionBrief(room(), [], [], NOW);
    const audit = brief.slice(brief.indexOf('## Audit Appendix'));
    expect(audit).toContain('No AI was used to write this brief.');
    expect(audit).toContain('**Source messages:** 4');
    expect(audit).toContain('| Ryan | Security | Concern |');
    expect(audit).toContain('| Billing audit done | Blocker | — |');
  });
});
