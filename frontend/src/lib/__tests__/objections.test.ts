import { describe, expect, it } from 'vitest';
import { decoratePromptForContextMode } from '@/lib/contextModes';
import { collectObjections, parseObjections } from '@/lib/objections';
import type { Message } from '@/types/domain';

function block(objections: unknown): string {
  return `My critique.\n\nVC_OBJECTIONS\n\`\`\`json\n${JSON.stringify({ objections })}\n\`\`\``;
}

function agentMessage(id: string, name: string, content: string, extra: Partial<Message> = {}): Message {
  return { id: `m-${id}-${content.length}`, authorType: 'agent', authorId: id, authorNameSnapshot: name, roleNameSnapshot: 'Role', content, createdAt: 1, ...extra };
}

describe('parseObjections', () => {
  it('reads topic, objection, target and severity', () => {
    const [item] = parseObjections(block([{ topic: 'Rust rewrite', objection: 'Estimate is unproven.', against: 'Emma', severity: 'blocker' }]));
    expect(item).toEqual({ topic: 'Rust rewrite', objection: 'Estimate is unproven.', against: 'Emma', severity: 'blocker' });
  });

  it('defaults an unknown severity to major and a missing target to empty', () => {
    const [item] = parseObjections(block([{ topic: 'T', objection: 'O', severity: 'catastrophic' }]));
    expect(item).toMatchObject({ severity: 'major', against: '' });
  });

  it('drops entries without a topic or objection instead of inventing them', () => {
    expect(parseObjections(block([{ topic: 'T' }, { objection: 'O' }, 'junk', null, { topic: ' ', objection: 'O' }]))).toEqual([]);
  });

  it('keeps at most five objections per message', () => {
    const many = Array.from({ length: 8 }, (_, index) => ({ topic: `T${index}`, objection: 'O' }));
    expect(parseObjections(block(many))).toHaveLength(5);
  });

  it('returns nothing for text without a block or with broken JSON', () => {
    expect(parseObjections('plain critique')).toEqual([]);
    expect(parseObjections('VC_OBJECTIONS\n```json\n{ nope\n```')).toEqual([]);
    expect(parseObjections('VC_OBJECTIONS\n```json\n{"objections":"x"}\n```')).toEqual([]);
  });
});

describe('collectObjections', () => {
  it('sorts blockers first and ignores the facilitator and the user', () => {
    const messages: Message[] = [
      agentMessage('agent-emma', 'Emma', block([{ topic: 'Minor thing', objection: 'o', severity: 'minor' }])),
      agentMessage('agent-ryan', 'Ryan', block([{ topic: 'Key storage', objection: 'o', severity: 'blocker' }])),
      agentMessage('agent-olivia', 'Olivia', block([{ topic: 'Facilitator', objection: 'o' }])),
      { id: 'u', authorType: 'user', content: block([{ topic: 'User', objection: 'o' }]), createdAt: 2 },
    ];
    expect(collectObjections(messages).map(item => item.topic)).toEqual(['Key storage', 'Minor thing']);
  });

  it('counts only a specialist\'s latest block so a regenerated reply is not listed twice', () => {
    const messages: Message[] = [
      agentMessage('agent-emma', 'Emma', block([{ topic: 'Old', objection: 'o' }])),
      agentMessage('agent-emma', 'Emma', block([{ topic: 'New', objection: 'o' }, { topic: 'New 2', objection: 'o' }])),
    ];
    expect(collectObjections(messages).map(item => item.topic)).toEqual(['New', 'New 2']);
  });

  it('carries the author and role for display', () => {
    const [item] = collectObjections([agentMessage('agent-ryan', 'Ryan', block([{ topic: 'T', objection: 'O' }]))]);
    expect(item).toMatchObject({ agentId: 'agent-ryan', author: 'Ryan', role: 'Role' });
  });
});

describe('critique round prompt', () => {
  const specialist = (round: string, stage = 'specialists', who = 'Emma, the company\'s Software Architect') => decoratePromptForContextMode([
    `You are ${who}.`,
    '<MEETING_CONTEXT>',
    `Round: ${round}`,
    `Stage: ${stage}`,
    '</MEETING_CONTEXT>',
  ].join('\n'), 'continue');

  it('asks specialists in round 2 to record objections, as a request rather than a hard requirement', () => {
    const prompt = specialist('2/4 · Critique');
    expect(prompt).toContain('VC_OBJECTIONS');
    expect(prompt).toContain('severity is exactly one of blocker, major, minor');
    expect(prompt).toContain('only objections you actually hold, never invented ones');
    expect(prompt).not.toContain('INVALID');
  });

  it('does not ask in other rounds, other stages, for Olivia, or in a two-round meeting', () => {
    expect(specialist('1/4 · Initial opinions')).not.toContain('VC_OBJECTIONS');
    expect(specialist('3/4 · Revised proposals')).not.toContain('VC_OBJECTIONS');
    expect(specialist('2/4 · Critique', 'opening')).not.toContain('VC_OBJECTIONS');
    expect(specialist('2/4 · Critique', 'specialists', 'Olivia, the company\'s Operations Manager')).not.toContain('VC_OBJECTIONS');
    expect(specialist('2/2 · Critique')).not.toContain('VC_OBJECTIONS');
  });

  it('leaves the final-round vote contract unchanged', () => {
    const prompt = specialist('4/4 · Final decision');
    expect(prompt).toContain('VC_DECISION_VOTE');
    expect(prompt).not.toContain('VC_OBJECTIONS');
  });
});
