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

    expect(prompt).toContain('REQUIRED OUTPUT CONTRACT — DO NOT OMIT OR SUMMARIZE AWAY.');
    expect(prompt).toContain('A Round 4 opening response WITHOUT a valid VC_DECISION_PROPOSAL block is INVALID');
    expect(prompt).toContain('MANDATORY FINAL BLOCK — this must be the LAST content in your response:');
    expect(prompt).toContain('VC_DECISION_PROPOSAL');
    expect(prompt).toContain('outcome MUST be exactly one of: GO, NO_GO, CONDITIONAL_GO, DEFER');
    expect(prompt).toContain('status MUST be exactly one of: satisfied, condition, blocker');
    expect(prompt).toContain('Emit exactly ONE VC_DECISION_PROPOSAL block.');
    expect(prompt).toContain('Do not write anything after it.');
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

    expect(prompt).toContain('REQUIRED OUTPUT CONTRACT — DO NOT OMIT OR SUMMARIZE AWAY.');
    expect(prompt).toContain('A Round 4 specialist response WITHOUT a valid VC_DECISION_VOTE block is INVALID');
    expect(prompt).toContain('VC_DECISION_VOTE');
    expect(prompt).toContain('choice MUST be exactly one of: agree, concern, disagree, abstain');
    expect(prompt).toContain('Vote on Olivia’s proposal as written');
    expect(prompt).toContain('Emit exactly ONE VC_DECISION_VOTE block.');
    expect(prompt).toContain('Do not write anything after it.');
  });
});
