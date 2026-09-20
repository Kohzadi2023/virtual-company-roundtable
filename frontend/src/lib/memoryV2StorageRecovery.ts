const MEMORY_V2_KEY = 'virtual-company:memory-v2:v1';
const MEMORY_V2_EVENT = 'virtual-company:memory-v2-changed';

interface RecoverableMemoryV2State {
  version?: number;
  sharedMemories?: unknown[];
  suggestions?: Array<{ status?: string; [key: string]: unknown }>;
  relations?: unknown[];
  conflicts?: Array<{ status?: string; [key: string]: unknown }>;
  history?: unknown[];
  agentMemoryCache?: Record<string, unknown>;
  [key: string]: unknown;
}

const LIMITS = {
  resolvedSuggestions: 100,
  relations: 300,
  resolvedConflicts: 100,
  history: 200,
  agentMemoryCache: 300,
} as const;

function keepNewestResolved<T extends { status?: string }>(
  entries: T[],
  activeStatus: string,
  resolvedLimit: number,
): T[] {
  const active = entries.filter(entry => entry.status === activeStatus);
  const resolved = entries.filter(entry => entry.status !== activeStatus).slice(0, resolvedLimit);
  return [...active, ...resolved];
}

function compactCache(cache: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!cache) return {};
  return Object.fromEntries(Object.entries(cache).slice(-LIMITS.agentMemoryCache));
}

export function isStorageQuotaExceeded(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: string; code?: number };
  return candidate.name === 'QuotaExceededError'
    || candidate.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || candidate.code === 22
    || candidate.code === 1014;
}

export function compactMemoryV2State(state: RecoverableMemoryV2State): RecoverableMemoryV2State {
  return {
    ...state,
    version: 1,
    // Active/shared memories are user-value data and are intentionally preserved.
    sharedMemories: Array.isArray(state.sharedMemories) ? state.sharedMemories : [],
    suggestions: keepNewestResolved(
      Array.isArray(state.suggestions) ? state.suggestions : [],
      'pending',
      LIMITS.resolvedSuggestions,
    ),
    relations: (Array.isArray(state.relations) ? state.relations : []).slice(0, LIMITS.relations),
    conflicts: keepNewestResolved(
      Array.isArray(state.conflicts) ? state.conflicts : [],
      'open',
      LIMITS.resolvedConflicts,
    ),
    history: (Array.isArray(state.history) ? state.history : []).slice(0, LIMITS.history),
    agentMemoryCache: compactCache(state.agentMemoryCache),
  };
}

export function recoverMemoryV2Storage(): boolean {
  try {
    const raw = localStorage.getItem(MEMORY_V2_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as RecoverableMemoryV2State;
    const compacted = compactMemoryV2State(parsed);
    const serialized = JSON.stringify(compacted);
    if (serialized.length >= raw.length) return false;
    localStorage.setItem(MEMORY_V2_KEY, serialized);
    window.dispatchEvent(new CustomEvent(MEMORY_V2_EVENT));
    return true;
  } catch (error) {
    console.warn('[Memory V2] Storage recovery could not compact persisted memory.', error);
    return false;
  }
}

export function runWithMemoryQuotaRecovery<T>(
  label: string,
  operation: () => T,
  fallback: T,
): T {
  try {
    return operation();
  } catch (error) {
    if (!isStorageQuotaExceeded(error)) throw error;

    const recovered = recoverMemoryV2Storage();
    if (recovered) {
      try {
        return operation();
      } catch (retryError) {
        if (!isStorageQuotaExceeded(retryError)) throw retryError;
      }
    }

    console.warn(`[Memory V2] ${label} was skipped because browser storage is full.`);
    return fallback;
  }
}
