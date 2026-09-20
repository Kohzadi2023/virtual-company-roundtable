import { unseenMessagesForAgent } from '@/lib/contextDelta';
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
  { value: 'compact', label: 'Compact Context', description: 'Pinned messages plus the most recent relevant discussion.' },
  { value: 'decision', label: 'Decision Review', description: 'Compact context with a decision-ready review instruction.' },
  { value: 'challenge', label: 'Challenge Consensus', description: 'Compact context with a devil’s-advocate instruction.' },
];

function withoutAgentOwnMessages(room: Room, agentId: string): Message[] {
  return room.messages.filter(message => !(message.authorType === 'agent' && message.authorId === agentId));
}

function compactMessages(room: Room, agentId: string): Message[] {
  const relevant = withoutAgentOwnMessages(room, agentId);
  const pinned = relevant.filter(message => message.pinned);
  const recent = relevant.slice(-12);
  const byId = new Map<string, Message>();
  for (const message of [...pinned, ...recent]) byId.set(message.id, message);
  return relevant.filter(message => byId.has(message.id));
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
      return 'The supplied context is intentionally compact: pinned items plus recent discussion. Preserve documented decisions and clearly flag anything that cannot be inferred from the compact context.';
    case 'decision':
      return 'DECISION REVIEW MODE: identify the decision to be made, options already discussed, evidence, constraints, unresolved risks, dependencies, and reversible versus irreversible consequences. Do not invent a decision that has not been approved.';
    case 'challenge':
      return 'CHALLENGE CONSENSUS MODE: act as a rigorous devil’s advocate. Identify weak assumptions, missing evidence, failure modes, overlooked alternatives, and conditions that would invalidate the apparent consensus. Do not oppose merely for style; challenge only on substantive grounds.';
    default:
      return null;
  }
}

export function decoratePromptForContextMode(prompt: string, mode: ContextCopyMode): string {
  const instruction = contextModeInstruction(mode);
  if (!instruction) return prompt;
  return `${prompt}\n\nCONTEXT MODE INSTRUCTION:\n${instruction}`;
}

export function estimatePromptSize(value: string): { words: number; chars: number; approxTokens: number } {
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  const chars = value.length;
  return { words, chars, approxTokens: Math.max(1, Math.ceil(chars / 4)) };
}
