import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { parseJsonBlock } from '@/lib/decisionVoting';
import type { Message } from '@/types/domain';

export type ObjectionSeverity = 'blocker' | 'major' | 'minor';

export interface Objection {
  topic: string;
  objection: string;
  /** Who or what is objected to; empty when the specialist named no target. */
  against: string;
  severity: ObjectionSeverity;
}

export interface RaisedObjection extends Objection {
  agentId: string;
  author: string;
  role: string;
}

const MARKER = 'VC_OBJECTIONS';
const MAX_PER_MESSAGE = 5;
const SEVERITY_ORDER: Record<ObjectionSeverity, number> = { blocker: 0, major: 1, minor: 2 };

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/** Objections from one message's VC_OBJECTIONS block; malformed entries are dropped, never guessed. */
export function parseObjections(content: string): Objection[] {
  const raw = parseJsonBlock<{ objections?: unknown }>(content, MARKER);
  if (!raw || !Array.isArray(raw.objections)) return [];
  return raw.objections.slice(0, MAX_PER_MESSAGE).flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Record<string, unknown>;
    const topic = text(candidate.topic);
    const objection = text(candidate.objection);
    const severity = candidate.severity;
    if (!topic || !objection) return [];
    return [{
      topic,
      objection,
      against: text(candidate.against),
      severity: severity === 'blocker' || severity === 'minor' ? severity : 'major',
    } satisfies Objection];
  });
}

/**
 * Every objection specialists put on the record, strongest first. When a
 * specialist re-sent the block (a regenerated reply), only their latest
 * message counts so the same objection is not listed twice.
 */
export function collectObjections(messages: readonly Message[]): RaisedObjection[] {
  const latestByAgent = new Map<string, Message>();
  for (const message of messages) {
    if (message.authorType !== 'agent' || !message.authorId || message.authorId === MEETING_FACILITATOR_AGENT_ID) continue;
    if (!message.content.includes(MARKER)) continue;
    latestByAgent.set(message.authorId, message);
  }
  return [...latestByAgent.values()]
    .flatMap(message => parseObjections(message.content).map(objection => ({
      ...objection,
      agentId: message.authorId!,
      author: message.authorNameSnapshot ?? message.authorId!,
      role: message.roleNameSnapshot ?? '',
    })))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
