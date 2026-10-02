import { buildAgentPrompt } from '@/lib/promptBuilder';
import type { Agent, Message, RoleDefinition } from '@/types/domain';

export function staffingRecoveryInstruction(): string {
  return [
    '<STAFFING_RECOVERY_INSTRUCTION>',
    'Your previous response did not include a valid VC_STAFFING_PLAN, so the meeting is paused.',
    'Regenerate the opening response now. Do not answer the meeting topic itself.',
    'Provide the missing staffing plan using the exact VC_STAFFING_PLAN JSON format required above.',
    'Re-evaluate the current organization roster, choose the minimum sufficient existing specialists, identify only genuine capability gaps, and preserve any human/contractor blockers instead of inventing people.',
    'Do not omit the staffing block. Do not write anything after its closing code fence.',
    '</STAFFING_RECOVERY_INSTRUCTION>',
  ].join('\n');
}

export function buildOliviaStaffingRecoveryPrompt(
  agent: Agent,
  role: RoleDefinition,
  messages: Message[],
): string {
  const basePrompt = buildAgentPrompt(agent, role, messages);
  return [basePrompt, '', staffingRecoveryInstruction()].join('\n');
}

/**
 * Isolates the decision-proposal requirement into its own standalone block
 * at the very end of the prompt, repeating the exact schema rather than just
 * referencing it -- the equivalent instruction embedded earlier in the base
 * prompt (finalDecisionWorkflowInstruction in contextModes.ts) is apparently
 * easy for the model to lose track of or summarize away inside a long,
 * memory-heavy final-round prompt, which is exactly the failure this
 * recovery path exists to correct.
 */
export function decisionProposalRecoveryInstruction(): string {
  return [
    '<DECISION_PROPOSAL_RECOVERY_INSTRUCTION>',
    'Your previous response did not include a valid VC_DECISION_PROPOSAL block, so the final round is paused and the meeting cannot close.',
    'A prose summary of the decision, however complete, is NOT sufficient and does not count. Do not repeat that mistake.',
    'Regenerate your final-round opening response now, ending it with exactly this machine-readable block as the LAST content in your response:',
    '',
    'VC_DECISION_PROPOSAL',
    '```json',
    '{',
    '  "title": "Concise decision title",',
    '  "outcome": "NO_GO",',
    '  "details": "The exact decision being proposed and what it means operationally",',
    '  "checklist": [',
    '    {',
    '      "item": "Specific decision condition or readiness criterion",',
    '      "status": "blocker",',
    '      "evidence": "Evidence or reason from the discussion"',
    '    }',
    '  ],',
    '  "voteQuestion": "Do you support this decision proposal as written?",',
    '  "followUpNeeded": false,',
    '  "followUpTitle": "",',
    '  "followUpReason": ""',
    '}',
    '```',
    '',
    'Base the title, outcome, details, and checklist on the evidence and unresolved conditions already accumulated across the prior rounds -- do not restart the discussion.',
    'outcome MUST be exactly one of GO, NO_GO, CONDITIONAL_GO, DEFER. Every checklist item MUST have item, status (satisfied/condition/blocker), and evidence.',
    'Set followUpNeeded to true only when unresolved condition/blocker items genuinely warrant their own dedicated follow-up meeting, and give it a concrete followUpTitle and followUpReason; otherwise leave those three fields as shown.',
    'Do not omit this block. Do not write anything after its closing code fence.',
    '</DECISION_PROPOSAL_RECOVERY_INSTRUCTION>',
  ].join('\n');
}

export function buildOliviaDecisionProposalRecoveryPrompt(
  agent: Agent,
  role: RoleDefinition,
  messages: Message[],
): string {
  const basePrompt = buildAgentPrompt(agent, role, messages);
  return [basePrompt, '', decisionProposalRecoveryInstruction()].join('\n');
}
