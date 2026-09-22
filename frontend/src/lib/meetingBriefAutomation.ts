import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { loadMeetingOrchestration, setMeetingBrief } from '@/lib/meetingOrchestration';
import type { Message } from '@/types/domain';

export interface OliviaMeetingBrief {
  objective: string;
  expectedOutcome: string;
  decisionQuestion: string;
  needsClarification?: boolean;
  clarificationQuestion?: string;
}

function cleanText(value: unknown, maxLength = 1600): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function parseStructuredBrief(content: string): OliviaMeetingBrief | null {
  const match = content.match(/VC_MEETING_BRIEF\s*```(?:json)?\s*([\s\S]*?)```/i);
  if (!match?.[1]) return null;

  try {
    const raw = JSON.parse(match[1]) as Record<string, unknown>;
    const objective = cleanText(raw.objective);
    const expectedOutcome = cleanText(raw.expectedOutcome);
    const decisionQuestion = cleanText(raw.decisionQuestion);
    const needsClarification = raw.needsClarification === true;
    const clarificationQuestion = cleanText(raw.clarificationQuestion, 600);

    if (needsClarification) {
      return {
        objective,
        expectedOutcome,
        decisionQuestion,
        needsClarification: true,
        ...(clarificationQuestion ? { clarificationQuestion } : {}),
      };
    }

    if (!objective || !expectedOutcome || !decisionQuestion) return null;
    return { objective, expectedOutcome, decisionQuestion };
  } catch {
    return null;
  }
}

function stripMarkdownDecorators(value: string): string {
  return value
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .trim();
}

function parseLegacyBrief(content: string): OliviaMeetingBrief | null {
  const normalized = stripMarkdownDecorators(content);
  const objectiveMatch = normalized.match(/(?:^|\n)\s*Objective\s*:?\s*([\s\S]*?)(?=\n\s*Expected\s+Outcome\s*:)/i);
  const outcomeMatch = normalized.match(/(?:^|\n)\s*Expected\s+Outcome\s*:?\s*([\s\S]*?)(?=\n\s*Decision\s+Question\s*:)/i);
  const decisionMatch = normalized.match(/(?:^|\n)\s*Decision\s+Question\s*:?\s*([\s\S]*?)(?=\n\s*(?:VC_|Meeting\s+status|Facts\s+established|Assumptions|$))/i)
    ?? normalized.match(/(?:^|\n)\s*Decision\s+Question\s*:?\s*([\s\S]*)$/i);

  const objective = cleanText(objectiveMatch?.[1]);
  const expectedOutcome = cleanText(outcomeMatch?.[1]);
  const decisionQuestion = cleanText(decisionMatch?.[1]);
  if (!objective || !expectedOutcome || !decisionQuestion) return null;
  return { objective, expectedOutcome, decisionQuestion };
}

export function parseOliviaMeetingBrief(content: string): OliviaMeetingBrief | null {
  return parseStructuredBrief(content) ?? parseLegacyBrief(content);
}

export function findLatestOliviaMeetingBrief(
  messages: Array<Pick<Message, 'authorType' | 'authorId' | 'content'>>,
): OliviaMeetingBrief | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.authorType !== 'agent' || message.authorId !== MEETING_FACILITATOR_AGENT_ID) continue;
    const brief = parseOliviaMeetingBrief(message.content);
    if (brief) return brief;
  }
  return null;
}

export function applyOliviaMeetingBrief(roomId: string, brief: OliviaMeetingBrief): boolean {
  if (brief.needsClarification) return false;
  const current = loadMeetingOrchestration().rooms[roomId];
  if (!current) return false;

  const patch = {
    ...(!current.objective?.trim() && brief.objective ? { objective: brief.objective } : {}),
    ...(!current.expectedOutcome?.trim() && brief.expectedOutcome ? { expectedOutcome: brief.expectedOutcome } : {}),
    ...(!current.decisionQuestion?.trim() && brief.decisionQuestion ? { decisionQuestion: brief.decisionQuestion } : {}),
  };
  if (Object.keys(patch).length === 0) return false;
  setMeetingBrief(roomId, patch);
  return true;
}

export function backfillMeetingBriefFromMessages(
  roomId: string,
  messages: Array<Pick<Message, 'authorType' | 'authorId' | 'content'>>,
): boolean {
  const brief = findLatestOliviaMeetingBrief(messages);
  return brief ? applyOliviaMeetingBrief(roomId, brief) : false;
}
