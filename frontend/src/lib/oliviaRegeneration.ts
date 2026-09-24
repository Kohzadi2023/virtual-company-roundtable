import { buildAgentPrompt } from '@/lib/promptBuilder';
import type { Agent, Message, RoleDefinition } from '@/types/domain';

export function buildOliviaStaffingRecoveryPrompt(
  agent: Agent,
  role: RoleDefinition,
  messages: Message[],
): string {
  const basePrompt = buildAgentPrompt(agent, role, messages);
  return [
    basePrompt,
    '',
    '<STAFFING_RECOVERY_INSTRUCTION>',
    'Your previous response did not include a valid VC_STAFFING_PLAN, so the meeting is paused.',
    'Regenerate the opening response now. Do not answer the meeting topic itself.',
    'Provide the missing staffing plan using the exact VC_STAFFING_PLAN JSON format required above.',
    'Re-evaluate the current organization roster, choose the minimum sufficient existing specialists, identify only genuine capability gaps, and preserve any human/contractor blockers instead of inventing people.',
    'Do not omit the staffing block. Do not write anything after its closing code fence.',
    '</STAFFING_RECOVERY_INSTRUCTION>',
  ].join('\n');
}
