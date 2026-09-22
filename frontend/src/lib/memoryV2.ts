import { newId } from '@/lib/id';
import { compactMemoryV2State, isStorageQuotaExceeded } from '@/lib/memoryV2StorageRecovery';
import {
  addAgentMemory,
  loadWorkspaceSuite,
  type AgentMemoryCategory,
  type AgentMemoryEntry,
  type AgentMemoryImportance,
  type AgentMemoryStatus,
} from '@/lib/workspaceSuite';
import type { ActionItem, DecisionRecord, Message, Room } from '@/types/domain';

const KEY = 'virtual-company:memory-v2:v1';
export const MEMORY_V2_EVENT = 'virtual-company:memory-v2-changed';

// Unlike history/suggestions/relations/conflicts, shared memories used to have
// no cap at all, which let a single localStorage key grow without bound and
// was the main contributor to quota-exceeded crashes (see #21). Recovery
// deliberately never trims this array (it holds the user's actual knowledge),
// so it must be bounded at write time instead.
export const MAX_SHARED_MEMORIES = 2000;

export type SharedMemoryScope = 'company' | 'project' | 'agent-system';
export type MemorySuggestionTarget = 'agent' | 'company' | 'project';
export type MemoryRelationType = 'supersedes' | 'derived-from' | 'supports' | 'contradicts';
export type MemoryConflictStatus = 'open' | 'resolved' | 'dismissed';

export interface SharedMemoryEntry {
  id: string;
  scope: SharedMemoryScope;
  agentId?: string | undefined;
  companyId: string;
  projectId?: string | undefined;
  category: AgentMemoryCategory;
  title: string;
  content: string;
  status: AgentMemoryStatus;
  importance: AgentMemoryImportance;
  sourceRoomId?: string | undefined;
  sourceMessageId?: string | undefined;
  expiresAt?: number | undefined;
  systemKey?: string | undefined;
  createdAt: number;
  updatedAt: number;
}

export interface MemorySuggestion {
  id: string;
  target: MemorySuggestionTarget;
  agentId?: string | undefined;
  companyId: string;
  projectId?: string | undefined;
  category: AgentMemoryCategory;
  title: string;
  content: string;
  importance: AgentMemoryImportance;
  sourceRoomId: string;
  sourceMessageId: string;
  reasons: string[];
  status: 'pending' | 'accepted' | 'dismissed';
  createdAt: number;
  resolvedAt?: number | undefined;
}

export interface MemoryRelation {
  id: string;
  fromRef: string;
  toRef: string;
  type: MemoryRelationType;
  note?: string | undefined;
  createdAt: number;
}

export interface MemoryConflict {
  id: string;
  leftRef: string;
  rightRef: string;
  reason: string;
  status: MemoryConflictStatus;
  createdAt: number;
  resolvedAt?: number | undefined;
}

export interface MemoryHistoryEvent {
  id: string;
  action: string;
  label: string;
  memoryRef?: string | undefined;
  createdAt: number;
}

interface AgentMemoryCacheEntry {
  fingerprint: string;
  title: string;
}

export interface MemoryV2State {
  version: 1;
  sharedMemories: SharedMemoryEntry[];
  suggestions: MemorySuggestion[];
  relations: MemoryRelation[];
  conflicts: MemoryConflict[];
  history: MemoryHistoryEvent[];
  agentMemoryCache: Record<string, AgentMemoryCacheEntry>;
}

export interface UnifiedMemory {
  ref: string;
  kind: 'agent' | 'shared';
  id: string;
  agentId?: string | undefined;
  scope: 'agent' | SharedMemoryScope;
  companyId?: string | undefined;
  projectId?: string | undefined;
  category: AgentMemoryCategory;
  title: string;
  content: string;
  status: AgentMemoryStatus;
  importance: AgentMemoryImportance;
  updatedAt: number;
}

const importanceRank: Record<AgentMemoryImportance, number> = { high: 3, medium: 2, low: 1 };
const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'into', 'have', 'will', 'should', 'would', 'could', 'about', 'your', 'their',
  'این', 'برای', 'است', 'هست', 'شود', 'شده', 'باید', 'نباید', 'یک', 'را', 'در', 'از', 'با', 'که', 'روی', 'به', 'اگر',
]);

function defaults(): MemoryV2State {
  return {
    version: 1,
    sharedMemories: [],
    suggestions: [],
    relations: [],
    conflicts: [],
    history: [],
    agentMemoryCache: {},
  };
}

function now(): number {
  return Date.now();
}

function normalizeText(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function tokens(value: string): Set<string> {
  const matches = normalizeText(value).match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  return new Set(matches.filter(token => !STOPWORDS.has(token)));
}

function overlapScore(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  return (2 * common) / (a.size + b.size);
}

function legacyAgentMemoryFingerprint(entry: AgentMemoryEntry): string {
  return [entry.title, entry.content, entry.status, entry.importance, entry.projectId ?? '', entry.updatedAt].join('|');
}

function compactFingerprint(value: string): string {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left ^= code;
    left = Math.imul(left, 0x01000193);
    right ^= code + index;
    right = Math.imul(right, 0x85ebca6b);
  }
  const a = (left >>> 0).toString(16).padStart(8, '0');
  const b = (right >>> 0).toString(16).padStart(8, '0');
  return `h1:${a}${b}`;
}

function fingerprintAgentMemory(entry: AgentMemoryEntry): string {
  return compactFingerprint(legacyAgentMemoryFingerprint(entry));
}

function matchesAgentMemoryFingerprint(entry: AgentMemoryEntry, fingerprint: string): boolean {
  if (fingerprint === fingerprintAgentMemory(entry)) return true;
  return !fingerprint.startsWith('h1:') && fingerprint === legacyAgentMemoryFingerprint(entry);
}

function appendHistory(state: MemoryV2State, event: Omit<MemoryHistoryEvent, 'id' | 'createdAt'>): MemoryV2State {
  return {
    ...state,
    history: [{ id: newId(), createdAt: now(), ...event }, ...state.history].slice(0, 1000),
  };
}

export function capSharedMemories(entries: SharedMemoryEntry[]): SharedMemoryEntry[] {
  return entries.length > MAX_SHARED_MEMORIES ? entries.slice(0, MAX_SHARED_MEMORIES) : entries;
}

export function loadMemoryV2(): MemoryV2State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<MemoryV2State>;
    return {
      version: 1,
      sharedMemories: Array.isArray(parsed.sharedMemories) ? parsed.sharedMemories : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      relations: Array.isArray(parsed.relations) ? parsed.relations : [],
      conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
      agentMemoryCache: parsed.agentMemoryCache ?? {},
    };
  } catch {
    return defaults();
  }
}

export function saveMemoryV2(state: MemoryV2State): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (error) {
    if (!isStorageQuotaExceeded(error)) throw error;
    try {
      // Trim rebuildable metadata (history/suggestions/relations/conflicts/cache)
      // and retry once. Shared memories are intentionally left untouched here;
      // MAX_SHARED_MEMORIES is what keeps that array itself bounded.
      const compacted = compactMemoryV2State(state as unknown as Parameters<typeof compactMemoryV2State>[0]);
      localStorage.setItem(KEY, JSON.stringify(compacted));
    } catch (retryError) {
      if (!isStorageQuotaExceeded(retryError)) throw retryError;
      console.warn('[Memory V2] Unable to persist memory changes: browser storage is full.');
      return;
    }
  }
  window.dispatchEvent(new CustomEvent(MEMORY_V2_EVENT));
}

export function updateMemoryV2(updater: (state: MemoryV2State) => MemoryV2State): MemoryV2State {
  const next = updater(loadMemoryV2());
  saveMemoryV2(next);
  return next;
}

export function addSharedMemory(input: Omit<SharedMemoryEntry, 'id' | 'createdAt' | 'updatedAt'>): string | null {
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || !content || !input.companyId) return null;
  if (input.scope === 'project' && !input.projectId) return null;
  if (input.scope === 'agent-system' && !input.agentId) return null;
  const id = newId();
  const stamp = now();
  const entry: SharedMemoryEntry = { ...input, id, title, content, createdAt: stamp, updatedAt: stamp };
  updateMemoryV2(state => appendHistory(
    { ...state, sharedMemories: capSharedMemories([entry, ...state.sharedMemories]) },
    { action: 'memory.created', label: `Created ${input.scope} memory: ${title}`, memoryRef: `v2:${id}` },
  ));
  refreshMemoryConflicts();
  return id;
}

export function updateSharedMemory(id: string, patch: Partial<Omit<SharedMemoryEntry, 'id' | 'createdAt'>>): void {
  let changedTitle = '';
  updateMemoryV2(state => {
    const sharedMemories = state.sharedMemories.map(entry => {
      if (entry.id !== id) return entry;
      const title = patch.title === undefined ? entry.title : patch.title.trim();
      const content = patch.content === undefined ? entry.content : patch.content.trim();
      if (!title || !content) return entry;
      changedTitle = title;
      return { ...entry, ...patch, title, content, updatedAt: now() };
    });
    return appendHistory(
      { ...state, sharedMemories },
      { action: 'memory.updated', label: `Updated memory: ${changedTitle || id}`, memoryRef: `v2:${id}` },
    );
  });
  refreshMemoryConflicts();
}

export function deleteSharedMemory(id: string): void {
  const entry = loadMemoryV2().sharedMemories.find(item => item.id === id);
  updateMemoryV2(state => appendHistory(
    {
      ...state,
      sharedMemories: state.sharedMemories.filter(item => item.id !== id),
      relations: state.relations.filter(relation => relation.fromRef !== `v2:${id}` && relation.toRef !== `v2:${id}`),
      conflicts: state.conflicts.filter(conflict => conflict.leftRef !== `v2:${id}` && conflict.rightRef !== `v2:${id}`),
    },
    { action: 'memory.deleted', label: `Deleted memory: ${entry?.title ?? id}`, memoryRef: `v2:${id}` },
  ));
}

export function unifiedMemories(): UnifiedMemory[] {
  const suite = loadWorkspaceSuite();
  const state = loadMemoryV2();
  const currentTime = now();
  const agent: UnifiedMemory[] = suite.agentMemories.map(entry => ({
    ref: `agent:${entry.id}`,
    kind: 'agent' as const,
    id: entry.id,
    agentId: entry.agentId,
    scope: 'agent' as const,
    companyId: entry.companyId,
    projectId: entry.projectId,
    category: entry.category,
    title: entry.title,
    content: entry.content,
    status: entry.expiresAt && entry.expiresAt <= currentTime ? 'archived' : entry.status,
    importance: entry.importance,
    updatedAt: entry.updatedAt,
  }));
  const shared: UnifiedMemory[] = state.sharedMemories.map(entry => ({
    ref: `v2:${entry.id}`,
    kind: 'shared' as const,
    id: entry.id,
    agentId: entry.agentId,
    scope: entry.scope,
    companyId: entry.companyId,
    projectId: entry.projectId,
    category: entry.category,
    title: entry.title,
    content: entry.content,
    status: entry.expiresAt && entry.expiresAt <= currentTime ? 'archived' : entry.status,
    importance: entry.importance,
    updatedAt: entry.updatedAt,
  }));
  return [...agent, ...shared];
}

export function rankMemoriesByRelevance<T extends { title: string; content: string; importance: AgentMemoryImportance; updatedAt: number }>(
  query: string,
  entries: T[],
): T[] {
  const normalizedQuery = query.trim();
  return [...entries].sort((left, right) => {
    const leftScore = normalizedQuery
      ? overlapScore(`${left.title} ${left.title} ${left.content}`, normalizedQuery)
      : 0;
    const rightScore = normalizedQuery
      ? overlapScore(`${right.title} ${right.title} ${right.content}`, normalizedQuery)
      : 0;
    if (rightScore !== leftScore) return rightScore - leftScore;
    const importance = importanceRank[right.importance] - importanceRank[left.importance];
    return importance || right.updatedAt - left.updatedAt;
  });
}

export function relevantSharedMemories(
  projectId: string | undefined,
  companyId: string,
  query = '',
  agentId?: string,
  limit = 20,
): SharedMemoryEntry[] {
  const currentTime = now();
  const entries = loadMemoryV2().sharedMemories
    .filter(entry => entry.status === 'active')
    .filter(entry => !entry.expiresAt || entry.expiresAt > currentTime)
    .filter(entry => entry.companyId === companyId)
    .filter(entry => {
      if (entry.scope === 'company') return true;
      if (entry.scope === 'project') return Boolean(projectId && entry.projectId === projectId);
      return Boolean(agentId && entry.agentId === agentId && (!entry.projectId || entry.projectId === projectId));
    });
  return rankMemoriesByRelevance(query, entries).slice(0, Math.max(1, limit));
}

export function buildMemoryDigest(entries: Array<{ category: AgentMemoryCategory; title: string; content: string; importance: AgentMemoryImportance }>, maxChars = 4200): string {
  if (entries.length === 0) return '(No active memory.)';
  const groups = new Map<AgentMemoryCategory, typeof entries>();
  for (const entry of entries) groups.set(entry.category, [...(groups.get(entry.category) ?? []), entry]);
  const lines: string[] = [];
  let used = 0;
  for (const [category, items] of groups) {
    const header = `${category.toUpperCase()}:`;
    if (used + header.length > maxChars) break;
    lines.push(header);
    used += header.length;
    for (const item of items) {
      const excerpt = item.content.replace(/\s+/g, ' ').trim();
      const compact = `- [${item.importance}] ${item.title}: ${excerpt.slice(0, 180)}${excerpt.length > 180 ? '…' : ''}`;
      if (used + compact.length > maxChars) {
        lines.push('- … additional memories omitted from compact digest');
        return lines.join('\n');
      }
      lines.push(compact);
      used += compact.length;
    }
  }
  return lines.join('\n');
}

function suggestionCategory(message: Message): { category: AgentMemoryCategory; reasons: string[] } | null {
  const text = normalizeText(message.content);
  const reasons: string[] = [];
  let category: AgentMemoryCategory | null = null;
  const match = (pattern: RegExp, value: AgentMemoryCategory, reason: string) => {
    if (!category && pattern.test(text)) {
      category = value;
      reasons.push(reason);
    }
  };
  match(/\b(decid|decision|approved|adopt|selected|we will|use .* instead)\b|تصمیم|انتخاب|مصوب/, 'decision', 'Decision language detected.');
  match(/\b(risk|failure|warning|problem|vulnerab|hazard)\b|ریسک|خطر|مشکل|هشدار/, 'risk', 'Risk language detected.');
  match(/\b(assum|hypothes)\b|فرض|فرضیه/, 'assumption', 'Assumption language detected.');
  match(/\b(must|required|cannot|constraint|never|always)\b|باید|نباید|محدودیت|همیشه/, 'constraint', 'Constraint language detected.');
  match(/\b(lesson|learned|takeaway)\b|درس|آموخت/, 'lesson', 'Lesson language detected.');
  match(/\b(protocol|workflow|process|procedure)\b|پروتکل|فرآیند|روال/, 'protocol', 'Protocol/process language detected.');
  if (!category && (message.content.includes('?') || message.content.includes('؟'))) {
    category = 'open-question';
    reasons.push('Open question detected.');
  }
  if (!category && (message.pinned || message.reaction === 'important' || message.reaction === 'accepted')) {
    category = 'fact';
    reasons.push('Message was marked as important/pinned/accepted.');
  }
  return category ? { category, reasons } : null;
}

function suggestionTitle(content: string): string {
  const first = content.split(/\n|[.!?؟]/).map(value => value.trim()).find(Boolean) ?? 'Memory suggestion';
  return first.length > 84 ? `${first.slice(0, 81)}…` : first;
}

export function suggestMemoryFromMessage(room: Room, message: Message, companyId: string): string | null {
  if (message.content.trim().length < 32) return null;
  const state = loadMemoryV2();
  if (state.suggestions.some(item => item.sourceMessageId === message.id)) return null;
  const detected = suggestionCategory(message);
  if (!detected) return null;
  const target: MemorySuggestionTarget = message.authorType === 'agent' && message.authorId
    ? 'agent'
    : room.projectId
      ? 'project'
      : 'company';
  const importance: AgentMemoryImportance = message.pinned || message.reaction === 'important' || detected.category === 'decision' || detected.category === 'risk'
    ? 'high'
    : 'medium';
  const suggestion: MemorySuggestion = {
    id: newId(),
    target,
    ...(message.authorType === 'agent' && message.authorId ? { agentId: message.authorId } : {}),
    companyId,
    ...(room.projectId ? { projectId: room.projectId } : {}),
    category: detected.category,
    title: suggestionTitle(message.content),
    content: message.content.trim(),
    importance,
    sourceRoomId: room.id,
    sourceMessageId: message.id,
    reasons: detected.reasons,
    status: 'pending',
    createdAt: now(),
  };
  updateMemoryV2(current => appendHistory(
    { ...current, suggestions: [suggestion, ...current.suggestions].slice(0, 300) },
    { action: 'suggestion.created', label: `Suggested ${detected.category} memory from ${room.name}.` },
  ));
  return suggestion.id;
}

export function acceptMemorySuggestion(id: string): string | null {
  const suggestion = loadMemoryV2().suggestions.find(item => item.id === id && item.status === 'pending');
  if (!suggestion) return null;
  let memoryId: string | null = null;
  if (suggestion.target === 'agent' && suggestion.agentId) {
    memoryId = addAgentMemory({
      agentId: suggestion.agentId,
      companyId: suggestion.companyId,
      ...(suggestion.projectId ? { projectId: suggestion.projectId } : {}),
      category: suggestion.category,
      title: suggestion.title,
      content: suggestion.content,
      status: 'active',
      importance: suggestion.importance,
      sourceRoomId: suggestion.sourceRoomId,
      sourceMessageId: suggestion.sourceMessageId,
    });
  } else {
    memoryId = addSharedMemory({
      scope: suggestion.target === 'project' ? 'project' : 'company',
      companyId: suggestion.companyId,
      ...(suggestion.projectId ? { projectId: suggestion.projectId } : {}),
      category: suggestion.category,
      title: suggestion.title,
      content: suggestion.content,
      status: 'active',
      importance: suggestion.importance,
      sourceRoomId: suggestion.sourceRoomId,
      sourceMessageId: suggestion.sourceMessageId,
    });
  }
  updateMemoryV2(state => appendHistory(
    {
      ...state,
      suggestions: state.suggestions.map(item => item.id === id ? { ...item, status: 'accepted' as const, resolvedAt: now() } : item),
    },
    { action: 'suggestion.accepted', label: `Accepted memory suggestion: ${suggestion.title}`, ...(memoryId ? { memoryRef: suggestion.target === 'agent' ? `agent:${memoryId}` : `v2:${memoryId}` } : {}) },
  ));
  refreshMemoryConflicts();
  return memoryId;
}

export function dismissMemorySuggestion(id: string): void {
  updateMemoryV2(state => {
    const target = state.suggestions.find(item => item.id === id);
    return appendHistory(
      { ...state, suggestions: state.suggestions.map(item => item.id === id ? { ...item, status: 'dismissed' as const, resolvedAt: now() } : item) },
      { action: 'suggestion.dismissed', label: `Dismissed memory suggestion: ${target?.title ?? id}` },
    );
  });
}

function sameConflictScope(left: UnifiedMemory, right: UnifiedMemory): boolean {
  if (left.ref === right.ref) return false;
  if (left.scope === 'agent' || left.scope === 'agent-system' || right.scope === 'agent' || right.scope === 'agent-system') {
    return Boolean(left.agentId && right.agentId && left.agentId === right.agentId && (left.projectId ?? '') === (right.projectId ?? ''));
  }
  return left.companyId === right.companyId && left.scope === right.scope && (left.projectId ?? '') === (right.projectId ?? '');
}

export function refreshMemoryConflicts(): MemoryConflict[] {
  const memories = unifiedMemories().filter(item => item.status === 'active');
  const state = loadMemoryV2();
  const existingByPair = new Map(state.conflicts.map(item => [[item.leftRef, item.rightRef].sort().join('|'), item]));
  const found: MemoryConflict[] = [];
  for (let leftIndex = 0; leftIndex < memories.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < memories.length; rightIndex += 1) {
      const left = memories[leftIndex]!;
      const right = memories[rightIndex]!;
      if (!sameConflictScope(left, right)) continue;
      if (left.category !== right.category && !(['decision', 'constraint', 'fact'] as AgentMemoryCategory[]).includes(left.category)) continue;
      const similarity = overlapScore(`${left.title} ${left.content}`, `${right.title} ${right.content}`);
      if (similarity < 0.48) continue;
      if (normalizeText(left.content) === normalizeText(right.content)) continue;
      const pair = [left.ref, right.ref].sort();
      const key = pair.join('|');
      const prior = existingByPair.get(key);
      found.push(prior ?? {
        id: newId(),
        leftRef: pair[0]!,
        rightRef: pair[1]!,
        reason: `Potential conflict: ${(similarity * 100).toFixed(0)}% topic overlap in the same active memory scope. Review before treating both as current truth.`,
        status: 'open',
        createdAt: now(),
      });
    }
  }
  const stillRelevant = new Set(found.map(item => [item.leftRef, item.rightRef].sort().join('|')));
  const preservedClosed = state.conflicts.filter(item => item.status !== 'open' && !stillRelevant.has([item.leftRef, item.rightRef].sort().join('|')));
  saveMemoryV2({ ...state, conflicts: [...found, ...preservedClosed].slice(0, 300) });
  return found;
}

export function setMemoryConflictStatus(id: string, status: MemoryConflictStatus): void {
  updateMemoryV2(state => appendHistory(
    {
      ...state,
      conflicts: state.conflicts.map(item => item.id === id ? { ...item, status, ...(status === 'open' ? {} : { resolvedAt: now() }) } : item),
    },
    { action: `conflict.${status}`, label: `${status === 'dismissed' ? 'Dismissed' : status === 'resolved' ? 'Resolved' : 'Reopened'} memory conflict ${id}.` },
  ));
}

export function addMemoryRelation(fromRef: string, toRef: string, type: MemoryRelationType, note = ''): string | null {
  if (!fromRef || !toRef || fromRef === toRef) return null;
  const state = loadMemoryV2();
  const duplicate = state.relations.find(item => item.fromRef === fromRef && item.toRef === toRef && item.type === type);
  if (duplicate) return duplicate.id;
  const relation: MemoryRelation = { id: newId(), fromRef, toRef, type, ...(note.trim() ? { note: note.trim() } : {}), createdAt: now() };
  updateMemoryV2(current => appendHistory(
    { ...current, relations: [relation, ...current.relations].slice(0, 500) },
    { action: 'relation.created', label: `Linked memories as ${type}: ${fromRef} → ${toRef}`, memoryRef: fromRef },
  ));
  return relation.id;
}

export function deleteMemoryRelation(id: string): void {
  updateMemoryV2(state => {
    const relation = state.relations.find(item => item.id === id);
    return appendHistory(
      { ...state, relations: state.relations.filter(item => item.id !== id) },
      { action: 'relation.deleted', label: `Removed memory relationship ${relation?.type ?? id}.`, memoryRef: relation?.fromRef },
    );
  });
}

export function captureAgentMemoryHistory(): void {
  const suiteMemories = loadWorkspaceSuite().agentMemories;
  const state = loadMemoryV2();
  const nextCache: Record<string, AgentMemoryCacheEntry> = {};
  const events: Array<Omit<MemoryHistoryEvent, 'id' | 'createdAt'>> = [];
  for (const entry of suiteMemories) {
    const fingerprint = fingerprintAgentMemory(entry);
    nextCache[entry.id] = { fingerprint, title: entry.title };
    const prior = state.agentMemoryCache[entry.id];
    if (prior && !matchesAgentMemoryFingerprint(entry, prior.fingerprint)) {
      events.push({ action: 'agent-memory.changed', label: `Agent memory changed: ${entry.title}`, memoryRef: `agent:${entry.id}` });
    }
  }
  for (const [id, cached] of Object.entries(state.agentMemoryCache)) {
    if (!nextCache[id]) events.push({ action: 'agent-memory.removed', label: `Agent memory removed: ${cached.title}`, memoryRef: `agent:${id}` });
  }
  let next: MemoryV2State = { ...state, agentMemoryCache: nextCache };
  for (const event of events) next = appendHistory(next, event);
  saveMemoryV2(next);
}

function extractRecentQuestions(room: Room): string[] {
  return room.messages
    .filter(message => message.content.includes('?') || message.content.includes('؟'))
    .slice(-3)
    .map(message => suggestionTitle(message.content));
}

export function syncOliviaMeetingState(
  room: Room,
  decisions: DecisionRecord[],
  actionItems: ActionItem[],
  companyId: string,
): void {
  const systemKey = `olivia-meeting-state:${room.id}`;
  const roomDecisions = decisions.filter(item => item.roomId === room.id).slice(0, 6);
  const openActions = actionItems.filter(item => item.roomId === room.id && item.status !== 'done').slice(0, 8);
  const questions = extractRecentQuestions(room);
  const agenda = (room.agenda ?? []).slice(0, 8);
  const lines = [
    `Room: ${room.name}`,
    `Participants: ${room.agentIds.length}`,
    `Messages: ${room.messages.length}`,
    agenda.length ? `Agenda: ${agenda.join(' | ')}` : 'Agenda: not set',
    roomDecisions.length ? `Decisions: ${roomDecisions.map(item => `[${item.status}] ${item.title}`).join(' | ')}` : 'Decisions: none recorded',
    openActions.length ? `Open actions: ${openActions.map(item => `${item.title}${item.owner ? ` (${item.owner})` : ''}`).join(' | ')}` : 'Open actions: none',
    questions.length ? `Recent unresolved questions: ${questions.join(' | ')}` : 'Recent unresolved questions: none detected',
  ];
  const content = lines.join('\n');
  const state = loadMemoryV2();
  const existing = state.sharedMemories.find(item => item.systemKey === systemKey);
  if (existing && existing.content === content && existing.projectId === room.projectId && existing.companyId === companyId) return;
  if (existing) {
    updateMemoryV2(current => ({
      ...current,
      sharedMemories: current.sharedMemories.map(item => item.id === existing.id
        ? { ...item, content, companyId, projectId: room.projectId, sourceRoomId: room.id, updatedAt: now(), status: 'active' as const }
        : item),
    }));
    return;
  }
  const stamp = now();
  const entry: SharedMemoryEntry = {
    id: newId(),
    scope: 'agent-system',
    agentId: 'agent-olivia',
    companyId,
    ...(room.projectId ? { projectId: room.projectId } : {}),
    category: 'protocol',
    title: `Meeting state · ${room.name}`,
    content,
    status: 'active',
    importance: 'high',
    sourceRoomId: room.id,
    systemKey,
    createdAt: stamp,
    updatedAt: stamp,
  };
  updateMemoryV2(current => appendHistory(
    { ...current, sharedMemories: capSharedMemories([entry, ...current.sharedMemories]) },
    { action: 'meeting-state.created', label: `Olivia started persistent meeting state for ${room.name}.`, memoryRef: `v2:${entry.id}` },
  ));
}

export function memoryLabelByRef(ref: string): string {
  return unifiedMemories().find(item => item.ref === ref)?.title ?? ref;
}
