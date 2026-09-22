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
  objective?: string | undefined;
  expectedOutcome?: string | undefined;
  decisionQuestion?: string | undefined;
  activeSpeakerId?: string | undefined;
  startedAt?: number | undefined;
  closedAt?: number | undefined;
  updatedAt: number;
}

export interface MeetingOrchestrationState {
  rooms: Record<string, MeetingRoomState>;
  chats: Record<string, ExternalAgentChat>;
}

export interface MeetingBriefPatch {
  objective?: string | undefined;
  expectedOutcome?: string | undefined;
  decisionQuestion?: string | undefined;
}

const DEFAULT_ROUNDS = ['Initial opinions', 'Critique', 'Revised proposals', 'Final decision'];
const ROUND_PHASES: MeetingPhase[] = ['collect', 'challenge', 'resolve', 'decision'];

function defaults(): MeetingOrchestrationState {
  return { rooms: {}, chats: {} };
}

function hostnameMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function inferExternalChatProvider(value: string): ExternalChatProvider {
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLocaleLowerCase().replace(/^www\./, '');
    const pathname = url.pathname.toLocaleLowerCase();

    if (hostnameMatches(hostname, 'chatgpt.com') || hostname === 'chat.openai.com') return 'ChatGPT';
    if (hostname === 'gemini.google.com') return 'Gemini';
    if (hostnameMatches(hostname, 'claude.ai')) return 'Claude';
    if (hostnameMatches(hostname, 'copilot.microsoft.com') || hostnameMatches(hostname, 'copilot.cloud.microsoft') || hostnameMatches(hostname, 'm365.cloud.microsoft')) return 'Copilot';
    if (hostnameMatches(hostname, 'deepseek.com')) return 'DeepSeek';
    if (hostnameMatches(hostname, 'qwen.ai') || hostname === 'tongyi.aliyun.com') return 'Qwen';
    if (hostnameMatches(hostname, 'grok.com') || (hostnameMatches(hostname, 'x.com') && pathname.startsWith('/i/grok'))) return 'Grok';
    if (hostnameMatches(hostname, 'meta.ai')) return 'META';
    return 'Other';
  } catch {
    return 'Other';
  }
}

export function loadMeetingOrchestration(): MeetingOrchestrationState {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '') as Partial<MeetingOrchestrationState>;
    const savedChats = parsed.chats ?? {};
    const chats = Object.fromEntries(Object.entries(savedChats).map(([agentId, chat]) => [
      agentId,
      {
        ...chat,
        agentId,
        provider: inferExternalChatProvider(chat.url),
      },
    ])) as Record<string, ExternalAgentChat>;
    return {
      rooms: parsed.rooms ?? {},
      chats,
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

export function phaseForRound(roundIndex: number): MeetingPhase {
  return ROUND_PHASES[Math.max(0, Math.min(roundIndex, ROUND_PHASES.length - 1))] ?? 'collect';
}

export function hasMeetingStarted(
  room: Pick<MeetingRoomState, 'phase' | 'roundIndex' | 'roundStage' | 'speakerOrder' | 'speakerStatus' | 'startedAt'>,
): boolean {
  if (room.startedAt !== undefined) return true;
  if (room.phase !== 'open' || room.roundIndex > 0) return true;
  const initialStage: RoundStage = room.speakerOrder.includes(MEETING_FACILITATOR_AGENT_ID) ? 'opening' : 'specialists';
  if (room.roundStage !== initialStage) return true;
  return Object.values(room.speakerStatus).some(status => status !== 'waiting');
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

function synchronizedPhase(room: Pick<MeetingRoomState, 'phase' | 'roundIndex' | 'roundStage' | 'rounds'>): MeetingPhase {
  const finalRound = room.roundIndex >= room.rounds.length - 1;
  if (finalRound && room.roundStage === 'complete' && (room.phase === 'actions' || room.phase === 'closed')) return room.phase;
  if (room.roundIndex === 0 && room.roundStage === 'opening' && room.phase === 'open') return 'open';
  return phaseForRound(room.roundIndex);
}

export function ensureMeetingRoom(roomId: string, agentIds: string[]): MeetingRoomState {
  const state = loadMeetingOrchestration();
  const order = orderedAgents(agentIds);
  const existing = state.rooms[roomId];
  const fallbackStage: RoundStage = order.includes(MEETING_FACILITATOR_AGENT_ID) ? 'opening' : 'specialists';
  const next: MeetingRoomState = existing
    ? (() => {
        const roundStage = existing.roundStage ?? inferRoundStage(existing);
        const candidate = { ...existing, roundStage };
        return {
          ...existing,
          phase: synchronizedPhase(candidate),
          roundStage,
          speakerOrder: order,
          speakerStatus: statuses(order, existing.speakerStatus),
          ...(existing.activeSpeakerId && order.includes(existing.activeSpeakerId)
            ? { activeSpeakerId: existing.activeSpeakerId }
            : roundStage === 'complete'
              ? { activeSpeakerId: undefined }
              : order[0] ? { activeSpeakerId: order[0] } : { activeSpeakerId: undefined }),
          updatedAt: Date.now(),
        };
      })()
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

export function setMeetingBrief(roomId: string, patch: MeetingBriefPatch): void {
  const state = loadMeetingOrchestration();
  const current = state.rooms[roomId];
  if (!current) return;
  saveMeetingOrchestration({
    ...state,
    rooms: {
      ...state.rooms,
      [roomId]: {
        ...current,
        ...(patch.objective !== undefined ? { objective: patch.objective } : {}),
        ...(patch.expectedOutcome !== undefined ? { expectedOutcome: patch.expectedOutcome } : {}),
        ...(patch.decisionQuestion !== undefined ? { decisionQuestion: patch.decisionQuestion } : {}),
        updatedAt: Date.now(),
      },
    },
  });
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
  const stamp = Date.now();
  saveMeetingOrchestration({
    ...state,
    rooms: {
      ...state.rooms,
      [roomId]: {
        ...current,
        phase: phaseForRound(index),
        roundIndex: index,
        ...fresh,
        ...(current.startedAt ? {} : { startedAt: stamp }),
        closedAt: undefined,
        updatedAt: stamp,
      },
    },
  });
}

export function startNextRound(roomId: string): boolean {
  const state = loadMeetingOrchestration();
  const current = state.rooms[roomId];
  if (!current || current.roundStage !== 'complete' || current.roundIndex >= current.rounds.length - 1) return false;
  const nextIndex = current.roundIndex + 1;
  const fresh = freshRoundState(current.speakerOrder);
  const stamp = Date.now();
  saveMeetingOrchestration({
    ...state,
    rooms: {
      ...state.rooms,
      [roomId]: {
        ...current,
        phase: phaseForRound(nextIndex),
        roundIndex: nextIndex,
        ...fresh,
        ...(current.startedAt ? {} : { startedAt: stamp }),
        closedAt: undefined,
        updatedAt: stamp,
      },
    },
  });
  return true;
}

export function resetCurrentRound(roomId: string): boolean {
  const current = loadMeetingOrchestration().rooms[roomId];
  if (!current || !hasMeetingStarted(current)) return false;
  setMeetingRound(roomId, current.roundIndex);
  return true;
}

export function restartMeeting(roomId: string): boolean {
  const state = loadMeetingOrchestration();
  const current = state.rooms[roomId];
  if (!current || !hasMeetingStarted(current)) return false;
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
  return true;
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

  let phase = current.phase;
  let roundStage = current.roundStage ?? inferRoundStage(current);
  let speakerStatus = { ...current.speakerStatus, [agentId]: status };
  let activeSpeakerId = current.activeSpeakerId;
  const specialists = specialistIds(current.speakerOrder);
  const hasFacilitator = current.speakerOrder.includes(MEETING_FACILITATOR_AGENT_ID);
  const completedTurn = status === 'responded' || status === 'skipped';
  const stamp = Date.now();

  if (agentId === MEETING_FACILITATOR_AGENT_ID && completedTurn) {
    if (roundStage === 'opening') {
      if (current.roundIndex === 0 && phase === 'open') phase = 'collect';
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
      // A round now stops here. The next round must be started explicitly so the
      // user can review Olivia's synthesis before the queue is reset.
      roundStage = 'complete';
      activeSpeakerId = undefined;
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
        phase,
        roundStage,
        speakerStatus,
        activeSpeakerId,
        ...(completedTurn && !hasMeetingStarted(current) ? { startedAt: stamp } : {}),
        updatedAt: stamp,
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

export function setExternalAgentChat(agentId: string, url: string): void {
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
    chats: {
      ...state.chats,
      [agentId]: {
        agentId,
        provider: inferExternalChatProvider(clean),
        url: clean,
        updatedAt: Date.now(),
      },
    },
  });
}

export function getExternalAgentChat(agentId: string): ExternalAgentChat | undefined {
  return loadMeetingOrchestration().chats[agentId];
}

export function allExternalAgentChats(): ExternalAgentChat[] {
  return Object.values(loadMeetingOrchestration().chats);
}
