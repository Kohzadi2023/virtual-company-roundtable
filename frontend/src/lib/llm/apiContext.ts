import { compactMessageList, decoratePromptForContextMode } from '@/lib/contextModes';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import type { AnswerLength } from '@/lib/llm/llmSettings';
import { buildAgentPromptForApi } from '@/lib/promptBuilder';
import type { Agent, Message, RoleDefinition, Room } from '@/types/domain';

/**
 * Below this size the whole discussion is sent verbatim on every call. The
 * shared prefix is cached by the provider, so long-but-stable history is cheap;
 * only past this point does summarising older turns beat keeping them.
 * ~30k tokens at the app's 4 chars/token estimate.
 */
export const FULL_HISTORY_CHAR_LIMIT = 120_000;

/**
 * Token saver: start summarising much sooner (~6k tokens). Every API call
 * re-sends the discussion, so the input bill grows with calls x history; this
 * keeps it roughly flat once a meeting is a couple of rounds in.
 */
export const SAVER_HISTORY_CHAR_LIMIT = 24_000;

/** Structured blocks (staffing plan, proposal JSON) longer than this are elided from older facilitator messages. */
const BLOCK_ELISION_MIN_CHARS = 400;
const RECENT_FULL_MESSAGES = 12;

export interface ApiContext {
  messages: Message[];
  compacted: boolean;
}

export interface ApiContextOptions {
  tokenSaver?: boolean;
  answerLength?: AnswerLength;
}

const WORD_BUDGET: Record<Exclude<AnswerLength, 'normal'>, { specialist: number; facilitator: number }> = {
  concise: { specialist: 350, facilitator: 400 },
  brief: { specialist: 200, facilitator: 250 },
};

/**
 * Every answer is sent again in every later call of the meeting, so a shorter
 * answer saves its output tokens once and its input tokens many times over.
 * Required machine-readable blocks are explicitly exempt so a budget can never
 * truncate a staffing plan, decision proposal or vote.
 */
export function lengthBudgetInstruction(length: AnswerLength, facilitator: boolean): string | null {
  if (length === 'normal') return null;
  const words = WORD_BUDGET[length][facilitator ? 'facilitator' : 'specialist'];
  return `LENGTH BUDGET: write at most about ${words} words of prose. Lead with your position, then only the reasons and risks that matter; do not restate earlier messages. Any machine-readable block this prompt requires (VC_STAFFING_PLAN, VC_OBJECTIONS, VC_DECISION_PROPOSAL, VC_DECISION_VOTE) does not count toward the budget and must still be complete and valid.`;
}

function totalChars(messages: Message[]): number {
  return messages.reduce((sum, message) => sum + message.content.length, 0);
}

function isFacilitator(message: Message): boolean {
  return message.authorType === 'agent' && message.authorId === MEETING_FACILITATOR_AGENT_ID;
}

function elideLargeBlocks(content: string): string {
  return content.replace(/```[\s\S]*?```/g, block =>
    block.length > BLOCK_ELISION_MIN_CHARS ? '[structured block omitted from older context]' : block,
  );
}

/**
 * Saver view of older history. Olivia's messages are the meeting's own running
 * summary (framing + synthesis per round), so they stay in full minus bulky
 * structured blocks; specialists' older messages shrink to digest lines. The
 * latest decision proposal is never touched: the vote depends on it.
 */
function saverMessages(rest: Message[]): Message[] {
  const recentStart = Math.max(0, rest.length - RECENT_FULL_MESSAGES);
  let latestProposalId: string | undefined;
  for (const message of rest) {
    if (isFacilitator(message) && message.content.includes('VC_DECISION_PROPOSAL')) latestProposalId = message.id;
  }
  return rest.map((message, index) => {
    if (index >= recentStart || !isFacilitator(message) || message.id === latestProposalId) return message;
    const trimmed = elideLargeBlocks(message.content);
    return trimmed === message.content ? message : { ...message, content: trimmed };
  });
}

/**
 * Everything the agent needs to answer with no chat memory behind it: the full
 * room history including the agent's own earlier answers. The opening message
 * (the brief / kickoff) is never summarised away.
 */
export function selectApiContext(room: Room, options: ApiContextOptions = {}): ApiContext {
  const all = room.messages;
  const saver = options.tokenSaver === true;
  const limit = saver ? SAVER_HISTORY_CHAR_LIMIT : FULL_HISTORY_CHAR_LIMIT;
  if (totalChars(all) <= limit || all.length <= RECENT_FULL_MESSAGES + 1) return { messages: all, compacted: false };
  const [first, ...rest] = all;
  const compacted = [
    first!,
    ...compactMessageList(room, saver ? saverMessages(rest) : rest, 'api', saver ? isFacilitator : undefined),
  ];
  return { messages: compacted, compacted: true };
}

export interface ApiTurnPrompt {
  prompt: string;
  compacted: boolean;
}

export function buildApiTurnPrompt(
  room: Room,
  agent: Agent,
  role: RoleDefinition,
  options: ApiContextOptions = {},
): ApiTurnPrompt {
  const { messages, compacted } = selectApiContext(room, options);
  const { prompt, tail } = buildAgentPromptForApi(agent, role, messages);
  // 'new-chat' is the honest description of a stateless call; 'compact' adds the
  // note that older discussion is a digest. Round/role markers are detected on
  // the turn-specific tail only, so quoted discussion text can't trigger them.
  const decorated = decoratePromptForContextMode(prompt, compacted ? 'compact' : 'new-chat', tail);
  const budget = lengthBudgetInstruction(options.answerLength ?? 'normal', agent.id === MEETING_FACILITATOR_AGENT_ID);
  return { prompt: budget ? `${decorated}\n\n${budget}` : decorated, compacted };
}
