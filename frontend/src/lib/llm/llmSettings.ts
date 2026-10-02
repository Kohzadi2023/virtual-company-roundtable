import { DEFAULT_MODEL_ID, findModel } from '@/lib/llm/pricing';

/**
 * Non-secret API preferences. Kept apart from the credentials entry so the
 * model choice can never drag the key along with it.
 */
export const LLM_SETTINGS_STORAGE_KEY = 'virtual-company:llm-settings:v1';

/** Fired after the key, model, budget or usage ledger changes so open UI can refresh. */
export const LLM_CHANGE_EVENT = 'virtual-company:llm-change';

export function notifyLlmChange(): void {
  window.dispatchEvent(new Event(LLM_CHANGE_EVENT));
}

export function getSelectedModel(): string {
  try {
    const raw = window.localStorage.getItem(LLM_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_MODEL_ID;
    const model = (JSON.parse(raw) as { model?: unknown }).model;
    return typeof model === 'string' && findModel(model) ? model : DEFAULT_MODEL_ID;
  } catch {
    return DEFAULT_MODEL_ID;
  }
}

export function setSelectedModel(model: string): void {
  if (!findModel(model)) return;
  try {
    window.localStorage.setItem(LLM_SETTINGS_STORAGE_KEY, JSON.stringify({ model }));
  } catch {
    // The choice just falls back to the default next load.
  }
  notifyLlmChange();
}
