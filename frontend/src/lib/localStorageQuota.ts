const CANONICAL_SNAPSHOT_KEY = 'ai-team-chat:snapshot:v4';

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

    const freedCharacters = compactCanonicalLocalSnapshot();
    try {
      return { ok: true, recovered: true, freedCharacters, value: operation() };
    } catch (retryError) {
      return { ok: false, recovered: true, freedCharacters, error: retryError };
    }
  }
}

export function setLocalStorageWithQuotaRecovery(key: string, value: string): LocalStorageOperationResult<void> {
  return runWithLocalStorageQuotaRecovery(() => {
    localStorage.setItem(key, value);
  });
}
