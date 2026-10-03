import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { DEFAULT_MODEL_ID, findModel } from '@/lib/llm/pricing';
import { setLocalStorageWithQuotaRecovery } from '@/lib/localStorageQuota';

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

/** How long agents may write. Every answer is re-sent in every later call, so length compounds. */
export type AnswerLength = 'normal' | 'concise' | 'brief';
const ANSWER_LENGTHS: readonly AnswerLength[] = ['normal', 'concise', 'brief'];

export interface LlmSettings {
  /** Model for Olivia and, unless overridden, everyone else. */
  model: string;
  /** Optional cheaper model for specialist turns; null means "same as model". */
  specialistModel: string | null;
  /** Hidden reasoning is billed as output; 'low' trims it. */
  thinking: ThinkingPreference;
  /** Summarise older discussion sooner to cut input tokens. */
  tokenSaver: boolean;
  answerLength: AnswerLength;
}

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  model: DEFAULT_MODEL_ID,
  specialistModel: null,
  thinking: 'low',
  // Off by default: summarising older discussion saves tokens but can lose
  // details (numbering, earlier positions) that later rounds depend on.
  tokenSaver: false,
  answerLength: 'normal',
};

/**
 * Stored settings written before this version always carried tokenSaver=true
 * even when the user never chose it. Only a value saved at this version or
 * later is treated as an explicit choice.
 */
const SETTINGS_SCHEMA = 2;

/** Holds settings the browser refused to store, so choices still apply this session. */
let unpersistedSettings: LlmSettings | null = null;

/** Test hook. */
export function resetSettingsMemory(): void {
  unpersistedSettings = null;
}

export function getLlmSettings(): LlmSettings {
  if (unpersistedSettings) return { ...unpersistedSettings };
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
      tokenSaver:
        (parsed as { schema?: unknown }).schema === SETTINGS_SCHEMA && typeof parsed.tokenSaver === 'boolean'
          ? parsed.tokenSaver
          : DEFAULT_LLM_SETTINGS.tokenSaver,
      answerLength: ANSWER_LENGTHS.includes(parsed.answerLength as AnswerLength)
        ? (parsed.answerLength as AnswerLength)
        : DEFAULT_LLM_SETTINGS.answerLength,
    };
  } catch {
    return { ...DEFAULT_LLM_SETTINGS };
  }
}

export function updateLlmSettings(patch: Partial<LlmSettings>): LlmSettings {
  const next = { ...getLlmSettings(), ...patch };
  if (!findModel(next.model)) next.model = DEFAULT_LLM_SETTINGS.model;
  if (next.specialistModel !== null && !findModel(next.specialistModel)) next.specialistModel = null;
  const result = setLocalStorageWithQuotaRecovery(LLM_SETTINGS_STORAGE_KEY, JSON.stringify({ ...next, schema: SETTINGS_SCHEMA }));
  unpersistedSettings = result.ok ? null : { ...next };
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
