const KEY = 'virtual-company:meeting-orchestration:v1';
const FACILITATOR_ID = 'agent-olivia';
const DEFAULT_ROUNDS = ['Initial opinions', 'Critique', 'Revised proposals', 'Final decision'];
const PHASES = new Set(['open', 'collect', 'challenge', 'resolve', 'decision', 'actions', 'closed']);
const ROUND_STAGES = new Set(['opening', 'specialists', 'synthesis', 'complete']);
const SPEAKER_STATUSES = new Set(['waiting', 'responded', 'skipped']);

interface RecoveredRoomState {
  roomId: string;
  phase: string;
  rounds: string[];
  roundIndex: number;
  roundStage: string;
  speakerOrder: string[];
  speakerStatus: Record<string, string>;
  objective?: string;
  expectedOutcome?: string;
  decisionQuestion?: string;
  activeSpeakerId?: string;
  startedAt?: number;
  closedAt?: number;
  updatedAt: number;
}

interface RecoveredChatState {
  agentId: string;
  url: string;
  provider?: string;
  updatedAt: number;
}

export interface RecoveredMeetingOrchestrationState {
  rooms: Record<string, RecoveredRoomState>;
  chats: Record<string, RecoveredChatState>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text || undefined;
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const text = cleanString(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function finiteTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function normalizeRounds(value: unknown): string[] {
  const rounds = uniqueStrings(value);
  return rounds.length > 0 ? rounds : [...DEFAULT_ROUNDS];
}

function normalizeRoundIndex(value: unknown, roundCount: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.max(0, Math.min(numeric, Math.max(0, roundCount - 1)));
}

function normalizeSpeakerStatus(value: unknown, speakerOrder: string[]): Record<string, string> {
  const raw = isRecord(value) ? value : {};
  return Object.fromEntries(speakerOrder.map(agentId => {
    const status = raw[agentId];
    return [agentId, typeof status === 'string' && SPEAKER_STATUSES.has(status) ? status : 'waiting'];
  }));
}

function inferRoundStage(speakerOrder: string[], speakerStatus: Record<string, string>): string {
  const hasFacilitator = speakerOrder.includes(FACILITATOR_ID);
  if (hasFacilitator && speakerStatus[FACILITATOR_ID] !== 'responded') return 'opening';
  const specialistWaiting = speakerOrder.some(
    agentId => agentId !== FACILITATOR_ID && speakerStatus[agentId] === 'waiting',
  );
  if (specialistWaiting) return 'specialists';
  return hasFacilitator ? 'synthesis' : 'complete';
}

function fallbackActiveSpeaker(
  roundStage: string,
  speakerOrder: string[],
  speakerStatus: Record<string, string>,
): string | undefined {
  if (roundStage === 'complete') return undefined;
  if (roundStage === 'opening' && speakerOrder.includes(FACILITATOR_ID)) return FACILITATOR_ID;
  if (roundStage === 'synthesis' && speakerOrder.includes(FACILITATOR_ID)) return FACILITATOR_ID;
  if (roundStage === 'specialists') {
    return speakerOrder.find(agentId => agentId !== FACILITATOR_ID && speakerStatus[agentId] === 'waiting')
      ?? speakerOrder.find(agentId => agentId !== FACILITATOR_ID)
      ?? speakerOrder[0];
  }
  return speakerOrder.find(agentId => speakerStatus[agentId] === 'waiting') ?? speakerOrder[0];
}

function normalizeRoom(roomKey: string, value: unknown): RecoveredRoomState {
  const raw = isRecord(value) ? value : {};
  const roomId = cleanString(raw.roomId) ?? roomKey;
  const rounds = normalizeRounds(raw.rounds);
  const roundIndex = normalizeRoundIndex(raw.roundIndex, rounds.length);
  const speakerOrder = uniqueStrings(raw.speakerOrder);
  const speakerStatus = normalizeSpeakerStatus(raw.speakerStatus, speakerOrder);
  const roundStage = typeof raw.roundStage === 'string' && ROUND_STAGES.has(raw.roundStage)
    ? raw.roundStage
    : inferRoundStage(speakerOrder, speakerStatus);
  const phase = typeof raw.phase === 'string' && PHASES.has(raw.phase)
    ? raw.phase
    : roundIndex === 0 && roundStage === 'opening'
      ? 'open'
      : ['collect', 'challenge', 'resolve', 'decision'][Math.min(roundIndex, 3)] ?? 'collect';
  const savedActiveSpeaker = cleanString(raw.activeSpeakerId);
  const activeSpeakerId = savedActiveSpeaker && speakerOrder.includes(savedActiveSpeaker)
    ? savedActiveSpeaker
    : fallbackActiveSpeaker(roundStage, speakerOrder, speakerStatus);
  const objective = cleanString(raw.objective);
  const expectedOutcome = cleanString(raw.expectedOutcome);
  const decisionQuestion = cleanString(raw.decisionQuestion);
  const startedAt = finiteTimestamp(raw.startedAt);
  const closedAt = finiteTimestamp(raw.closedAt);
  const updatedAt = finiteTimestamp(raw.updatedAt) ?? Date.now();

  return {
    roomId,
    phase,
    rounds,
    roundIndex,
    roundStage,
    speakerOrder,
    speakerStatus,
    ...(objective ? { objective } : {}),
    ...(expectedOutcome ? { expectedOutcome } : {}),
    ...(decisionQuestion ? { decisionQuestion } : {}),
    ...(activeSpeakerId ? { activeSpeakerId } : {}),
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(closedAt !== undefined ? { closedAt } : {}),
    updatedAt,
  };
}

function normalizeChat(agentId: string, value: unknown): RecoveredChatState | null {
  if (!isRecord(value)) return null;
  const url = cleanString(value.url);
  if (!url) return null;
  const provider = cleanString(value.provider);
  return {
    agentId,
    url,
    ...(provider ? { provider } : {}),
    updatedAt: finiteTimestamp(value.updatedAt) ?? Date.now(),
  };
}

/**
 * Normalizes persisted meeting metadata without touching room messages or
 * workspace data. This module is intentionally standalone so it can run before
 * React renders and before meetingOrchestration.ts trusts the stored shape.
 */
export function normalizeMeetingOrchestrationValue(value: unknown): RecoveredMeetingOrchestrationState {
  const raw = isRecord(value) ? value : {};
  const rawRooms = isRecord(raw.rooms) ? raw.rooms : {};
  const rawChats = isRecord(raw.chats) ? raw.chats : {};

  const rooms = Object.fromEntries(
    Object.entries(rawRooms).map(([roomId, room]) => [roomId, normalizeRoom(roomId, room)]),
  );
  const chats = Object.fromEntries(
    Object.entries(rawChats).flatMap(([agentId, chat]) => {
      const normalized = normalizeChat(agentId, chat);
      return normalized ? [[agentId, normalized] as const] : [];
    }),
  );

  return { rooms, chats };
}

export function repairMeetingOrchestrationStorage(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      localStorage.setItem(KEY, JSON.stringify({ rooms: {}, chats: {} }));
      return true;
    }

    const normalized = normalizeMeetingOrchestrationValue(parsed);
    const next = JSON.stringify(normalized);
    if (next === JSON.stringify(parsed)) return false;
    localStorage.setItem(KEY, next);
    return true;
  } catch {
    // Startup recovery is best-effort. Storage denial/quota errors must not
    // prevent React from mounting and showing the normal recovery boundary.
    return false;
  }
}
