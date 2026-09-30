import { recoverMemoryV2Storage } from '@/lib/memoryV2StorageRecovery';

const CANONICAL_SNAPSHOT_KEY = 'ai-team-chat:snapshot:v4';
const LEGACY_SNAPSHOT_KEYS = ['ai-team-chat:snapshot:v3', 'ai-team-chat:snapshot:v2'] as const;
const MEMORY_V2_KEY = 'virtual-company:memory-v2:v1';

export interface LocalStorageOperationResult<T> {
  ok: boolean;
  recovered: boolean;
  freedCharacters: number;
  value?: T;
  error?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isQuotaExceededError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'QuotaExceededError'
      || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      || error.code === 22
      || error.code === 1014;
  }
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return candidate.name === 'QuotaExceededError'
    || candidate.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || candidate.code === 22
    || candidate.code === 1014;
}

/**
 * The canonical workspace snapshot is persisted remotely with its extension
 * bundle, while each extension is also stored in its own localStorage key for
 * live feature access. Keeping that same extension bundle inside the local
 * canonical snapshot duplicates data under the browser's small localStorage
 * quota. Remove only that redundant local copy; the extension keys themselves
 * and the remote snapshot remain untouched.
 */
export function compactCanonicalLocalSnapshot(): number {
  try {
    const raw = localStorage.getItem(CANONICAL_SNAPSHOT_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !Object.prototype.hasOwnProperty.call(parsed, 'extensions')) return 0;

    const { extensions: _extensions, ...compact } = parsed;
    const next = JSON.stringify(compact);
    if (next.length >= raw.length) return 0;
    localStorage.setItem(CANONICAL_SNAPSHOT_KEY, next);
    return raw.length - next.length;
  } catch {
    return 0;
  }
}

/**
 * Once a v4 canonical snapshot exists, older whole-workspace snapshots are
 * redundant migration sources. Removing them is safe and can free a meaningful
 * amount of quota in long-lived browser profiles.
 */
export function removeRedundantLegacySnapshots(): number {
  try {
    if (!localStorage.getItem(CANONICAL_SNAPSHOT_KEY)) return 0;
    let freed = 0;
    for (const key of LEGACY_SNAPSHOT_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      freed += raw.length;
      localStorage.removeItem(key);
    }
    return freed;
  } catch {
    return 0;
  }
}

function compactRecoverableMemoryV2(): number {
  try {
    const before = localStorage.getItem(MEMORY_V2_KEY)?.length ?? 0;
    if (!before || !recoverMemoryV2Storage()) return 0;
    const after = localStorage.getItem(MEMORY_V2_KEY)?.length ?? 0;
    return Math.max(0, before - after);
  } catch {
    return 0;
  }
}

export function stripExtensionsForLocalSnapshot<T extends { extensions?: unknown }>(snapshot: T): Omit<T, 'extensions'> {
  const { extensions: _extensions, ...localSnapshot } = snapshot;
  return localSnapshot;
}

export function runWithLocalStorageQuotaRecovery<T>(operation: () => T): LocalStorageOperationResult<T> {
  try {
    return { ok: true, recovered: false, freedCharacters: 0, value: operation() };
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      return { ok: false, recovered: false, freedCharacters: 0, error };
    }
  }

  let freedCharacters = compactCanonicalLocalSnapshot() + removeRedundantLegacySnapshots();
  try {
    return { ok: true, recovered: true, freedCharacters, value: operation() };
  } catch (retryError) {
    if (!isQuotaExceededError(retryError)) {
      return { ok: false, recovered: true, freedCharacters, error: retryError };
    }

    // Memory V2 already has a conservative compactor that preserves active
    // memories while pruning bounded caches/history. Use it only if the first
    // quota recovery stage was not enough.
    freedCharacters += compactRecoverableMemoryV2();
    try {
      return { ok: true, recovered: true, freedCharacters, value: operation() };
    } catch (finalError) {
      return { ok: false, recovered: true, freedCharacters, error: finalError };
    }
  }
}

export function setLocalStorageWithQuotaRecovery(key: string, value: string): LocalStorageOperationResult<void> {
  return runWithLocalStorageQuotaRecovery(() => {
    localStorage.setItem(key, value);
  });
}
