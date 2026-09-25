import { unseenMessagesForAgent } from '@/lib/contextDelta';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import type { RoundStage } from '@/lib/meetingOrchestration';
import type { AgentContextState, Message, Room } from '@/types/domain';

export type ContextCopyMode = 'continue' | 'new-chat' | 'full' | 'compact' | 'decision' | 'challenge';

export interface ContextModeDefinition {
  value: ContextCopyMode;
  label: string;
  description: string;
}

export const CONTEXT_MODES: ContextModeDefinition[] = [
  { value: 'continue', label: 'Continue Existing Chat', description: 'Only new context since the last copy.' },
  { value: 'new-chat', label: 'New Chat', description: 'Re-establish the discussion from complete room context.' },
  { value: 'full', label: 'Full Context', description: 'All relevant room messages for exhaustive reference.' },
  { value: 'compact', label: 'Smart Compact', description: 'Compresses older discussion, preserves important items, and keeps recent messages in full.' },
  { value: 'decision', label: 'Decision Review', description: 'Smart compact context with a decision-ready review instruction.' },
  { value: 'challenge', label: 'Challenge Consensus', description: 'Smart compact context with a devil’s-advocate instruction.' },
];

export function preferredContextModeForMeetingTurn(
  agentId: string,
  activeSpeakerId: string | null | undefined,
  roundStage: RoundStage | undefined,
): ContextCopyMode {
  return agentId === MEETING_FACILITATOR_AGENT_ID
    && activeSpeakerId === agentId
    && roundStage === 'synthesis'
    ? 'compact'
    : 'continue';
}

function withoutAgentOwnMessages(room: Room, agentId: string): Message[] {
  return room.messages.filter(message => !(message.authorType === 'agent' && message.authorId === agentId));
}

function summaryLine(message: Message): string {
  const author = message.authorNameSnapshot ?? (message.authorType === 'user' ? 'User' : 'Agent');
  const clean = message.content.replace(/\s+/g, ' ').trim();
  const excerpt = clean.length > 180 ? `${clean.slice(0, 177)}…` : clean;
  const marker = message.reaction ? ` [${message.reaction}]` : message.pinned ? ' [pinned]' : '';
  return `- ${author}${marker}: ${excerpt}`;
}

function compactMessages(room: Room, agentId: string): Message[] {
  const relevant = withoutAgentOwnMessages(room, agentId);
  if (relevant.length <= 12) return relevant;

  const anchors = relevant.filter(message => message.pinned || message.reaction === 'accepted' || message.reaction === 'important' || message.reaction === 'risk');
  const recent = relevant.slice(-12);
  const selectedIds = new Set([...anchors, ...recent].map(message => message.id));
  const older = relevant.filter(message => !selectedIds.has(message.id));
  const selected = relevant.filter(message => selectedIds.has(message.id));

  if (older.length === 0) return selected;
  const summary: Message = {
    id: `smart-compact-summary:${room.id}:${agentId}`,
    authorType: 'user',
    authorNameSnapshot: 'Context Compressor',
    content: `## Compressed earlier discussion\n\nThe following older messages are summarized deterministically; important/pinned items and recent messages are supplied separately in full.\n\n${older.slice(-24).map(summaryLine).join('\n')}${older.length > 24 ? `\n- … ${older.length - 24} older messages omitted from the compact digest.` : ''}`,
    createdAt: older[0]?.createdAt ?? room.createdAt,
  };
  return [summary, ...selected];
}

export function messagesForContextMode(
  room: Room,
  agentId: string,
  cursor: AgentContextState | undefined,
  mode: ContextCopyMode,
): Message[] {
  if (mode === 'continue') return unseenMessagesForAgent(room, agentId, cursor);
  if (mode === 'new-chat' || mode === 'full') return withoutAgentOwnMessages(room, agentId);
  return compactMessages(room, agentId);
}

export function contextModeInstruction(mode: ContextCopyMode): string | null {
  switch (mode) {
    case 'new-chat':
      return 'This is a new external chat. Re-establish the necessary working context from the supplied material before contributing, while preserving your professional role.';
    case 'full':
      return 'Use the supplied full room context as exhaustive reference. Focus your response on the latest unresolved work rather than repeating the transcript.';
    case 'compact':
      return 'The supplied context uses deterministic smart compression: older discussion is summarized, important items are preserved, and recent discussion remains in full. Treat the compact digest as a navigation aid rather than a verbatim record.';
    case 'decision':
      return 'DECISION REVIEW MODE: identify the decision to be made, options already discussed, evidence, constraints, unresolved risks, dependencies, and reversible versus irreversible consequences. Do not invent a decision that has not been approved.';
    case 'challenge':
      return 'CHALLENGE CONSENSUS MODE: act as a rigorous devil’s advocate. Identify weak assumptions, missing evidence, failure modes, overlooked alternatives, and conditions that would invalidate the apparent consensus. Do not oppose merely for style; challenge only on substantive grounds.';
    default:
      return null;
  }
}

function finalDecisionWorkflowInstruction(prompt: string): string | null {
  if (!prompt.includes('Round: 4/4')) return null;
  const isOlivia = prompt.includes('You are Olivia,');
  const opening = prompt.includes('Stage: opening');
  const specialists = prompt.includes('Stage: specialists');
  const synthesis = prompt.includes('Stage: synthesis');

  if (isOlivia && opening) {
    return [
      'REQUIRED OUTPUT CONTRACT — DO NOT OMIT OR SUMMARIZE AWAY.',
      'This is the final decision round. Before specialists vote, draft ONE concrete decision proposal from the evidence and unresolved conditions accumulated in prior rounds.',
      'Do not ask the user to rewrite the decision title or details. You own the proposal draft; the user remains the final approver after the specialist vote.',
      'You may explain the proposal in prose first, but you MUST finish the response with the exact machine-readable structure below.',
      'A Round 4 opening response WITHOUT a valid VC_DECISION_PROPOSAL block is INVALID and cannot advance the meeting.',
      'Do not stop after a prose summary, even when the conclusion seems obvious or unchanged from an earlier round.',
      '',
      'MANDATORY FINAL BLOCK — this must be the LAST content in your response:',
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
      '  "voteQuestion": "Do you support this decision proposal as written?"',
      '}',
      '```',
      '',
      'STRICT SCHEMA RULES:',
      '- Replace the example values with the actual meeting decision; do not copy NO_GO or blocker unless that is the evidence-supported result.',
      '- outcome MUST be exactly one of: GO, NO_GO, CONDITIONAL_GO, DEFER.',
      '- checklist MUST contain at least one material criterion and every checklist item MUST have item, status, and evidence.',
      '- status MUST be exactly one of: satisfied, condition, blocker.',
      '- Use satisfied only when evidence supports it, condition when it must be completed or verified, and blocker when it currently prevents proceeding.',
      '- Include all material unresolved blockers/conditions that affect the proposed outcome; do not pad the list with generic items.',
      '- Return valid JSON: double quotes, no comments, no trailing commas, no Markdown inside JSON string values.',
      '- Emit exactly ONE VC_DECISION_PROPOSAL block.',
      '- The closing ``` fence of this JSON block MUST be the final non-whitespace content of your response. Do not write anything after it.',
    ].join('\n');
  }

  if (!isOlivia && specialists) {
    return [
      'REQUIRED OUTPUT CONTRACT — DO NOT OMIT OR SUMMARIZE AWAY.',
      'This is the final decision vote. Review Olivia’s latest VC_DECISION_PROPOSAL from your professional scope.',
      'Your normal Round 4 contribution should explain whether the proposal is supportable, what evidence matters, and any conditions or objections.',
      'You MUST finish your response with the exact machine-readable vote structure below.',
      'A Round 4 specialist response WITHOUT a valid VC_DECISION_VOTE block is INVALID and does not count as a vote.',
      '',
      'MANDATORY FINAL BLOCK — this must be the LAST content in your response:',
      'VC_DECISION_VOTE',
      '```json',
      '{',
      '  "choice": "agree",',
      '  "rationale": "Short evidence-based reason for your vote",',
      '  "conditions": []',
      '}',
      '```',
      '',
      'STRICT VOTE RULES:',
      '- choice MUST be exactly one of: agree, concern, disagree, abstain.',
      '- Vote on Olivia’s proposal as written, not on a different proposal you invent yourself.',
      '- Use concern when you can support it only with material conditions; use disagree when the proposal should not be approved in its current form.',
      '- rationale MUST be evidence-based and specific to your professional scope.',
      '- conditions MUST be an array of strings; use [] when there are no conditions.',
      '- Return valid JSON with no comments or trailing commas.',
      '- Emit exactly ONE VC_DECISION_VOTE block.',
      '- The closing ``` fence of this JSON block MUST be the final non-whitespace content of your response. Do not write anything after it.',
    ].join('\n');
  }

  if (isOlivia && synthesis) {
    return [
      'Synthesize the final-round specialist votes. State the tally, the material reasons behind concerns/disagreements, and whether the proposal should be presented to the user unchanged or revised.',
      'Do not claim the decision is approved: specialist votes are advisory evidence and the user remains the final approver.',
      'If the proposal needs material revision, explain exactly what must change so a fresh proposal can be put to a new vote.',
    ].join('\n');
  }

  return null;
}

export function decoratePromptForContextMode(prompt: string, mode: ContextCopyMode): string {
  const instruction = contextModeInstruction(mode);
  const withMode = instruction ? `${prompt}\n\nCONTEXT MODE INSTRUCTION:\n${instruction}` : prompt;
  const finalDecision = finalDecisionWorkflowInstruction(withMode);
  return finalDecision ? `${withMode}\n\nFINAL DECISION WORKFLOW:\n${finalDecision}` : withMode;
}

export function estimatePromptSize(value: string): { words: number; chars: number; approxTokens: number } {
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  const chars = value.length;
  return { words, chars, approxTokens: Math.max(1, Math.ceil(chars / 4)) };
}
