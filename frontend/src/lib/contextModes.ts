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
  { value: 'compact', label: 'Smart Compact', description: 'Compresses older discussion, preserves important items, and keeps recent messages in full.' },
  { value: 'decision', label: 'Decision Review', description: 'Smart compact context with a decision-ready review instruction.' },
  { value: 'challenge', label: 'Challenge Consensus', description: 'Smart compact context with a devil’s-advocate instruction.' },
];

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
