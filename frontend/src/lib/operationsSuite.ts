import { newId } from '@/lib/id';
import type { Room } from '@/types/domain';

const KEY = 'virtual-company:operations-suite:v1';
export const OPERATIONS_SUITE_EVENT = 'virtual-company:operations-suite-changed';

export type RegisterStatus = 'open' | 'validated' | 'resolved' | 'rejected' | 'archived';
export type Confidence = 'low' | 'medium' | 'high';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type IdeaStatus = 'raw' | 'exploring' | 'promising' | 'rejected' | 'selected';
export type DeliverableType = 'PRD' | 'ADR' | 'Technical Spec' | 'Test Plan' | 'GTM Plan' | 'Risk Assessment' | 'Meeting Minutes' | 'Implementation Plan';
export type KanbanStatus = 'todo' | 'in-progress' | 'blocked' | 'review' | 'done';

export interface AssumptionRecord {
  id: string;
  projectId: string;
  roomId?: string | undefined;
  statement: string;
  evidence: string;
  confidence: Confidence;
  owner?: string | undefined;
  status: RegisterStatus;
  createdAt: number;
  updatedAt: number;
}

export interface RiskRecord {
  id: string;
  projectId: string;
  roomId?: string | undefined;
  description: string;
  probability: RiskLevel;
  impact: RiskLevel;
  mitigation: string;
  owner?: string | undefined;
  status: 'open' | 'mitigated' | 'accepted' | 'archived';
  createdAt: number;
  updatedAt: number;
}

export interface OpenQuestionRecord {
  id: string;
  projectId: string;
  roomId?: string | undefined;
  question: string;
  owner?: string | undefined;
  status: 'open' | 'resolved' | 'archived';
  resolution?: string | undefined;
  createdAt: number;
  updatedAt: number;
}

export interface IdeaScore {
  customerValue: number;
  feasibility: number;
  differentiation: number;
  cost: number;
  risk: number;
}

export interface IdeaRecord {
  id: string;
  projectId: string;
  roomId?: string | undefined;
  title: string;
  description: string;
  status: IdeaStatus;
  mergedIntoId?: string | undefined;
  scores: Record<string, IdeaScore>;
  createdAt: number;
  updatedAt: number;
}

export interface DeliverableVersion {
  version: number;
  content: string;
  createdAt: number;
}

export interface DeliverableRecord {
  id: string;
  projectId: string;
  roomId?: string | undefined;
  type: DeliverableType;
  title: string;
  versions: DeliverableVersion[];
  createdAt: number;
  updatedAt: number;
}

export interface DecisionDependency {
  id: string;
  decisionId: string;
  dependsOnDecisionId: string;
  createdAt: number;
}

export interface ActionDependency {
  id: string;
  actionId: string;
  blockedByActionId: string;
  createdAt: number;
}

export interface RoomSnapshotRecord {
  id: string;
  roomId: string;
  name: string;
  room: Room;
  createdAt: number;
}

export interface ReviewRequest {
  id: string;
  roomId: string;
  sourceMessageId: string;
  fromAgentId?: string | undefined;
  targetAgentId: string;
  kind: 'second-opinion' | 'handoff';
  note: string;
  status: 'open' | 'done' | 'archived';
  createdAt: number;
  updatedAt: number;
}

export interface MeetingTimerState {
  roomId: string;
  label: string;
  durationSeconds: number;
  startedAt?: number | undefined;
  pausedRemainingSeconds?: number | undefined;
}

export interface OperationsSuiteState {
  version: 1;
  assumptions: AssumptionRecord[];
  risks: RiskRecord[];
  questions: OpenQuestionRecord[];
  ideas: IdeaRecord[];
  deliverables: DeliverableRecord[];
  decisionDependencies: DecisionDependency[];
  actionDependencies: ActionDependency[];
  actionKanban: Record<string, KanbanStatus>;
  roomSnapshots: RoomSnapshotRecord[];
  reviewRequests: ReviewRequest[];
  timers: Record<string, MeetingTimerState>;
  dismissedNotifications: string[];
}

function defaults(): OperationsSuiteState {
  return {
    version: 1,
    assumptions: [],
    risks: [],
    questions: [],
    ideas: [],
    deliverables: [],
    decisionDependencies: [],
    actionDependencies: [],
    actionKanban: {},
    roomSnapshots: [],
    reviewRequests: [],
    timers: {},
    dismissedNotifications: [],
  };
}

export function loadOperationsSuite(): OperationsSuiteState {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '') as Partial<OperationsSuiteState>;
    return {
      version: 1,
      assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      ideas: Array.isArray(parsed.ideas) ? parsed.ideas : [],
      deliverables: Array.isArray(parsed.deliverables) ? parsed.deliverables : [],
      decisionDependencies: Array.isArray(parsed.decisionDependencies) ? parsed.decisionDependencies : [],
      actionDependencies: Array.isArray(parsed.actionDependencies) ? parsed.actionDependencies : [],
      actionKanban: parsed.actionKanban ?? {},
      roomSnapshots: Array.isArray(parsed.roomSnapshots) ? parsed.roomSnapshots : [],
      reviewRequests: Array.isArray(parsed.reviewRequests) ? parsed.reviewRequests : [],
      timers: parsed.timers ?? {},
      dismissedNotifications: Array.isArray(parsed.dismissedNotifications) ? parsed.dismissedNotifications : [],
    };
  } catch {
    return defaults();
  }
}

export function saveOperationsSuite(state: OperationsSuiteState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(OPERATIONS_SUITE_EVENT));
}

export function updateOperationsSuite(updater: (state: OperationsSuiteState) => OperationsSuiteState): OperationsSuiteState {
  const next = updater(loadOperationsSuite());
  saveOperationsSuite(next);
  return next;
}

export function addAssumption(input: Omit<AssumptionRecord, 'id' | 'createdAt' | 'updatedAt'>): string | null {
  if (!input.projectId || !input.statement.trim()) return null;
  const id = newId();
  const stamp = Date.now();
  const record: AssumptionRecord = { ...input, id, statement: input.statement.trim(), evidence: input.evidence.trim(), createdAt: stamp, updatedAt: stamp };
  updateOperationsSuite(state => ({ ...state, assumptions: [record, ...state.assumptions] }));
  return id;
}

export function updateAssumption(id: string, patch: Partial<Omit<AssumptionRecord, 'id' | 'createdAt'>>): void {
  updateOperationsSuite(state => ({ ...state, assumptions: state.assumptions.map(item => item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item) }));
}

export function addRisk(input: Omit<RiskRecord, 'id' | 'createdAt' | 'updatedAt'>): string | null {
  if (!input.projectId || !input.description.trim()) return null;
  const id = newId();
  const stamp = Date.now();
  const record: RiskRecord = { ...input, id, description: input.description.trim(), mitigation: input.mitigation.trim(), createdAt: stamp, updatedAt: stamp };
  updateOperationsSuite(state => ({ ...state, risks: [record, ...state.risks] }));
  return id;
}

export function updateRisk(id: string, patch: Partial<Omit<RiskRecord, 'id' | 'createdAt'>>): void {
  updateOperationsSuite(state => ({ ...state, risks: state.risks.map(item => item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item) }));
}

export function addQuestion(input: Omit<OpenQuestionRecord, 'id' | 'createdAt' | 'updatedAt'>): string | null {
  if (!input.projectId || !input.question.trim()) return null;
  const id = newId();
  const stamp = Date.now();
  const record: OpenQuestionRecord = { ...input, id, question: input.question.trim(), createdAt: stamp, updatedAt: stamp };
  updateOperationsSuite(state => ({ ...state, questions: [record, ...state.questions] }));
  return id;
}

export function updateQuestion(id: string, patch: Partial<Omit<OpenQuestionRecord, 'id' | 'createdAt'>>): void {
  updateOperationsSuite(state => ({ ...state, questions: state.questions.map(item => item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item) }));
}

export function addIdea(input: Omit<IdeaRecord, 'id' | 'createdAt' | 'updatedAt' | 'scores'>): string | null {
  if (!input.projectId || !input.title.trim()) return null;
  const id = newId();
  const stamp = Date.now();
  const record: IdeaRecord = { ...input, id, title: input.title.trim(), description: input.description.trim(), scores: {}, createdAt: stamp, updatedAt: stamp };
  updateOperationsSuite(state => ({ ...state, ideas: [record, ...state.ideas] }));
  return id;
}

export function updateIdea(id: string, patch: Partial<Omit<IdeaRecord, 'id' | 'createdAt'>>): void {
  updateOperationsSuite(state => ({ ...state, ideas: state.ideas.map(item => item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item) }));
}

export function scoreIdea(id: string, agentId: string, score: IdeaScore): void {
  const normalize = (value: number) => Math.max(1, Math.min(5, Math.round(value)));
  const clean: IdeaScore = {
    customerValue: normalize(score.customerValue),
    feasibility: normalize(score.feasibility),
    differentiation: normalize(score.differentiation),
    cost: normalize(score.cost),
    risk: normalize(score.risk),
  };
  updateOperationsSuite(state => ({ ...state, ideas: state.ideas.map(item => item.id === id ? { ...item, scores: { ...item.scores, [agentId]: clean }, updatedAt: Date.now() } : item) }));
}

export function mergeIdeas(sourceIds: string[], targetId: string): void {
  const sources = new Set(sourceIds.filter(id => id !== targetId));
  if (sources.size === 0) return;
  updateOperationsSuite(state => ({
    ...state,
    ideas: state.ideas.map(item => sources.has(item.id) ? { ...item, mergedIntoId: targetId, status: 'archived' as never, updatedAt: Date.now() } : item),
  }));
}

export function addDeliverable(input: Omit<DeliverableRecord, 'id' | 'versions' | 'createdAt' | 'updatedAt'> & { content: string }): string | null {
  if (!input.projectId || !input.title.trim()) return null;
  const id = newId();
  const stamp = Date.now();
  const record: DeliverableRecord = {
    id,
    projectId: input.projectId,
    ...(input.roomId ? { roomId: input.roomId } : {}),
    type: input.type,
    title: input.title.trim(),
    versions: [{ version: 1, content: input.content.trim(), createdAt: stamp }],
    createdAt: stamp,
    updatedAt: stamp,
  };
  updateOperationsSuite(state => ({ ...state, deliverables: [record, ...state.deliverables] }));
  return id;
}

export function addDeliverableVersion(id: string, content: string): void {
  const clean = content.trim();
  if (!clean) return;
  updateOperationsSuite(state => ({
    ...state,
    deliverables: state.deliverables.map(item => item.id === id
      ? { ...item, versions: [...item.versions, { version: (item.versions.at(-1)?.version ?? 0) + 1, content: clean, createdAt: Date.now() }], updatedAt: Date.now() }
      : item),
  }));
}

export function addDecisionDependency(decisionId: string, dependsOnDecisionId: string): void {
  if (!decisionId || !dependsOnDecisionId || decisionId === dependsOnDecisionId) return;
  updateOperationsSuite(state => state.decisionDependencies.some(item => item.decisionId === decisionId && item.dependsOnDecisionId === dependsOnDecisionId)
    ? state
    : { ...state, decisionDependencies: [...state.decisionDependencies, { id: newId(), decisionId, dependsOnDecisionId, createdAt: Date.now() }] });
}

export function addActionDependency(actionId: string, blockedByActionId: string): void {
  if (!actionId || !blockedByActionId || actionId === blockedByActionId) return;
  updateOperationsSuite(state => state.actionDependencies.some(item => item.actionId === actionId && item.blockedByActionId === blockedByActionId)
    ? state
    : { ...state, actionDependencies: [...state.actionDependencies, { id: newId(), actionId, blockedByActionId, createdAt: Date.now() }] });
}

export function setKanbanStatus(actionId: string, status: KanbanStatus): void {
  updateOperationsSuite(state => ({ ...state, actionKanban: { ...state.actionKanban, [actionId]: status } }));
}

export function getKanbanStatus(actionId: string, baseStatus: 'todo' | 'in-progress' | 'done'): KanbanStatus {
  return loadOperationsSuite().actionKanban[actionId] ?? baseStatus;
}

export function createRoomSnapshot(room: Room, name?: string): string {
  const id = newId();
  const snapshot: RoomSnapshotRecord = {
    id,
    roomId: room.id,
    name: name?.trim() || `${room.name} snapshot`,
    room: JSON.parse(JSON.stringify(room)) as Room,
    createdAt: Date.now(),
  };
  updateOperationsSuite(state => ({ ...state, roomSnapshots: [snapshot, ...state.roomSnapshots].slice(0, 50) }));
  return id;
}

export function deleteRoomSnapshot(id: string): void {
  updateOperationsSuite(state => ({ ...state, roomSnapshots: state.roomSnapshots.filter(item => item.id !== id) }));
}

export function addReviewRequest(input: Omit<ReviewRequest, 'id' | 'createdAt' | 'updatedAt' | 'status'>): string {
  const id = newId();
  const stamp = Date.now();
  const request: ReviewRequest = { ...input, id, status: 'open', createdAt: stamp, updatedAt: stamp };
  updateOperationsSuite(state => ({ ...state, reviewRequests: [request, ...state.reviewRequests] }));
  return id;
}

export function updateReviewRequest(id: string, patch: Partial<Omit<ReviewRequest, 'id' | 'createdAt'>>): void {
  updateOperationsSuite(state => ({ ...state, reviewRequests: state.reviewRequests.map(item => item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item) }));
}

export function setMeetingTimer(timer: MeetingTimerState): void {
  updateOperationsSuite(state => ({ ...state, timers: { ...state.timers, [timer.roomId]: timer } }));
}

export function clearMeetingTimer(roomId: string): void {
  updateOperationsSuite(state => {
    const timers = { ...state.timers };
    delete timers[roomId];
    return { ...state, timers };
  });
}

export function dismissNotification(key: string): void {
  updateOperationsSuite(state => state.dismissedNotifications.includes(key)
    ? state
    : { ...state, dismissedNotifications: [...state.dismissedNotifications, key].slice(-300) });
}
