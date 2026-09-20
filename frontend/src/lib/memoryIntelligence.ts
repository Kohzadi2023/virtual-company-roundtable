import { newId } from '@/lib/id';
import {
  addSharedMemory,
  loadMemoryV2,
  refreshMemoryConflicts,
  unifiedMemories,
  updateMemoryV2,
  type MemorySuggestion,
} from '@/lib/memoryV2';
import type { MeetingRoomState } from '@/lib/meetingOrchestration';
import {
  addAgentMemory,
  loadWorkspaceSuite,
  type AgentMemoryCategory,
  type AgentMemoryImportance,
} from '@/lib/workspaceSuite';
import type { Message, Room } from '@/types/domain';

const KEY = 'virtual-company:memory-intelligence:v1';
export const MEMORY_INTELLIGENCE_EVENT = 'virtual-company:memory-intelligence-changed';

export type IntelligentMemoryTarget = 'agent' | 'project' | 'company';
export type MemoryCandidateDisposition = 'pending' | 'auto-saved' | 'review' | 'ignored';
export type MemoryConfidence = 'high' | 'medium' | 'low';

export interface MemoryCandidateScore {
  durability: number;
  importance: number;
  novelty: number;
  relevance: number;
  confidence: number;
  total: number;
}

export interface MemoryCandidate {
  id: string;
  sourceMessageId: string;
  sourceRoomId: string;
  sourceRoundIndex?: number | undefined;
  sourceRoundName?: string | undefined;
  agentId?: string | undefined;
  companyId: string;
  projectId?: string | undefined;
  target: IntelligentMemoryTarget;
  category: AgentMemoryCategory;
  title: string;
  content: string;
  importance: AgentMemoryImportance;
  score: MemoryCandidateScore;
  confidence: MemoryConfidence;
  reasons: string[];
  duplicate: boolean;
  potentialConflict: boolean;
  disposition: MemoryCandidateDisposition;
  suggestionId?: string | undefined;
  memoryRef?: string | undefined;
  createdAt: number;
  resolvedAt?: number | undefined;
}

export interface MemoryIntelligenceMetadata {
  memoryRef: string;
  origin: 'auto' | 'suggested';
  score: number;
  confidence: MemoryConfidence;
  sourceRoomId: string;
  sourceMessageId: string;
  sourceRoundIndex?: number | undefined;
  sourceRoundName?: string | undefined;
  target: IntelligentMemoryTarget;
  createdAt: number;
}

export interface MemoryIntelligenceState {
  version: 1;
  candidates: MemoryCandidate[];
  metadata: Record<string, MemoryIntelligenceMetadata>;
  processedMessageIds: string[];
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'into', 'have', 'will', 'should', 'would', 'could', 'about', 'your', 'their',
  'این', 'برای', 'است', 'هست', 'شود', 'شده', 'باید', 'نباید', 'یک', 'را', 'در', 'از', 'با', 'که', 'روی', 'به', 'اگر',
]);

function defaults(): MemoryIntelligenceState {
  return { version: 1, candidates: [], metadata: {}, processedMessageIds: [] };
}

function now(): number {
  return Date.now();
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function tokens(value: string): Set<string> {
  const matches = normalize(value).match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  return new Set(matches.filter(token => !STOPWORDS.has(token)));
}

function overlap(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  return (2 * common) / (a.size + b.size);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function loadMemoryIntelligence(): MemoryIntelligenceState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<MemoryIntelligenceState>;
    return {
      version: 1,
      candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
      metadata: parsed.metadata ?? {},
      processedMessageIds: Array.isArray(parsed.processedMessageIds) ? parsed.processedMessageIds : [],
    };
  } catch {
    return defaults();
  }
}

export function saveMemoryIntelligence(state: MemoryIntelligenceState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(MEMORY_INTELLIGENCE_EVENT));
}

function updateState(updater: (state: MemoryIntelligenceState) => MemoryIntelligenceState): MemoryIntelligenceState {
  const next = updater(loadMemoryIntelligence());
  saveMemoryIntelligence(next);
  return next;
}

function detectCategory(message: Message): { category: AgentMemoryCategory; confidence: number; reasons: string[] } | null {
  const text = normalize(message.content);
  const reasons: string[] = [];
  const tests: Array<[RegExp, AgentMemoryCategory, string, number]> = [
    [/\b(decid|decision|approved|adopt|selected|we will|we chose|use .* instead)\b|تصمیم|انتخاب|مصوب/, 'decision', 'Decision language detected.', 2],
    [/\b(risk|failure|warning|problem|vulnerab|hazard|failure mode)\b|ریسک|خطر|مشکل|هشدار/, 'risk', 'Risk language detected.', 2],
    [/\b(assum|hypothes)\b|فرض|فرضیه/, 'assumption', 'Assumption language detected.', 2],
    [/\b(must|required|cannot|constraint|never|always|shall)\b|باید|نباید|محدودیت|همیشه/, 'constraint', 'Constraint language detected.', 2],
    [/\b(i prefer|we prefer|preference|i prioritize|my approach|my rule)\b|ترجیح|اولویت من/, 'preference', 'Stable preference language detected.', 2],
    [/\b(lesson|learned|takeaway|we learned)\b|درس|آموخت/, 'lesson', 'Lesson language detected.', 2],
    [/\b(protocol|workflow|process|procedure|playbook|guardrail)\b|پروتکل|فرآیند|روال/, 'protocol', 'Protocol/process language detected.', 2],
  ];
  for (const [pattern, category, reason, confidence] of tests) {
    if (pattern.test(text)) return { category, confidence, reasons: [reason] };
  }
  if (message.content.includes('?') || message.content.includes('؟')) {
    reasons.push('Open question detected.');
    return { category: 'open-question', confidence: 1, reasons };
  }
  if (message.pinned || message.reaction === 'important' || message.reaction === 'accepted') {
    reasons.push('Message was explicitly marked important, accepted, or pinned.');
    return { category: 'fact', confidence: 1, reasons };
  }
  return null;
}

function titleFor(content: string): string {
  const first = content.split(/\n|[.!?؟]/).map(part => part.trim()).find(Boolean) ?? 'Durable memory';
  return first.length > 84 ? `${first.slice(0, 81)}…` : first;
}

function inferTarget(room: Room, message: Message, category: AgentMemoryCategory): { target: IntelligentMemoryTarget; reasons: string[] } {
  const text = normalize(message.content);
  const reasons: string[] = [];
  const companyCue = /\b(company-wide|company policy|organization-wide|across all projects|all products|every project)\b|سراسر شرکت|همه پروژه|تمام محصولات/.test(text);
  const projectCue = /\b(this project|this product|this system|mvp|project|product|architecture|tech stack|implementation|deployment|release)\b|این پروژه|این محصول|این سیستم|معماری|استک|پیاده سازی|استقرار/.test(text);
  const agentCue = /\b(i prefer|i prioritize|my approach|my rule|when i review|when i evaluate|i always|i avoid)\b|من ترجیح|اولویت من|رویکرد من/.test(text);

  if (companyCue) {
    reasons.push('Company-wide scope language detected.');
    return { target: 'company', reasons };
  }
  if (message.authorType === 'user') {
    if (room.projectId) {
      reasons.push('User statement in a project room defaults to Project Memory review.');
      return { target: 'project', reasons };
    }
    reasons.push('User statement outside a project defaults to Company Memory review.');
    return { target: 'company', reasons };
  }
  if (agentCue || category === 'preference' || category === 'lesson') {
    reasons.push('Professional behavior/preference belongs to the specialist rather than the project.');
    return { target: 'agent', reasons };
  }
  if (room.projectId && (projectCue || ['decision', 'risk', 'constraint', 'assumption', 'fact', 'open-question', 'protocol'].includes(category))) {
    reasons.push('Project-scoped working knowledge detected.');
    return { target: 'project', reasons };
  }
  if (message.authorId) {
    reasons.push('Durable specialist-specific knowledge detected.');
    return { target: 'agent', reasons };
  }
  return { target: room.projectId ? 'project' : 'company', reasons };
}

function memoriesInTarget(target: IntelligentMemoryTarget, agentId: string | undefined, projectId: string | undefined, companyId: string) {
  return unifiedMemories().filter(memory => {
    if (target === 'agent') return memory.scope === 'agent' && Boolean(agentId && memory.agentId === agentId);
    if (target === 'project') return memory.scope === 'project' && Boolean(projectId && memory.projectId === projectId);
    return memory.scope === 'company' && (!memory.companyId || memory.companyId === companyId);
  });
}

function durabilityScore(category: AgentMemoryCategory): number {
  if (['decision', 'constraint', 'preference', 'lesson', 'protocol'].includes(category)) return 3;
  if (['risk', 'assumption'].includes(category)) return 2;
  return 1;
}

function importanceScore(message: Message, category: AgentMemoryCategory): number {
  if (message.pinned || message.reaction === 'important' || message.reaction === 'accepted') return 3;
  if (['decision', 'risk', 'constraint'].includes(category)) return 2;
  return 1;
}

function relevanceScore(message: Message, target: IntelligentMemoryTarget, category: AgentMemoryCategory): number {
  if (target === 'agent' && message.authorType === 'agent' && ['preference', 'lesson', 'protocol', 'constraint'].includes(category)) return 2;
  if (target === 'project' || target === 'company') return 2;
  return 1;
}

function confidenceLabel(total: number, signalConfidence: number): MemoryConfidence {
  if (total >= 9 && signalConfidence >= 2) return 'high';
  if (total >= 6) return 'medium';
  return 'low';
}

export function assessMemoryCandidate(
  room: Room,
  message: Message,
  companyId: string,
  meeting?: Pick<MeetingRoomState, 'roundIndex' | 'rounds'>,
): MemoryCandidate | null {
  const content = message.content.trim();
  if (content.length < 32) return null;
  const detected = detectCategory(message);
  if (!detected) return null;
  const scope = inferTarget(room, message, detected.category);
  const existing = memoriesInTarget(scope.target, message.authorId, room.projectId, companyId)
    .filter(memory => memory.status === 'active');
  const similarities = existing.map(memory => ({
    memory,
    similarity: overlap(`${titleFor(content)} ${content}`, `${memory.title} ${memory.content}`),
  })).sort((a, b) => b.similarity - a.similarity);
  const closest = similarities[0];
  const maxSimilarity = closest?.similarity ?? 0;
  const duplicate = Boolean(closest && maxSimilarity >= 0.86);
  const conflictCategories: AgentMemoryCategory[] = ['decision', 'constraint', 'fact', 'protocol', 'risk'];
  const potentialConflict = Boolean(
    closest
    && !duplicate
    && maxSimilarity >= 0.48
    && conflictCategories.includes(detected.category)
    && closest.memory.category === detected.category
    && normalize(closest.memory.content) !== normalize(content),
  );
  const novelty = duplicate ? 0 : maxSimilarity < 0.25 ? 2 : maxSimilarity < 0.55 ? 1 : 0;
  const rawImportance = importanceScore(message, detected.category);
  const score: MemoryCandidateScore = {
    durability: durabilityScore(detected.category),
    importance: rawImportance,
    novelty,
    relevance: relevanceScore(message, scope.target, detected.category),
    confidence: detected.confidence,
    total: 0,
  };
  score.total = clamp(score.durability + score.importance + score.novelty + score.relevance + score.confidence, 0, 12);
  // User-authored statements can become review candidates but never bypass review.
  if (message.authorType === 'user') score.total = Math.min(score.total, 8);
  const confidence = confidenceLabel(score.total, detected.confidence);
  const importance: AgentMemoryImportance = rawImportance >= 3 || detected.category === 'decision' || detected.category === 'risk' ? 'high' : score.total >= 8 ? 'medium' : 'low';
  const reasons = [...detected.reasons, ...scope.reasons];
  if (duplicate) reasons.push(`Near-duplicate of existing memory (${Math.round(maxSimilarity * 100)}% overlap).`);
  else if (maxSimilarity > 0) reasons.push(`Novelty checked against active ${scope.target} memory; closest overlap ${Math.round(maxSimilarity * 100)}%.`);
  if (potentialConflict) reasons.push('Potential conflict detected; automatic save is blocked pending review.');
  reasons.push(`Memory score ${score.total}/12 (durability ${score.durability}, importance ${score.importance}, novelty ${score.novelty}, relevance ${score.relevance}, confidence ${score.confidence}).`);

  return {
    id: newId(),
    sourceMessageId: message.id,
    sourceRoomId: room.id,
    ...(meeting ? { sourceRoundIndex: meeting.roundIndex, sourceRoundName: meeting.rounds[meeting.roundIndex] ?? `Round ${meeting.roundIndex + 1}` } : {}),
    ...(message.authorId ? { agentId: message.authorId } : {}),
    companyId,
    ...(room.projectId ? { projectId: room.projectId } : {}),
    target: scope.target,
    category: detected.category,
    title: titleFor(content),
    content,
    importance,
    score,
    confidence,
    reasons,
    duplicate,
    potentialConflict,
    disposition: duplicate || score.total < 6 ? 'ignored' : 'pending',
    createdAt: now(),
    ...(duplicate || score.total < 6 ? { resolvedAt: now() } : {}),
  };
}

export function queueMemoryCandidate(
  room: Room,
  message: Message,
  companyId: string,
  meeting?: Pick<MeetingRoomState, 'roundIndex' | 'rounds'>,
): MemoryCandidate | null {
  const state = loadMemoryIntelligence();
  if (state.processedMessageIds.includes(message.id)) return state.candidates.find(candidate => candidate.sourceMessageId === message.id) ?? null;
  const candidate = assessMemoryCandidate(room, message, companyId, meeting);
  const processedMessageIds = [message.id, ...state.processedMessageIds.filter(id => id !== message.id)].slice(0, 4000);
  if (!candidate) {
    saveMemoryIntelligence({ ...state, processedMessageIds });
    return null;
  }
  saveMemoryIntelligence({
    ...state,
    candidates: [candidate, ...state.candidates].slice(0, 1200),
    processedMessageIds,
  });
  return candidate;
}

function createReviewSuggestion(candidate: MemoryCandidate): string | null {
  const memoryState = loadMemoryV2();
  const existing = memoryState.suggestions.find(item => item.sourceMessageId === candidate.sourceMessageId);
  if (existing) return existing.id;
  const suggestion: MemorySuggestion = {
    id: newId(),
    target: candidate.target,
    ...(candidate.agentId ? { agentId: candidate.agentId } : {}),
    companyId: candidate.companyId,
    ...(candidate.projectId ? { projectId: candidate.projectId } : {}),
    category: candidate.category,
    title: candidate.title,
    content: candidate.content,
    importance: candidate.importance,
    sourceRoomId: candidate.sourceRoomId,
    sourceMessageId: candidate.sourceMessageId,
    reasons: [
      `Memory Intelligence: ${candidate.score.total}/12 · ${candidate.confidence} confidence.`,
      ...(candidate.sourceRoundIndex !== undefined ? [`Round ${candidate.sourceRoundIndex + 1}${candidate.sourceRoundName ? ` · ${candidate.sourceRoundName}` : ''}.`] : []),
      ...candidate.reasons,
    ],
    status: 'pending',
    createdAt: now(),
  };
  updateMemoryV2(current => ({ ...current, suggestions: [suggestion, ...current.suggestions].slice(0, 300) }));
  return suggestion.id;
}

function recordMetadata(memoryRef: string, candidate: MemoryCandidate, origin: 'auto' | 'suggested'): void {
  updateState(state => ({
    ...state,
    metadata: {
      ...state.metadata,
      [memoryRef]: {
        memoryRef,
        origin,
        score: candidate.score.total,
        confidence: candidate.confidence,
        sourceRoomId: candidate.sourceRoomId,
        sourceMessageId: candidate.sourceMessageId,
        ...(candidate.sourceRoundIndex !== undefined ? { sourceRoundIndex: candidate.sourceRoundIndex } : {}),
        ...(candidate.sourceRoundName ? { sourceRoundName: candidate.sourceRoundName } : {}),
        target: candidate.target,
        createdAt: now(),
      },
    },
  }));
}

function autoSave(candidate: MemoryCandidate): string | null {
  let memoryId: string | null = null;
  if (candidate.target === 'agent' && candidate.agentId) {
    memoryId = addAgentMemory({
      agentId: candidate.agentId,
      companyId: candidate.companyId,
      category: candidate.category,
      title: candidate.title,
      content: candidate.content,
      status: 'active',
      importance: candidate.importance,
      sourceRoomId: candidate.sourceRoomId,
      sourceMessageId: candidate.sourceMessageId,
    });
  } else if (candidate.target === 'project' && candidate.projectId) {
    memoryId = addSharedMemory({
      scope: 'project',
      companyId: candidate.companyId,
      projectId: candidate.projectId,
      category: candidate.category,
      title: candidate.title,
      content: candidate.content,
      status: 'active',
      importance: candidate.importance,
      sourceRoomId: candidate.sourceRoomId,
      sourceMessageId: candidate.sourceMessageId,
    });
  } else if (candidate.target === 'company') {
    memoryId = addSharedMemory({
      scope: 'company',
      companyId: candidate.companyId,
      category: candidate.category,
      title: candidate.title,
      content: candidate.content,
      status: 'active',
      importance: candidate.importance,
      sourceRoomId: candidate.sourceRoomId,
      sourceMessageId: candidate.sourceMessageId,
    });
  }
  if (!memoryId) return null;
  const memoryRef = candidate.target === 'agent' ? `agent:${memoryId}` : `v2:${memoryId}`;
  recordMetadata(memoryRef, candidate, 'auto');
  return memoryRef;
}

export interface RoundConsolidationResult {
  autoSaved: number;
  reviewQueued: number;
  ignored: number;
}

export function consolidateRoundMemory(
  room: Room,
  meeting: Pick<MeetingRoomState, 'roundIndex' | 'rounds' | 'roundStage'>,
): RoundConsolidationResult {
  if (meeting.roundStage !== 'complete') return { autoSaved: 0, reviewQueued: 0, ignored: 0 };
  const state = loadMemoryIntelligence();
  const roundCandidates = state.candidates.filter(candidate =>
    candidate.disposition === 'pending'
    && candidate.sourceRoomId === room.id
    && candidate.sourceRoundIndex === meeting.roundIndex,
  );
  if (roundCandidates.length === 0) return { autoSaved: 0, reviewQueued: 0, ignored: 0 };

  const sorted = [...roundCandidates].sort((a, b) => b.score.total - a.score.total || b.createdAt - a.createdAt);
  const acceptedWithinRound: MemoryCandidate[] = [];
  const resolutions = new Map<string, Pick<MemoryCandidate, 'disposition' | 'suggestionId' | 'memoryRef' | 'resolvedAt'>>();
  let autoSaved = 0;
  let reviewQueued = 0;
  let ignored = 0;

  for (const candidate of sorted) {
    const duplicateInRound = acceptedWithinRound.some(accepted => overlap(accepted.content, candidate.content) >= 0.86 && accepted.target === candidate.target && accepted.category === candidate.category);
    if (candidate.duplicate || duplicateInRound || candidate.score.total < 6) {
      resolutions.set(candidate.id, { disposition: 'ignored', resolvedAt: now() });
      ignored += 1;
      continue;
    }
    acceptedWithinRound.push(candidate);
    if (candidate.score.total >= 9 && candidate.confidence === 'high' && !candidate.potentialConflict) {
      const memoryRef = autoSave(candidate);
      if (memoryRef) {
        resolutions.set(candidate.id, { disposition: 'auto-saved', memoryRef, resolvedAt: now() });
        autoSaved += 1;
        continue;
      }
    }
    const suggestionId = createReviewSuggestion(candidate);
    resolutions.set(candidate.id, { disposition: 'review', ...(suggestionId ? { suggestionId } : {}), resolvedAt: now() });
    reviewQueued += 1;
  }

  updateState(current => ({
    ...current,
    candidates: current.candidates.map(candidate => {
      const resolution = resolutions.get(candidate.id);
      return resolution ? { ...candidate, ...resolution } : candidate;
    }),
  }));
  refreshMemoryConflicts();
  reconcileSuggestedMemoryMetadata();
  return { autoSaved, reviewQueued, ignored };
}

export function reconcileSuggestedMemoryMetadata(): void {
  const intelligence = loadMemoryIntelligence();
  const reviewCandidates = intelligence.candidates.filter(candidate => candidate.disposition === 'review' && !candidate.memoryRef);
  if (reviewCandidates.length === 0) return;
  const suite = loadWorkspaceSuite();
  const shared = loadMemoryV2().sharedMemories;
  const links = new Map<string, string>();
  for (const candidate of reviewCandidates) {
    const agentMemory = suite.agentMemories.find(memory => memory.sourceMessageId === candidate.sourceMessageId);
    if (agentMemory) {
      links.set(candidate.id, `agent:${agentMemory.id}`);
      continue;
    }
    const sharedMemory = shared.find(memory => memory.sourceMessageId === candidate.sourceMessageId);
    if (sharedMemory) links.set(candidate.id, `v2:${sharedMemory.id}`);
  }
  if (links.size === 0) return;
  for (const candidate of reviewCandidates) {
    const memoryRef = links.get(candidate.id);
    if (memoryRef) recordMetadata(memoryRef, candidate, 'suggested');
  }
  updateState(current => ({
    ...current,
    candidates: current.candidates.map(candidate => {
      const memoryRef = links.get(candidate.id);
      return memoryRef ? { ...candidate, memoryRef } : candidate;
    }),
  }));
}

export function memoryIntelligenceMetadata(memoryRef: string): MemoryIntelligenceMetadata | undefined {
  return loadMemoryIntelligence().metadata[memoryRef];
}

export function memoryIntelligenceSummary(roomId?: string): { pending: number; autoSaved: number; review: number; ignored: number } {
  const candidates = loadMemoryIntelligence().candidates.filter(candidate => !roomId || candidate.sourceRoomId === roomId);
  return {
    pending: candidates.filter(candidate => candidate.disposition === 'pending').length,
    autoSaved: candidates.filter(candidate => candidate.disposition === 'auto-saved').length,
    review: candidates.filter(candidate => candidate.disposition === 'review').length,
    ignored: candidates.filter(candidate => candidate.disposition === 'ignored').length,
  };
}
