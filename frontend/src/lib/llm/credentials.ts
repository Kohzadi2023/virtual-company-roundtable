import { setLocalStorageWithQuotaRecovery } from '@/lib/localStorageQuota';
import type { LlmProviderId } from '@/lib/llm/types';

/**
 * Per-user (BYOK) API keys.
 *
 * The key lives under its own localStorage entry on purpose: the workspace
 * snapshot, the backup/export SOURCES list and the debug-snapshot export all
 * enumerate specific keys, so anything stored here is never carried into a
 * backup, a shared export, or the backend sync payload.
 */
export const LLM_CREDENTIALS_STORAGE_KEY = 'virtual-company:llm-credentials:v1';

type CredentialMap = Partial<Record<LlmProviderId, string>>;

/**
 * Keys that could not be written to localStorage (a long-lived workspace can
 * fill the browser quota). They still work until the tab is closed, so a full
 * disk of workspace data never makes the API feature unusable.
 */
const sessionKeys: CredentialMap = {};

function readStored(): CredentialMap {
  try {
    const raw = window.localStorage.getItem(LLM_CREDENTIALS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: CredentialMap = {};
    const gemini = (parsed as Record<string, unknown>).gemini;
    if (typeof gemini === 'string' && gemini.trim()) result.gemini = gemini.trim();
    return result;
  } catch {
    return {};
  }
}

export function getApiKey(provider: LlmProviderId): string | undefined {
  return readStored()[provider] ?? sessionKeys[provider];
}

export function hasApiKey(provider: LlmProviderId): boolean {
  return getApiKey(provider) !== undefined;
}

export type SaveKeyResult = 'saved' | 'session-only';

/**
 * Stores the key. Quota pressure is handled with the app's usual recovery
 * (dropping redundant snapshot copies) before giving up; if the browser still
 * refuses, the key is held for this session only and the caller is told.
 */
export function setApiKey(provider: LlmProviderId, key: string): SaveKeyResult {
  const trimmed = key.trim();
  if (!trimmed) {
    clearApiKey(provider);
    return 'saved';
  }
  const result = setLocalStorageWithQuotaRecovery(
    LLM_CREDENTIALS_STORAGE_KEY,
    JSON.stringify({ ...readStored(), [provider]: trimmed }),
  );
  if (result.ok) {
    delete sessionKeys[provider];
    return 'saved';
  }
  sessionKeys[provider] = trimmed;
  return 'session-only';
}

export function clearApiKey(provider: LlmProviderId): void {
  delete sessionKeys[provider];
  try {
    const next = readStored();
    delete next[provider];
    if (Object.keys(next).length === 0) window.localStorage.removeItem(LLM_CREDENTIALS_STORAGE_KEY);
    else window.localStorage.setItem(LLM_CREDENTIALS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Nothing useful to do: the stored copy simply stays where it was.
  }
}

/** True when the key is only held in memory and will be gone after a reload. */
export function isSessionOnlyKey(provider: LlmProviderId): boolean {
  return sessionKeys[provider] !== undefined && readStored()[provider] === undefined;
}

/** Test hook. */
export function resetSessionKeys(): void {
  for (const provider of Object.keys(sessionKeys) as LlmProviderId[]) delete sessionKeys[provider];
}

/** "AIza…wXyZ" style display so the UI can confirm a key without revealing it. */
export function maskApiKey(key: string): string {
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
