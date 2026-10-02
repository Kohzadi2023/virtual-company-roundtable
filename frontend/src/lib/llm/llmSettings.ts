import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { DEFAULT_MODEL_ID, findModel } from '@/lib/llm/pricing';

/**
 * Non-secret API preferences. Kept apart from the credentials entry so none of
 * these choices can ever drag the key along with them.
 */
export const LLM_SETTINGS_STORAGE_KEY = 'virtual-company:llm-settings:v1';

/** Fired after the key, settings, budget or usage ledger changes so open UI can refresh. */
export const LLM_CHANGE_EVENT = 'virtual-company:llm-change';

export function notifyLlmChange(): void {
  window.dispatchEvent(new Event(LLM_CHANGE_EVENT));
}

export type ThinkingPreference = 'default' | 'low';

export interface LlmSettings {
  /** Model for Olivia and, unless overridden, everyone else. */
  model: string;
  /** Optional cheaper model for specialist turns; null means "same as model". */
  specialistModel: string | null;
  /** Hidden reasoning is billed as output; 'low' trims it. */
  thinking: ThinkingPreference;
  /** Summarise older discussion sooner to cut input tokens. */
  tokenSaver: boolean;
}

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  model: DEFAULT_MODEL_ID,
  specialistModel: null,
  thinking: 'low',
  tokenSaver: true,
};

export function getLlmSettings(): LlmSettings {
  try {
    const raw = window.localStorage.getItem(LLM_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LLM_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Record<keyof LlmSettings, unknown>>;
    const model = typeof parsed.model === 'string' && findModel(parsed.model) ? parsed.model : DEFAULT_LLM_SETTINGS.model;
    const specialistModel =
      typeof parsed.specialistModel === 'string' && findModel(parsed.specialistModel) ? parsed.specialistModel : null;
    return {
      model,
      specialistModel,
      thinking: parsed.thinking === 'default' || parsed.thinking === 'low' ? parsed.thinking : DEFAULT_LLM_SETTINGS.thinking,
      tokenSaver: typeof parsed.tokenSaver === 'boolean' ? parsed.tokenSaver : DEFAULT_LLM_SETTINGS.tokenSaver,
    };
  } catch {
    return { ...DEFAULT_LLM_SETTINGS };
  }
}

export function updateLlmSettings(patch: Partial<LlmSettings>): LlmSettings {
  const next = { ...getLlmSettings(), ...patch };
  if (!findModel(next.model)) next.model = DEFAULT_LLM_SETTINGS.model;
  if (next.specialistModel !== null && !findModel(next.specialistModel)) next.specialistModel = null;
  try {
    window.localStorage.setItem(LLM_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The choice just falls back to the defaults next load.
  }
  notifyLlmChange();
  return next;
}

export function getSelectedModel(): string {
  return getLlmSettings().model;
}

export function setSelectedModel(model: string): void {
  if (!findModel(model)) return;
  updateLlmSettings({ model });
}

/** Olivia (and any agent when no specialist model is set) uses the main model. */
export function modelForAgent(agentId: string | undefined, settings: LlmSettings = getLlmSettings()): string {
  if (agentId === undefined || agentId === MEETING_FACILITATOR_AGENT_ID) return settings.model;
  return settings.specialistModel ?? settings.model;
}
