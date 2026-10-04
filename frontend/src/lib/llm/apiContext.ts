import { compactMessageList, decoratePromptForContextMode } from '@/lib/contextModes';
import { findLatestDecisionProposal } from '@/lib/decisionVoting';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { getLlmSettings, type AnswerLength, type LlmSettings } from '@/lib/llm/llmSettings';
import { ensureMeetingRoom } from '@/lib/meetingOrchestration';
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
  /** Hide other specialists' answers from first opinions and final votes. Off unless asked for. */
  independentOpinions?: boolean;
}

/** The options every API prompt should be built with, from the saved settings. */
export function apiContextOptions(settings: LlmSettings = getLlmSettings()): ApiContextOptions {
  return { tokenSaver: settings.tokenSaver, answerLength: settings.answerLength, independentOpinions: settings.independentOpinions };
}

export type IndependentTurnKind = 'opinions' | 'vote';

const INDEPENDENCE_NOTE: Record<IndependentTurnKind, string> = {
  opinions: 'INDEPENDENT OPINION: the other specialists are answering this same question separately, and their answers are deliberately hidden from you so the group does not simply echo the first voice. Give your own view from your professional scope. If you see a problem, say so; if you do not, do not invent one.',
  vote: 'INDEPENDENT VOTE: the other specialists are voting separately and their votes are hidden from you. Vote on the proposal as written, from your own professional scope, and do not assume a majority.',
};

/**
 * Whether this specialist's turn must be answered without reading the other
 * specialists: the first opinion (opening round) and the final vote (last
 * round). The critique and revision rounds are where specialists respond to
 * each other, so they see everything. Meetings with fewer than two rounds have
 * no separate opinion or vote round.
 */
export function independentTurnKind(room: Room, agent: Agent): IndependentTurnKind | null {
  if (agent.id === MEETING_FACILITATOR_AGENT_ID) return null;
  const meeting = ensureMeetingRoom(room.id, room.agentIds);
  if (meeting.roundStage !== 'specialists' || meeting.rounds.length < 2) return null;
  if (meeting.roundIndex === 0) return 'opinions';
  if (meeting.roundIndex === meeting.rounds.length - 1) return 'vote';
  return null;
}

function isOtherSpecialist(message: Message, agent: Agent): boolean {
  return message.authorType === 'agent' && message.authorId !== agent.id && message.authorId !== MEETING_FACILITATOR_AGENT_ID;
}

/**
 * The room as this specialist is allowed to see it. Opinions: no other
 * specialist's messages. Vote: everything up to and including Olivia's latest
 * proposal, then nobody else's reply. Everyone in the same stage gets the same
 * view, so the shared prompt prefix stays identical across specialists and the
 * provider's cache still applies.
 */
export function hideOtherSpecialists(room: Room, agent: Agent, kind: IndependentTurnKind): Room {
  if (kind === 'opinions') return { ...room, messages: room.messages.filter(message => !isOtherSpecialist(message, agent)) };
  const proposal = findLatestDecisionProposal(room.messages);
  if (!proposal) return room;
  const cut = room.messages.indexOf(proposal.message);
  return { ...room, messages: room.messages.filter((message, index) => index <= cut || !isOtherSpecialist(message, agent)) };
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
  /** Set when other specialists' answers were hidden from this turn. */
  independent: IndependentTurnKind | null;
}

export function buildApiTurnPrompt(
  room: Room,
  agent: Agent,
  role: RoleDefinition,
  options: ApiContextOptions = {},
): ApiTurnPrompt {
  const independent = options.independentOpinions === true ? independentTurnKind(room, agent) : null;
  const { messages, compacted } = selectApiContext(independent ? hideOtherSpecialists(room, agent, independent) : room, options);
  const { prompt, tail } = buildAgentPromptForApi(agent, role, messages);
  // 'new-chat' is the honest description of a stateless call; 'compact' adds the
  // note that older discussion is a digest. Round/role markers are detected on
  // the turn-specific tail only, so quoted discussion text can't trigger them.
  const decorated = decoratePromptForContextMode(prompt, compacted ? 'compact' : 'new-chat', tail);
  const budget = lengthBudgetInstruction(options.answerLength ?? 'normal', agent.id === MEETING_FACILITATOR_AGENT_ID);
  const withNote = independent ? `${decorated}\n\n${INDEPENDENCE_NOTE[independent]}` : decorated;
  return { prompt: budget ? `${withNote}\n\n${budget}` : withNote, compacted, independent };
}
