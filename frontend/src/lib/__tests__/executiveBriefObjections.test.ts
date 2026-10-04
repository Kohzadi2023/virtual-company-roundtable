import { describe, expect, it } from 'vitest';
import { decisionVoteIdForMessage } from '@/lib/decisionVoting';
import { buildExecutiveDecisionBrief } from '@/lib/executiveBrief';
import type { Message, Room, VoteChoice } from '@/types/domain';

const NOW = new Date('2026-10-04T12:00:00Z');

const proposal: Message = {
  id: 'm-proposal',
  authorType: 'agent',
  authorId: 'agent-olivia',
  authorNameSnapshot: 'Olivia',
  content: `VC_DECISION_PROPOSAL\n\`\`\`json\n${JSON.stringify({
    title: 'Pilot decision',
    outcome: 'CONDITIONAL_GO',
    details: 'Run a bounded pilot.',
    checklist: [{ item: 'Signing issued', status: 'condition' }],
    voteQuestion: 'Support?',
  })}\n\`\`\``,
  createdAt: 10,
};

function vote(agentId: string, name: string, choice: VoteChoice): Message {
  return {
    id: `v-${agentId}`,
    authorType: 'agent',
    authorId: agentId,
    authorNameSnapshot: name,
    roleNameSnapshot: 'Role',
    content: `VC_DECISION_VOTE\n\`\`\`json\n${JSON.stringify({ choice, rationale: 'Because.', conditions: [] })}\n\`\`\``,
    createdAt: 20,
  };
}

function objectionMessage(agentId: string, name: string, items: unknown[]): Message {
  return {
    id: `o-${agentId}`,
    authorType: 'agent',
    authorId: agentId,
    authorNameSnapshot: name,
    roleNameSnapshot: 'Role',
    content: `Critique.\n\nVC_OBJECTIONS\n\`\`\`json\n${JSON.stringify({ objections: items })}\n\`\`\``,
    createdAt: 5,
  };
}

function room(messages: Message[], languageCode = 'en'): Room {
  return {
    id: 'room-1',
    name: 'Pilot Review',
    emoji: '🏢',
    languageCode,
    agentIds: [],
    teamIds: [],
    individualAgentIds: [],
    messages,
    votes: [{
      id: decisionVoteIdForMessage('m-proposal'),
      question: '',
      votes: { 'agent-emma': 'agree', 'agent-ryan': 'concern' },
      createdAt: 1,
    }],
    createdAt: 1,
  };
}

const emmaObjects = objectionMessage('agent-emma', 'Emma', [{ topic: 'Rust rewrite estimate', objection: 'Two weeks is unproven.', against: 'Leo', severity: 'blocker' }]);
const ryanObjects = objectionMessage('agent-ryan', 'Ryan', [{ topic: 'Telemetry', objection: 'Prompts could leak.', severity: 'major' }]);
const decided = [proposal, vote('agent-emma', 'Emma', 'agree'), vote('agent-ryan', 'Ryan', 'concern')];

describe('objections in the executive decision brief', () => {
  it('lists them in the adversarial matrix, strongest first, with the raiser\'s final vote', () => {
    const brief = buildExecutiveDecisionBrief(room([emmaObjects, ryanObjects, ...decided]), [], [], NOW);
    const matrix = brief.slice(brief.indexOf('## 2.'), brief.indexOf('## 3.'));
    expect(matrix).toContain('### Objections raised in the critique round');
    expect(matrix).toContain('| Rust rewrite estimate | Emma · Role | blocker | Two weeks is unproven. | Leo | Agree |');
    expect(matrix).toContain('| Telemetry | Ryan · Role | major | Prompts could leak. | — | Concern |');
    expect(matrix.indexOf('Rust rewrite estimate')).toBeLessThan(matrix.indexOf('Telemetry'));
    expect(matrix).toContain('### Conflicting stated verdicts');
  });

  it('surfaces objections from specialists who then voted agree, but not those already shown as dissent', () => {
    const brief = buildExecutiveDecisionBrief(room([emmaObjects, ryanObjects, ...decided]), [], [], NOW);
    const dissents = brief.slice(brief.indexOf('## 3.'), brief.indexOf('## 4.'));
    expect(dissents).toContain('### Objections on record from specialists who then voted agree');
    expect(dissents).toContain('**Emma — Rust rewrite estimate** (blocker): Two weeks is unproven.');
    expect(dissents).toContain('Confirm each one before relying on the consensus.');
    expect(dissents).not.toContain('Prompts could leak.');
  });

  it('says plainly when no structured objections were recorded', () => {
    const brief = buildExecutiveDecisionBrief(room(decided), [], [], NOW);
    expect(brief).toContain('No structured objections were recorded.');
    expect(brief).not.toContain('### Objections on record from specialists who then voted agree');
  });

  it('still shows an objection when its raiser never cast a final vote', () => {
    const brief = buildExecutiveDecisionBrief(room([objectionMessage('agent-leo', 'Leo', [{ topic: 'Scope', objection: 'Too wide.' }]), ...decided]), [], [], NOW);
    expect(brief).toContain('| Scope | Leo · Role | major | Too wide. | — | — |');
    expect(brief).toContain('**Leo — Scope** (major): Too wide.');
  });

  it('uses Persian headings for Persian rooms', () => {
    const brief = buildExecutiveDecisionBrief(room([emmaObjects, ...decided], 'fa'), [], [], NOW);
    expect(brief).toContain('اعتراض‌های ثبت‌شده در دور نقد');
    expect(brief).toContain('حکم‌های متناقض');
  });
});
