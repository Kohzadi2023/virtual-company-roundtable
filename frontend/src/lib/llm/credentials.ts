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

function readAll(): CredentialMap {
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
  return readAll()[provider];
}

export function hasApiKey(provider: LlmProviderId): boolean {
  return getApiKey(provider) !== undefined;
}

/** Returns false if the browser refused the write (quota, private mode). */
export function setApiKey(provider: LlmProviderId, key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed) {
    clearApiKey(provider);
    return true;
  }
  try {
    window.localStorage.setItem(LLM_CREDENTIALS_STORAGE_KEY, JSON.stringify({ ...readAll(), [provider]: trimmed }));
    return true;
  } catch {
    return false;
  }
}

export function clearApiKey(provider: LlmProviderId): void {
  try {
    const next = readAll();
    delete next[provider];
    if (Object.keys(next).length === 0) window.localStorage.removeItem(LLM_CREDENTIALS_STORAGE_KEY);
    else window.localStorage.setItem(LLM_CREDENTIALS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Nothing useful to do: the key simply stays where it was.
  }
}

/** "AIza…wXyZ" style display so the UI can confirm a key without revealing it. */
export function maskApiKey(key: string): string {
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
