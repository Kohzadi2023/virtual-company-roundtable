import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBudgetState, recordUsage, resetBudgetMemory, saveBudgetSettings } from '@/lib/llm/budget';
import {
  LLM_CREDENTIALS_STORAGE_KEY,
  clearApiKey,
  getApiKey,
  hasApiKey,
  isSessionOnlyKey,
  resetSessionKeys,
  setApiKey,
} from '@/lib/llm/credentials';
import { getLlmSettings, resetSettingsMemory, updateLlmSettings } from '@/lib/llm/llmSettings';

const NAMES = ['virtual-company:llm-credentials:v1', 'virtual-company:llm-budget:v1', 'virtual-company:llm-settings:v1'];

function quotaError(): DOMException {
  return new DOMException('The quota has been exceeded.', 'QuotaExceededError');
}

/** Makes writes to the LLM keys fail, like a browser whose localStorage is full. */
function fillStorage() {
  const original = window.localStorage.setItem.bind(window.localStorage);
  return vi.spyOn(window.localStorage, 'setItem').mockImplementation((key: string, value: string) => {
    if (NAMES.includes(key)) throw quotaError();
    original(key, value);
  });
}

beforeEach(() => {
  window.localStorage.clear();
  resetSessionKeys();
  resetBudgetMemory();
  resetSettingsMemory();
});
afterEach(() => vi.restoreAllMocks());

describe('API key when browser storage is full', () => {
  it('keeps working for the session and says it was not persisted', () => {
    fillStorage();
    expect(setApiKey('gemini', 'SESSION-KEY-123456')).toBe('session-only');
    expect(getApiKey('gemini')).toBe('SESSION-KEY-123456');
    expect(hasApiKey('gemini')).toBe(true);
    expect(isSessionOnlyKey('gemini')).toBe(true);
    expect(window.localStorage.getItem(LLM_CREDENTIALS_STORAGE_KEY)).toBeNull();
  });

  it('frees space the app can safely free, then saves normally', () => {
    window.localStorage.setItem('ai-team-chat:snapshot:v4', JSON.stringify({ rooms: [], extensions: { big: 'x'.repeat(1000) } }));
    window.localStorage.setItem('ai-team-chat:snapshot:v3', 'old'.repeat(100));
    const original = window.localStorage.setItem.bind(window.localStorage);
    let failedOnce = false;
    vi.spyOn(window.localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === LLM_CREDENTIALS_STORAGE_KEY && !failedOnce) {
        failedOnce = true;
        throw quotaError();
      }
      original(key, value);
    });

    expect(setApiKey('gemini', 'KEY-AFTER-RECOVERY')).toBe('saved');
    expect(isSessionOnlyKey('gemini')).toBe(false);
    expect(window.localStorage.getItem('ai-team-chat:snapshot:v3')).toBeNull();
    expect(getApiKey('gemini')).toBe('KEY-AFTER-RECOVERY');
  });

  it('clearing removes both stored and session copies', () => {
    fillStorage();
    setApiKey('gemini', 'SESSION-KEY-123456');
    clearApiKey('gemini');
    expect(hasApiKey('gemini')).toBe(false);
  });
});

describe('budget and settings when browser storage is full', () => {
  it('keeps counting spend in memory so the budget guard still works', () => {
    fillStorage();
    saveBudgetSettings({ perMeetingUsd: 5 });
    recordUsage({ at: Date.now(), roomId: 'r', model: 'm', costUsd: 1.5, inputTokens: 10, outputTokens: 10 });
    recordUsage({ at: Date.now(), roomId: 'r', model: 'm', costUsd: 1.5, inputTokens: 10, outputTokens: 10 });

    const state = loadBudgetState();
    expect(state.settings.perMeetingUsd).toBe(5);
    expect(state.entries).toHaveLength(2);
  });

  it('returns to normal persistence once writes succeed again', () => {
    const spy = fillStorage();
    recordUsage({ at: Date.now(), roomId: 'r', model: 'm', costUsd: 1, inputTokens: 1, outputTokens: 1 });
    spy.mockRestore();
    recordUsage({ at: Date.now(), roomId: 'r', model: 'm', costUsd: 1, inputTokens: 1, outputTokens: 1 });
    expect(loadBudgetState().entries).toHaveLength(2);
    expect(JSON.parse(window.localStorage.getItem('virtual-company:llm-budget:v1')!).entries).toHaveLength(2);
  });

  it('still applies model/settings choices for the session', () => {
    fillStorage();
    updateLlmSettings({ tokenSaver: false, model: 'gemini-3.5-flash-lite' });
    expect(getLlmSettings()).toMatchObject({ tokenSaver: false, model: 'gemini-3.5-flash-lite' });
  });
});
