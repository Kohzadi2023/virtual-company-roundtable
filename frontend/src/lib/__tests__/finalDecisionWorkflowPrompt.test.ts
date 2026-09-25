import { describe, expect, it } from 'vitest';
import { decoratePromptForContextMode } from '@/lib/contextModes';

describe('final decision workflow prompt contract', () => {
  it('requires Olivia to draft a checklist proposal in final-round opening', () => {
    const prompt = decoratePromptForContextMode([
      'You are Olivia, the company\'s Operations Manager & Meeting Facilitator.',
      '<MEETING_CONTEXT>',
      'Round: 4/4 · Final decision',
      'Stage: opening',
      '</MEETING_CONTEXT>',
    ].join('\n'), 'continue');

    expect(prompt).toContain('VC_DECISION_PROPOSAL');
    expect(prompt).toContain('"outcome": "GO | NO_GO | CONDITIONAL_GO | DEFER"');
    expect(prompt).toContain('"status": "satisfied | condition | blocker"');
    expect(prompt).toContain('user remains the final approver');
  });

  it('requires specialists to vote on Olivia\'s exact proposal in the final specialist stage', () => {
    const prompt = decoratePromptForContextMode([
      'You are Emma, the company\'s Software Architect.',
      '<MEETING_ROUND_INSTRUCTIONS>',
      'Round: 4/4 · Final decision',
      'Stage: specialists',
      '</MEETING_ROUND_INSTRUCTIONS>',
    ].join('\n'), 'continue');

    expect(prompt).toContain('VC_DECISION_VOTE');
    expect(prompt).toContain('"choice": "agree | concern | disagree | abstain"');
    expect(prompt).toContain('Vote on the proposal as written');
  });
});
