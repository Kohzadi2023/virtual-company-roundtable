import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';

const KEY = 'virtual-company:meeting-orchestration:v1';
export const MEETING_ORCHESTRATION_EVENT = 'virtual-company:meeting-orchestration-changed';

export type MeetingPhase = 'open' | 'collect' | 'challenge' | 'resolve' | 'decision' | 'actions' | 'closed';
export type SpeakerStatus = 'waiting' | 'responded' | 'skipped';
export type RoundStage = 'opening' | 'specialists' | 'synthesis' | 'complete';
export type ExternalChatProvider = 'ChatGPT' | 'Gemini' | 'Claude' | 'Copilot' | 'DeepSeek' | 'Qwen' | 'Grok' | 'META' | 'Other';

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
  roundStage: RoundStage;
  speakerOrder: string[];
  speakerStatus: Record<string, SpeakerStatus>;
  activeSpeakerId?: string | undefined;
  startedAt?: number | undefined;
  closedAt?: number | undefined;
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

function specialistIds(order: string[]): string[] {
  return order.filter(id => id !== MEETING_FACILITATOR_AGENT_ID);
}

function freshRoundState(order: string[]): Pick<MeetingRoomState, 'roundStage' | 'speakerStatus' | 'activeSpeakerId'> {
  const speakerStatus = statuses(order);
  const hasFacilitator = order.includes(MEETING_FACILITATOR_AGENT_ID);
  const first = hasFacilitator ? MEETING_FACILITATOR_AGENT_ID : specialistIds(order)[0];
  return {
    roundStage: hasFacilitator ? 'opening' : 'specialists',
    speakerStatus,
    activeSpeakerId: first,
  };
}

function inferRoundStage(room: Pick<MeetingRoomState, 'speakerOrder' | 'speakerStatus'>): RoundStage {
  const hasFacilitator = room.speakerOrder.includes(MEETING_FACILITATOR_AGENT_ID);
  if (hasFacilitator && room.speakerStatus[MEETING_FACILITATOR_AGENT_ID] !== 'responded') return 'opening';
  if (specialistIds(room.speakerOrder).some(id => room.speakerStatus[id] === 'waiting')) return 'specialists';
  return hasFacilitator ? 'synthesis' : 'complete';
}

export function ensureMeetingRoom(roomId: string, agentIds: string[]): MeetingRoomState {
  const state = loadMeetingOrchestration();
  const order = orderedAgents(agentIds);
  const existing = state.rooms[roomId];
  const fallbackStage: RoundStage = order.includes(MEETING_FACILITATOR_AGENT_ID) ? 'opening' : 'specialists';
  const next: MeetingRoomState = existing
    ? {
        ...existing,
        roundStage: existing.roundStage ?? inferRoundStage(existing),
        speakerOrder: order,
        speakerStatus: statuses(order, existing.speakerStatus),
        ...(existing.activeSpeakerId && order.includes(existing.activeSpeakerId)
          ? { activeSpeakerId: existing.activeSpeakerId }
          : order[0] ? { activeSpeakerId: order[0] } : { activeSpeakerId: undefined }),
        updatedAt: Date.now(),
      }
    : {
        roomId,
        phase: 'open',
        rounds: [...DEFAULT_ROUNDS],
        roundIndex: 0,
        roundStage: fallbackStage,
        speakerOrder: order,
        speakerStatus: statuses(order),
        ...(order[0] ? { activeSpeakerId: order[0] } : { activeSpeakerId: undefined }),
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
  const fresh = freshRoundState(current.speakerOrder);
  saveMeetingOrchestration({
    ...state,
    rooms: {
      ...state.rooms,
      [roomId]: {
        ...current,
        roundIndex: index,
        ...fresh,
        updatedAt: Date.now(),
      },
    },
  });
}

export function resetCurrentRound(roomId: string): void {
  const current = loadMeetingOrchestration().rooms[roomId];
  if (!current) return;
  setMeetingRound(roomId, current.roundIndex);
}

export function restartMeeting(roomId: string): void {
  const state = loadMeetingOrchestration();
  const current = state.rooms[roomId];
  if (!current) return;
  const fresh = freshRoundState(current.speakerOrder);
  saveMeetingOrchestration({
    ...state,
    rooms: {
      ...state.rooms,
      [roomId]: {
        ...current,
        phase: 'open',
        roundIndex: 0,
        ...fresh,
        startedAt: undefined,
        closedAt: undefined,
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

  let roundIndex = current.roundIndex;
  let roundStage = current.roundStage ?? inferRoundStage(current);
  let speakerStatus = { ...current.speakerStatus, [agentId]: status };
  let activeSpeakerId = current.activeSpeakerId;
  const specialists = specialistIds(current.speakerOrder);
  const hasFacilitator = current.speakerOrder.includes(MEETING_FACILITATOR_AGENT_ID);
  const completedTurn = status === 'responded' || status === 'skipped';

  if (agentId === MEETING_FACILITATOR_AGENT_ID && completedTurn) {
    if (roundStage === 'opening') {
      const nextSpecialist = specialists.find(id => speakerStatus[id] === 'waiting');
      if (nextSpecialist) {
        roundStage = 'specialists';
        activeSpeakerId = nextSpecialist;
      } else {
        speakerStatus = { ...speakerStatus, [MEETING_FACILITATOR_AGENT_ID]: 'waiting' };
        roundStage = 'synthesis';
        activeSpeakerId = MEETING_FACILITATOR_AGENT_ID;
      }
    } else if (roundStage === 'synthesis') {
      if (roundIndex < current.rounds.length - 1) {
        roundIndex += 1;
        speakerStatus = statuses(current.speakerOrder);
        speakerStatus[MEETING_FACILITATOR_AGENT_ID] = 'responded';
        const nextSpecialist = specialists[0];
        if (nextSpecialist) {
          roundStage = 'specialists';
          activeSpeakerId = nextSpecialist;
        } else {
          roundStage = 'synthesis';
          speakerStatus[MEETING_FACILITATOR_AGENT_ID] = 'waiting';
          activeSpeakerId = MEETING_FACILITATOR_AGENT_ID;
        }
      } else {
        roundStage = 'complete';
        activeSpeakerId = undefined;
      }
    }
  } else if (agentId !== MEETING_FACILITATOR_AGENT_ID) {
    if (roundStage === 'opening' && hasFacilitator) {
      activeSpeakerId = MEETING_FACILITATOR_AGENT_ID;
    } else if (completedTurn) {
      const nextSpecialist = specialists.find(id => speakerStatus[id] === 'waiting');
      if (nextSpecialist) {
        roundStage = 'specialists';
        activeSpeakerId = nextSpecialist;
      } else if (hasFacilitator) {
        speakerStatus = { ...speakerStatus, [MEETING_FACILITATOR_AGENT_ID]: 'waiting' };
        roundStage = 'synthesis';
        activeSpeakerId = MEETING_FACILITATOR_AGENT_ID;
      } else {
        roundStage = 'complete';
        activeSpeakerId = undefined;
      }
    } else {
      roundStage = 'specialists';
      activeSpeakerId = specialists.find(id => speakerStatus[id] === 'waiting');
    }
  }

  saveMeetingOrchestration({
    ...state,
    rooms: {
      ...state.rooms,
      [roomId]: {
        ...current,
        roundIndex,
        roundStage,
        speakerStatus,
        activeSpeakerId,
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
