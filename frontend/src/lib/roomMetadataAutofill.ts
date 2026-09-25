import { findLatestDecisionProposal } from '@/lib/decisionVoting';
import type { MeetingRoomState } from '@/lib/meetingOrchestration';
import type { DecisionRecord, ProjectDefinition, Room, RoomKnowledgePack } from '@/types/domain';

const EMPTY_KNOWLEDGE: RoomKnowledgePack = {
  objective: '',
  background: '',
  constraints: '',
  requirements: '',
  links: '',
};

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const MAX_BACKGROUND_CHARS = 1400;
const MAX_LINKS = 12;

function clean(value: string | undefined): string {
  return value?.trim() ?? '';
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.map(item => item.trim()).filter(Boolean)) {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[),.;!?\]}]+$/g, '');
}

function extractLinks(room: Room, project: ProjectDefinition | undefined, decisions: DecisionRecord[]): string[] {
  const sources = [
    project?.description ?? '',
    ...room.messages.map(message => message.content),
    ...decisions.flatMap(decision => [decision.details, decision.evidence ?? '']),
  ];
  return unique(
    sources.flatMap(source => (source.match(URL_PATTERN) ?? []).map(trimTrailingPunctuation)),
  ).slice(0, MAX_LINKS);
}

function firstUserRequest(room: Room): string {
  const content = room.messages.find(message => message.authorType === 'user')?.content.trim() ?? '';
  if (!content) return '';
  return content.length > MAX_BACKGROUND_CHARS
    ? `${content.slice(0, MAX_BACKGROUND_CHARS).trimEnd()}…`
    : content;
}

function buildBackground(room: Room, project: ProjectDefinition | undefined, objective: string): string {
  const projectDescription = clean(project?.description);
  const initialRequest = firstUserRequest(room);
  const parts: string[] = [];

  if (projectDescription && projectDescription !== objective) parts.push(projectDescription);
  if (initialRequest && initialRequest !== objective && initialRequest !== projectDescription) {
    parts.push(`Initial request:\n${initialRequest}`);
  }
  return parts.join('\n\n');
}

function buildConstraints(room: Room): string {
  const proposal = findLatestDecisionProposal(room.messages)?.proposal;
  if (!proposal) return '';
  return proposal.checklist
    .filter(item => item.status === 'blocker' || item.status === 'condition')
    .map(item => {
      const prefix = item.status === 'blocker' ? '[BLOCKER]' : '[CONDITION]';
      return `• ${prefix} ${item.item}${item.evidence ? ` — ${item.evidence}` : ''}`;
    })
    .join('\n');
}

function buildRequirements(meeting: MeetingRoomState | undefined): string {
  if (!meeting) return '';
  const parts: string[] = [];
  const expectedOutcome = clean(meeting.expectedOutcome);
  const decisionQuestion = clean(meeting.decisionQuestion);
  if (expectedOutcome) parts.push(`Expected outcome:\n${expectedOutcome}`);
  if (decisionQuestion) parts.push(`Decision question:\n${decisionQuestion}`);
  return parts.join('\n\n');
}

function proposedTags(
  room: Room,
  project: ProjectDefinition | undefined,
  meeting: MeetingRoomState | undefined,
): string[] {
  const explicitMessageTags = room.messages.flatMap(message => message.tags ?? []);
  const proposal = findLatestDecisionProposal(room.messages)?.proposal;
  return unique([
    ...(project?.tags ?? []),
    ...explicitMessageTags,
    ...(meeting ? ['meeting'] : []),
    ...(proposal ? [`decision-${proposal.outcome.toLocaleLowerCase().replaceAll('_', '-')}`] : []),
  ]);
}

function proposedAgenda(meeting: MeetingRoomState | undefined): string[] {
  return unique(meeting?.rounds ?? []);
}

function sameStrings(left: string[] | undefined, right: string[]): boolean {
  const current = left ?? [];
  return current.length === right.length && current.every((value, index) => value === right[index]);
}

export interface RoomMetadataAutofillInput {
  room: Room;
  project?: ProjectDefinition | undefined;
  meeting?: MeetingRoomState | undefined;
  decisions: DecisionRecord[];
}

/**
 * Build a conservative room patch from structured workspace data.
 * Existing user-authored values always win: only empty knowledge fields and
 * empty tag/agenda collections are populated automatically.
 */
export function deriveRoomMetadataAutofillPatch({
  room,
  project,
  meeting,
  decisions,
}: RoomMetadataAutofillInput): Partial<Room> | null {
  const roomDecisions = decisions.filter(item => item.roomId === room.id);
  const currentKnowledge = { ...EMPTY_KNOWLEDGE, ...room.knowledge };
  const objective = clean(meeting?.objective) || clean(project?.description) || firstUserRequest(room);
  const suggestions: RoomKnowledgePack = {
    objective,
    background: buildBackground(room, project, objective),
    constraints: buildConstraints(room),
    requirements: buildRequirements(meeting),
    links: extractLinks(room, project, roomDecisions).join('\n'),
  };

  let knowledgeChanged = false;
  const nextKnowledge: RoomKnowledgePack = { ...currentKnowledge };
  (Object.keys(EMPTY_KNOWLEDGE) as Array<keyof RoomKnowledgePack>).forEach(key => {
    if (clean(currentKnowledge[key]) || !clean(suggestions[key])) return;
    nextKnowledge[key] = suggestions[key];
    knowledgeChanged = true;
  });

  const tags = proposedTags(room, project, meeting);
  const shouldFillTags = (room.tags?.length ?? 0) === 0 && tags.length > 0;
  const agenda = proposedAgenda(meeting);
  const shouldFillAgenda = (room.agenda?.length ?? 0) === 0 && agenda.length > 0;

  if (!knowledgeChanged && !shouldFillTags && !shouldFillAgenda) return null;

  return {
    ...(knowledgeChanged ? { knowledge: nextKnowledge } : {}),
    ...(shouldFillTags && !sameStrings(room.tags, tags) ? { tags } : {}),
    ...(shouldFillAgenda && !sameStrings(room.agenda, agenda) ? { agenda } : {}),
  };
}
