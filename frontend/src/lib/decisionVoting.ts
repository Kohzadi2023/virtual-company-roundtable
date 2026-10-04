import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import type { MeetingRoomState } from '@/lib/meetingOrchestration';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { ActionItem, Message, Room, RoomVote, VoteChoice } from '@/types/domain';

export type DecisionOutcome = 'GO' | 'NO_GO' | 'CONDITIONAL_GO' | 'DEFER';
export type DecisionChecklistStatus = 'satisfied' | 'condition' | 'blocker';

export interface DecisionChecklistItem {
  item: string;
  status: DecisionChecklistStatus;
  evidence?: string;
}

export interface DecisionFollowUpRecommendation {
  title: string;
  reason: string;
}

export interface OliviaDecisionProposal {
  title: string;
  outcome: DecisionOutcome;
  details: string;
  checklist: DecisionChecklistItem[];
  voteQuestion: string;
  followUp?: DecisionFollowUpRecommendation | undefined;
}

export interface SpecialistDecisionVote {
  choice: VoteChoice;
  rationale: string;
  conditions: string[];
}

export interface DecisionProposalRecord {
  message: Message;
  proposal: OliviaDecisionProposal;
}

const PROPOSAL_MARKER = 'VC_DECISION_PROPOSAL';
const VOTE_MARKER = 'VC_DECISION_VOTE';
const DECISION_EVIDENCE_PREFIX = `${PROPOSAL_MARKER}:`;
const VOTE_ID_PREFIX = 'vc-decision-vote:';

export function parseJsonBlock<T>(content: string, marker: string): T | null {
  const markerIndex = content.lastIndexOf(marker);
  if (markerIndex < 0) return null;
  const tail = content.slice(markerIndex + marker.length);
  const fenced = tail.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced?.[1]?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseOliviaDecisionProposal(content: string): OliviaDecisionProposal | null {
  const raw = parseJsonBlock<Record<string, unknown>>(content, PROPOSAL_MARKER);
  if (!raw) return null;

  const title = cleanString(raw.title);
  const details = cleanString(raw.details);
  const voteQuestion = cleanString(raw.voteQuestion) || 'Do you support this decision proposal as written?';
  const outcome = raw.outcome;
  if (!title || !details || !['GO', 'NO_GO', 'CONDITIONAL_GO', 'DEFER'].includes(String(outcome))) return null;

  const checklist = Array.isArray(raw.checklist)
    ? raw.checklist.flatMap(item => {
        if (!item || typeof item !== 'object') return [];
        const candidate = item as Record<string, unknown>;
        const text = cleanString(candidate.item);
        const status = candidate.status;
        if (!text || !['satisfied', 'condition', 'blocker'].includes(String(status))) return [];
        const evidence = cleanString(candidate.evidence);
        return [{
          item: text,
          status: status as DecisionChecklistStatus,
          ...(evidence ? { evidence } : {}),
        } satisfies DecisionChecklistItem];
      })
    : [];

  if (checklist.length === 0) return null;

  const followUpTitle = cleanString(raw.followUpTitle);
  const followUpReason = cleanString(raw.followUpReason);
  const followUp = raw.followUpNeeded === true && followUpTitle
    ? { title: followUpTitle, reason: followUpReason }
    : undefined;

  return { title, outcome: outcome as DecisionOutcome, details, checklist, voteQuestion, ...(followUp ? { followUp } : {}) };
}

export function parseSpecialistDecisionVote(content: string): SpecialistDecisionVote | null {
  const raw = parseJsonBlock<Record<string, unknown>>(content, VOTE_MARKER);
  if (!raw) return null;
  const choice = raw.choice;
  if (!['agree', 'concern', 'disagree', 'abstain'].includes(String(choice))) return null;
  const rationale = cleanString(raw.rationale);
  const conditions = Array.isArray(raw.conditions)
    ? raw.conditions.map(cleanString).filter(Boolean)
    : [];
  return { choice: choice as VoteChoice, rationale, conditions };
}

export function findLatestDecisionProposal(messages: Message[]): DecisionProposalRecord | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;
    if (message.authorType !== 'agent' || message.authorId !== MEETING_FACILITATOR_AGENT_ID) continue;
    const proposal = parseOliviaDecisionProposal(message.content);
    if (proposal) return { message, proposal };
  }
  return null;
}

export function decisionEvidenceForMessage(messageId: string): string {
  return `${DECISION_EVIDENCE_PREFIX}${messageId}`;
}

const CHECKLIST_ROOM_NAME_MAX = 60;

/** An action item already tracking this checklist item's follow-up, if one was created. */
export function findChecklistFollowUp(
  actionItems: ActionItem[],
  decisionId: string,
  checklistItemText: string,
): ActionItem | undefined {
  return actionItems.find(action => action.sourceDecisionId === decisionId && action.title === checklistItemText);
}

export function buildChecklistFollowUpRoomName(checklistItemText: string): string {
  const label = checklistItemText.length > CHECKLIST_ROOM_NAME_MAX
    ? `${checklistItemText.slice(0, CHECKLIST_ROOM_NAME_MAX - 1).trimEnd()}…`
    : checklistItemText;
  return `Follow-up: ${label}`;
}

export function buildChecklistFollowUpSeedMessage(
  decisionTitle: string,
  outcome: DecisionOutcome,
  checklistItemText: string,
  checklistItemEvidence: string | undefined,
): string {
  return [
    `Follow-up requested from the decision "${decisionTitle}" (${outcome.replaceAll('_', ' ')}).`,
    '',
    'Checklist item to resolve:',
    checklistItemText,
    ...(checklistItemEvidence ? ['', `Evidence noted: ${checklistItemEvidence}`] : []),
    '',
    'Continue the discussion here until this item is resolved.',
  ].join('\n');
}

export function buildDecisionFollowUpSeedMessage(
  decisionTitle: string,
  outcome: DecisionOutcome,
  followUp: DecisionFollowUpRecommendation,
  openItems: readonly DecisionChecklistItem[],
): string {
  const openLines = openItems.map(item => `- ${item.item}${item.evidence ? ` (${item.evidence})` : ''}`);
  return [
    `Follow-up meeting for the decision "${decisionTitle}" (${outcome.replaceAll('_', ' ')}).`,
    '',
    `Olivia's reason for this follow-up: ${followUp.reason || 'Unresolved items remain from the decision checklist.'}`,
    ...(openLines.length > 0 ? ['', 'Open checklist items to resolve:', ...openLines] : []),
    '',
    'Continue the discussion here until these are resolved.',
  ].join('\n');
}

/**
 * - unanimous: every eligible specialist voted agree.
 * - direction: everyone voted, nobody disagreed, and at least one concern
 *   was raised. The direction is settled; the concerns are conditions to
 *   record, not a reason for another proposal/vote cycle.
 * - split: at least one disagree (or nobody supports the proposal).
 * - incomplete: some eligible specialist has neither voted nor been skipped.
 */
export type DecisionConsensusStatus = 'unanimous' | 'direction' | 'split' | 'incomplete';

export interface DecisionConsensus {
  status: DecisionConsensusStatus;
  counts: Record<VoteChoice, number>;
  pendingAgentIds: string[];
}

export function assessDecisionConsensus(
  votes: Readonly<Record<string, VoteChoice>>,
  eligibleAgentIds: readonly string[],
  skippedAgentIds: readonly string[] = [],
): DecisionConsensus {
  const skipped = new Set(skippedAgentIds);
  const counts: Record<VoteChoice, number> = { agree: 0, concern: 0, disagree: 0, abstain: 0 };
  const pendingAgentIds: string[] = [];
  for (const agentId of eligibleAgentIds) {
    const choice = votes[agentId];
    if (choice) counts[choice] += 1;
    else if (!skipped.has(agentId)) pendingAgentIds.push(agentId);
  }
  const status: DecisionConsensusStatus = eligibleAgentIds.length === 0 || pendingAgentIds.length > 0
    ? 'incomplete'
    : counts.disagree > 0 || counts.agree + counts.concern === 0
      ? 'split'
      : counts.concern > 0 ? 'direction' : 'unanimous';
  return { status, counts, pendingAgentIds };
}

export function isConsensusReached(consensus: DecisionConsensus): boolean {
  return consensus.status === 'unanimous' || consensus.status === 'direction';
}

/**
 * True when the user spoke after the latest proposal — typically "Request
 * revision" despite a consensus. An explicit user request outranks the
 * consensus stop, so the stop is withdrawn until a new proposal is voted on.
 */
export function userSpokeAfterLatestProposal(messages: readonly Message[]): boolean {
  const record = findLatestDecisionProposal([...messages]);
  if (!record) return false;
  const proposalIndex = messages.indexOf(record.message);
  return messages.slice(proposalIndex + 1).some(message => message.authorType === 'user');
}

/** Consensus on the room's latest decision proposal, or null when there is no proposal yet. */
export function roomDecisionConsensus(
  room: Pick<Room, 'messages' | 'votes' | 'agentIds'>,
  meeting: Pick<MeetingRoomState, 'speakerOrder' | 'speakerStatus'> | undefined,
): DecisionConsensus | null {
  const record = findLatestDecisionProposal(room.messages);
  if (!record) return null;
  const vote = room.votes?.find(item => item.id === decisionVoteIdForMessage(record.message.id));
  const eligible = (meeting?.speakerOrder ?? room.agentIds).filter(id => id !== MEETING_FACILITATOR_AGENT_ID);
  const skipped = eligible.filter(id => meeting?.speakerStatus[id] === 'skipped');
  return assessDecisionConsensus(vote?.votes ?? {}, eligible, skipped);
}

export function decisionVoteIdForMessage(messageId: string): string {
  return `${VOTE_ID_PREFIX}${messageId}`;
}

export function syncDecisionVoting(roomId: string): void {
  const state = useWorkspaceStore.getState();
  const room = state.rooms.find(item => item.id === roomId);
  if (!room) return;

  const record = findLatestDecisionProposal(room.messages);
  if (!record) return;

  const projectId = room.projectId ?? state.projects[0]?.id;
  if (!projectId) return;

  const evidence = decisionEvidenceForMessage(record.message.id);
  let decision = state.decisions.find(item => item.roomId === roomId && item.evidence === evidence);
  const expectedDetails = `[${record.proposal.outcome}] ${record.proposal.details}`;

  if (!decision) {
    for (const older of state.decisions.filter(item => (
      item.roomId === roomId
      && item.status === 'proposed'
      && item.evidence?.startsWith(DECISION_EVIDENCE_PREFIX)
    ))) {
      state.updateDecision(older.id, { status: 'reversed' });
    }

    const decisionId = state.addDecision({
      projectId,
      roomId,
      title: record.proposal.title,
      details: expectedDetails,
      evidence,
      status: 'proposed',
    });
    if (!decisionId) return;
    decision = useWorkspaceStore.getState().decisions.find(item => item.id === decisionId);
  } else if (
    decision.status === 'proposed'
    && (decision.title !== record.proposal.title || decision.details !== expectedDetails)
  ) {
    state.updateDecision(decision.id, {
      title: record.proposal.title,
      details: expectedDetails,
    });
  }

  const voteId = decisionVoteIdForMessage(record.message.id);
  const refreshedRoom = useWorkspaceStore.getState().rooms.find(item => item.id === roomId);
  if (!refreshedRoom) return;
  const existingVote = refreshedRoom.votes?.find(item => item.id === voteId);
  if (!existingVote) {
    const vote: RoomVote = {
      id: voteId,
      question: record.proposal.voteQuestion,
      votes: {},
      createdAt: Date.now(),
    };
    useWorkspaceStore.setState(current => ({
      rooms: current.rooms.map(item => item.id === roomId
        ? { ...item, votes: [vote, ...(item.votes ?? [])] }
        : item),
    }));
  }

  const latestState = useWorkspaceStore.getState();
  const latestRoom = latestState.rooms.find(item => item.id === roomId);
  if (!latestRoom) return;
  const proposalIndex = latestRoom.messages.findIndex(item => item.id === record.message.id);
  if (proposalIndex < 0) return;

  const nextVotes: Record<string, VoteChoice> = {
    ...(latestRoom.votes?.find(item => item.id === voteId)?.votes ?? {}),
  };
  let changed = false;

  for (const message of latestRoom.messages.slice(proposalIndex + 1)) {
    if (message.authorType !== 'agent' || !message.authorId || message.authorId === MEETING_FACILITATOR_AGENT_ID) continue;
    const parsed = parseSpecialistDecisionVote(message.content);
    if (!parsed) continue;
    if (nextVotes[message.authorId] !== parsed.choice) {
      nextVotes[message.authorId] = parsed.choice;
      changed = true;
    }
  }

  if (!changed) return;
  useWorkspaceStore.setState(current => ({
    rooms: current.rooms.map(item => item.id === roomId
      ? {
          ...item,
          votes: (item.votes ?? []).map(vote => vote.id === voteId ? { ...vote, votes: nextVotes } : vote),
        }
      : item),
  }));
}
