import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';

const KEY = 'virtual-company:meeting-orchestration:v1';
export const MEETING_ORCHESTRATION_EVENT = 'virtual-company:meeting-orchestration-changed';

export type MeetingPhase = 'open' | 'collect' | 'challenge' | 'resolve' | 'decision' | 'actions' | 'closed';
export type SpeakerStatus = 'waiting' | 'responded' | 'skipped';
export type ExternalChatProvider = 'ChatGPT' | 'Gemini' | 'Claude' | 'Copilot' | 'Other';

export interface ExternalAgentChat {
  agentId: string;
  provider: ExternalChatProvider;
  url: string;
  updatedAt: number;
}

export interface MeetingRoomState {
  roomId: string;
  phase: MeetingPhase;
  rounds: string[];
  roundIndex: number;
  speakerOrder: string[];
  speakerStatus: Record<string, SpeakerStatus>;
  activeSpeakerId?: string;
  startedAt?: number;
  closedAt?: number;
  updatedAt: number;
}

export interface MeetingOrchestrationState {
  rooms: Record<string, MeetingRoomState>;
  chats: Record<string, ExternalAgentChat>;
}

const DEFAULT_ROUNDS = ['Initial opinions', 'Critique', 'Revised proposals', 'Final decision'];

function defaults(): MeetingOrchestrationState {
  return { rooms: {}, chats: {} };
}

export function loadMeetingOrchestration(): MeetingOrchestrationState {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '') as Partial<MeetingOrchestrationState>;
    return {
      rooms: parsed.rooms ?? {},
      chats: parsed.chats ?? {},
    };
  } catch {
    return defaults();
  }
}

export function saveMeetingOrchestration(state: MeetingOrchestrationState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(MEETING_ORCHESTRATION_EVENT));
}

function orderedAgents(agentIds: string[]): string[] {
  return [...new Set(agentIds)].sort((left, right) => {
    if (left === MEETING_FACILITATOR_AGENT_ID) return -1;
    if (right === MEETING_FACILITATOR_AGENT_ID) return 1;
    return 0;
  });
}

function statuses(agentIds: string[], current?: Record<string, SpeakerStatus>): Record<string, SpeakerStatus> {
  return Object.fromEntries(agentIds.map(id => [id, current?.[id] ?? 'waiting'])) as Record<string, SpeakerStatus>;
}

export function ensureMeetingRoom(roomId: string, agentIds: string[]): MeetingRoomState {
  const state = loadMeetingOrchestration();
  const order = orderedAgents(agentIds);
  const existing = state.rooms[roomId];
  const next: MeetingRoomState = existing
    ? {
        ...existing,
        speakerOrder: order,
        speakerStatus: statuses(order, existing.speakerStatus),
        ...(existing.activeSpeakerId && order.includes(existing.activeSpeakerId)
          ? { activeSpeakerId: existing.activeSpeakerId }
          : order[0] ? { activeSpeakerId: order[0] } : {}),
        updatedAt: Date.now(),
      }
    : {
        roomId,
        phase: 'open',
        rounds: [...DEFAULT_ROUNDS],
        roundIndex: 0,
        speakerOrder: order,
        speakerStatus: statuses(order),
        ...(order[0] ? { activeSpeakerId: order[0] } : {}),
        updatedAt: Date.now(),
      };
  saveMeetingOrchestration({ ...state, rooms: { ...state.rooms, [roomId]: next } });
  return next;
}

export function setMeetingPhase(roomId: string, phase: MeetingPhase): void {
  const state = loadMeetingOrchestration();
  const current = state.rooms[roomId];
  if (!current) return;
  const stamp = Date.now();
  saveMeetingOrchestration({
    ...state,
    rooms: {
      ...state.rooms,
      [roomId]: {
        ...current,
        phase,
        ...(phase !== 'open' && !current.startedAt ? { startedAt: stamp } : {}),
        ...(phase === 'closed' ? { closedAt: stamp } : {}),
        updatedAt: stamp,
      },
    },
  });
}

export function setMeetingRound(roomId: string, roundIndex: number): void {
  const state = loadMeetingOrchestration();
  const current = state.rooms[roomId];
  if (!current) return;
  const index = Math.max(0, Math.min(roundIndex, current.rounds.length - 1));
  const status = statuses(current.speakerOrder);
  saveMeetingOrchestration({
    ...state,
    rooms: {
      ...state.rooms,
      [roomId]: {
        ...current,
        roundIndex: index,
        speakerStatus: status,
        ...(current.speakerOrder[0] ? { activeSpeakerId: current.speakerOrder[0] } : {}),
        updatedAt: Date.now(),
      },
    },
  });
}

export function renameMeetingRound(roomId: string, roundIndex: number, name: string): void {
  const state = loadMeetingOrchestration();
  const current = state.rooms[roomId];
  const clean = name.trim();
  if (!current || !clean || !current.rounds[roundIndex]) return;
  const rounds = [...current.rounds];
  rounds[roundIndex] = clean;
  saveMeetingOrchestration({ ...state, rooms: { ...state.rooms, [roomId]: { ...current, rounds, updatedAt: Date.now() } } });
}

export function markSpeakerStatus(roomId: string, agentId: string, status: SpeakerStatus): void {
  const state = loadMeetingOrchestration();
  const current = state.rooms[roomId];
  if (!current || !current.speakerOrder.includes(agentId)) return;
  const speakerStatus = { ...current.speakerStatus, [agentId]: status };
  const nextWaiting = current.speakerOrder.find(id => speakerStatus[id] === 'waiting');
  saveMeetingOrchestration({
    ...state,
    rooms: {
      ...state.rooms,
      [roomId]: {
        ...current,
        speakerStatus,
        ...(nextWaiting ? { activeSpeakerId: nextWaiting } : {}),
        updatedAt: Date.now(),
      },
    },
  });
}

export function setActiveSpeaker(roomId: string, agentId: string): void {
  const state = loadMeetingOrchestration();
  const current = state.rooms[roomId];
  if (!current || !current.speakerOrder.includes(agentId)) return;
  saveMeetingOrchestration({ ...state, rooms: { ...state.rooms, [roomId]: { ...current, activeSpeakerId: agentId, updatedAt: Date.now() } } });
}

export function setExternalAgentChat(agentId: string, provider: ExternalChatProvider, url: string): void {
  const state = loadMeetingOrchestration();
  const clean = url.trim();
  if (!clean) {
    const chats = { ...state.chats };
    delete chats[agentId];
    saveMeetingOrchestration({ ...state, chats });
    return;
  }
  saveMeetingOrchestration({
    ...state,
    chats: { ...state.chats, [agentId]: { agentId, provider, url: clean, updatedAt: Date.now() } },
  });
}

export function getExternalAgentChat(agentId: string): ExternalAgentChat | undefined {
  return loadMeetingOrchestration().chats[agentId];
}
