import { compactMessageList, decoratePromptForContextMode } from '@/lib/contextModes';
import { buildAgentPromptForApi } from '@/lib/promptBuilder';
import type { Agent, Message, RoleDefinition, Room } from '@/types/domain';

/**
 * Below this size the whole discussion is sent verbatim on every call. The
 * shared prefix is cached by the provider, so long-but-stable history is cheap;
 * only past this point does summarising older turns beat keeping them.
 * ~30k tokens at the app's 4 chars/token estimate.
 */
export const FULL_HISTORY_CHAR_LIMIT = 120_000;

export interface ApiContext {
  messages: Message[];
  compacted: boolean;
}

function totalChars(messages: Message[]): number {
  return messages.reduce((sum, message) => sum + message.content.length, 0);
}

/**
 * Everything the agent needs to answer with no chat memory behind it: the full
 * room history including the agent's own earlier answers. The opening message
 * (the brief / kickoff) is never summarised away.
 */
export function selectApiContext(room: Room): ApiContext {
  const all = room.messages;
  if (totalChars(all) <= FULL_HISTORY_CHAR_LIMIT || all.length <= 13) return { messages: all, compacted: false };
  const [first, ...rest] = all;
  const compacted = [first!, ...compactMessageList(room, rest, 'api')];
  return { messages: compacted, compacted: true };
}

export interface ApiTurnPrompt {
  prompt: string;
  compacted: boolean;
}

export function buildApiTurnPrompt(room: Room, agent: Agent, role: RoleDefinition): ApiTurnPrompt {
  const { messages, compacted } = selectApiContext(room);
  const { prompt, tail } = buildAgentPromptForApi(agent, role, messages);
  // 'new-chat' is the honest description of a stateless call; 'compact' adds the
  // note that older discussion is a digest. Round/role markers are detected on
  // the turn-specific tail only, so quoted discussion text can't trigger them.
  return { prompt: decoratePromptForContextMode(prompt, compacted ? 'compact' : 'new-chat', tail), compacted };
}
