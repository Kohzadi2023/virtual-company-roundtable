const MEMORY_V2_STORAGE_KEY = 'virtual-company:memory-v2:v1';
const HISTORY_LIMIT = 250;
const RESOLVED_SUGGESTION_LIMIT = 60;
const RESOLVED_CONFLICT_LIMIT = 60;
const DERIVED_CACHE_COMPACTION_THRESHOLD = 750_000;
const DEFAULT_SAFE_STORAGE_CHAR_LIMIT = 2_000_000;

interface LooseSuggestion {
  status?: string;
  createdAt?: number;
}

interface LooseConflict {
  status?: string;
  createdAt?: number;
  resolvedAt?: number;
}

interface LooseMemoryV2State {
  version?: number;
  sharedMemories?: unknown[];
  suggestions?: LooseSuggestion[];
  relations?: unknown[];
  conflicts?: LooseConflict[];
  history?: unknown[];
  agentMemoryCache?: Record<string, unknown>;
  [key: string]: unknown;
}

function newestFirst<T extends { createdAt?: number; resolvedAt?: number }>(entries: T[]): T[] {
  return [...entries].sort((left, right) =>
    (right.resolvedAt ?? right.createdAt ?? 0) - (left.resolvedAt ?? left.createdAt ?? 0),
  );
}

export function isStorageQuotaError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED';
  }
  if (error instanceof Error) {
    return error.name === 'QuotaExceededError' || /quota/i.test(error.message);
  }
  return false;
}

export function compactMemoryV2State(state: LooseMemoryV2State): LooseMemoryV2State {
  const suggestions = Array.isArray(state.suggestions) ? state.suggestions : [];
  const pendingSuggestions = suggestions.filter(item => item.status === 'pending');
  const resolvedSuggestions = newestFirst(
    suggestions.filter(item => item.status !== 'pending'),
  ).slice(0, RESOLVED_SUGGESTION_LIMIT);

  const conflicts = Array.isArray(state.conflicts) ? state.conflicts : [];
  const openConflicts = conflicts.filter(item => item.status === 'open');
  const resolvedConflicts = newestFirst(
    conflicts.filter(item => item.status !== 'open'),
  ).slice(0, RESOLVED_CONFLICT_LIMIT);

  return {
    ...state,
    version: 1,
    sharedMemories: Array.isArray(state.sharedMemories) ? state.sharedMemories : [],
    suggestions: [...pendingSuggestions, ...resolvedSuggestions],
    relations: Array.isArray(state.relations) ? state.relations : [],
    conflicts: [...openConflicts, ...resolvedConflicts],
    history: Array.isArray(state.history) ? state.history.slice(0, HISTORY_LIMIT) : [],
    // This cache is derived from Workspace Suite agent memories. Dropping it under
    // pressure never deletes a user memory; it only sacrifices change-history
    // detection until the cache is rebuilt when sufficient headroom exists.
    agentMemoryCache: {},
  };
}

export function compactMemoryV2Storage(): boolean {
  const raw = localStorage.getItem(MEMORY_V2_STORAGE_KEY);
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw) as LooseMemoryV2State;
    const compacted = JSON.stringify(compactMemoryV2State(parsed));
    if (compacted.length >= raw.length) return false;
    localStorage.setItem(MEMORY_V2_STORAGE_KEY, compacted);
    console.warn(
      `[MemoryV2] Compacted local storage from ${raw.length.toLocaleString()} to ${compacted.length.toLocaleString()} characters.`,
    );
    return true;
  } catch (error) {
    console.warn('[MemoryV2] Unable to compact local storage.', error);
    return false;
  }
}

export function prepareMemoryV2Storage(): boolean {
  const raw = localStorage.getItem(MEMORY_V2_STORAGE_KEY);
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw) as LooseMemoryV2State;
    const hasOversizedHistory = Array.isArray(parsed.history) && parsed.history.length > HISTORY_LIMIT;
    const hasOversizedResolvedSuggestions = Array.isArray(parsed.suggestions)
      && parsed.suggestions.filter(item => item.status !== 'pending').length > RESOLVED_SUGGESTION_LIMIT;
    const hasOversizedResolvedConflicts = Array.isArray(parsed.conflicts)
      && parsed.conflicts.filter(item => item.status !== 'open').length > RESOLVED_CONFLICT_LIMIT;
    const hasLargeDerivedCache = raw.length > DERIVED_CACHE_COMPACTION_THRESHOLD
      && Boolean(parsed.agentMemoryCache && Object.keys(parsed.agentMemoryCache).length > 0);

    if (!hasOversizedHistory && !hasOversizedResolvedSuggestions && !hasOversizedResolvedConflicts && !hasLargeDerivedCache) {
      return false;
    }
    return compactMemoryV2Storage();
  } catch {
    return false;
  }
}

export function estimateLocalStorageCharacters(): number {
  let total = 0;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    total += key.length + (localStorage.getItem(key)?.length ?? 0);
  }
  return total;
}

export function hasLocalStorageHeadroom(
  anticipatedAdditionalCharacters = 0,
  safeCharacterLimit = DEFAULT_SAFE_STORAGE_CHAR_LIMIT,
): boolean {
  return estimateLocalStorageCharacters() + Math.max(0, anticipatedAdditionalCharacters) < safeCharacterLimit;
}

export function runWithMemoryV2StorageRecovery<T>(
  operation: () => T,
  label = 'memory operation',
): T | undefined {
  try {
    return operation();
  } catch (error) {
    if (!isStorageQuotaError(error)) throw error;

    console.warn(`[MemoryV2] Storage quota reached during ${label}; compacting and retrying once.`);
    compactMemoryV2Storage();

    try {
      return operation();
    } catch (retryError) {
      if (!isStorageQuotaError(retryError)) throw retryError;
      console.error(`[MemoryV2] ${label} was skipped because local storage is still full after compaction.`);
      return undefined;
    }
  }
}
