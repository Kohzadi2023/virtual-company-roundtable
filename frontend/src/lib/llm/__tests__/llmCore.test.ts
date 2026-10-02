import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BUDGET_SETTINGS,
  LLM_BUDGET_STORAGE_KEY,
  checkBudget,
  loadBudgetState,
  monthSpendUsd,
  pruneEntries,
  recordUsage,
  saveBudgetSettings,
} from '@/lib/llm/budget';
import type { BudgetState, UsageEntry } from '@/lib/llm/budget';
import {
  LLM_CREDENTIALS_STORAGE_KEY,
  clearApiKey,
  getApiKey,
  maskApiKey,
  setApiKey,
} from '@/lib/llm/credentials';
import { geminiProvider, parseGeminiResponse } from '@/lib/llm/geminiProvider';
import { runLlm } from '@/lib/llm/llmClient';
import { estimateCostUsd, rateFor } from '@/lib/llm/pricing';
import { LlmError } from '@/lib/llm/types';
import type { LlmProvider, LlmResponse } from '@/lib/llm/types';

const usage = { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 1_000_000, thoughtTokens: 0 };

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('pricing', () => {
  it('doubles Gemini 3.8 Flash rates when the promotion ends', () => {
    expect(rateFor('gemini-3.8-flash', new Date('2026-12-31T12:00:00Z'))?.input).toBe(0.75);
    expect(rateFor('gemini-3.8-flash', new Date('2027-01-01T00:00:00Z'))?.input).toBe(1.5);
  });

  it('bills thoughts as output and cached input at the cached rate', () => {
    const at = new Date('2026-10-02T00:00:00Z');
    const cost = estimateCostUsd(
      'gemini-3.8-flash',
      { inputTokens: 1_000_000, cachedInputTokens: 500_000, outputTokens: 100_000, thoughtTokens: 100_000 },
      at,
    );
    // 0.5M*0.75 + 0.5M*0.075 + 0.2M*3.75
    expect(cost).toBeCloseTo(0.375 + 0.0375 + 0.75, 6);
  });

  it('prices unknown models at the most expensive known rate', () => {
    const at = new Date('2026-10-02T00:00:00Z');
    expect(estimateCostUsd('mystery-model', usage, at)).toBeCloseTo(estimateCostUsd('gemini-3.1-pro-preview', usage, at), 6);
  });
});

describe('credentials', () => {
  it('round-trips, trims, masks and clears a key', () => {
    expect(getApiKey('gemini')).toBeUndefined();
    expect(setApiKey('gemini', '  AIzaSyExampleKey1234  ')).toBe(true);
    expect(getApiKey('gemini')).toBe('AIzaSyExampleKey1234');
    expect(maskApiKey('AIzaSyExampleKey1234')).toBe('AIza…1234');
    clearApiKey('gemini');
    expect(getApiKey('gemini')).toBeUndefined();
    expect(window.localStorage.getItem(LLM_CREDENTIALS_STORAGE_KEY)).toBeNull();
  });

  it('tolerates corrupt storage', () => {
    window.localStorage.setItem(LLM_CREDENTIALS_STORAGE_KEY, '{not json');
    expect(getApiKey('gemini')).toBeUndefined();
  });

  it('keeps the key out of the workspace snapshot keys', () => {
    expect(LLM_CREDENTIALS_STORAGE_KEY).not.toContain('snapshot');
    expect(LLM_BUDGET_STORAGE_KEY).not.toBe(LLM_CREDENTIALS_STORAGE_KEY);
  });
});

describe('budget', () => {
  const NOW = new Date('2026-10-15T10:00:00').getTime();
  const entry = (overrides: Partial<UsageEntry> = {}): UsageEntry => ({
    at: NOW,
    roomId: 'r1',
    model: 'gemini-3.8-flash',
    costUsd: 1,
    inputTokens: 10,
    outputTokens: 10,
    ...overrides,
  });
  const state = (entries: UsageEntry[], settings = DEFAULT_BUDGET_SETTINGS): BudgetState => ({ settings, entries });

  it('allows spend under every limit', () => {
    expect(checkBudget(state([entry()]), 'r1', NOW).ok).toBe(true);
  });

  it('stops at the per-meeting limit and reserves the estimated next cost', () => {
    const settings = { ...DEFAULT_BUDGET_SETTINGS, perMeetingUsd: 2 };
    expect(checkBudget(state([entry()], settings), 'r1', NOW, 0.5).ok).toBe(true);
    const verdict = checkBudget(state([entry()], settings), 'r1', NOW, 1.5);
    expect(verdict).toMatchObject({ ok: false, reason: 'meeting' });
    expect(checkBudget(state([entry()], settings), 'other-room', NOW).ok).toBe(true);
  });

  it('stops at the monthly limit across rooms but not across months', () => {
    const settings = { ...DEFAULT_BUDGET_SETTINGS, perMonthUsd: 3 };
    const entries = [entry({ roomId: 'a', costUsd: 2 }), entry({ roomId: 'b', costUsd: 1.5 })];
    expect(checkBudget(state(entries, settings), 'c', NOW)).toMatchObject({ ok: false, reason: 'month' });
    const nextMonth = new Date('2026-11-02T10:00:00').getTime();
    expect(monthSpendUsd(entries, nextMonth)).toBe(0);
    expect(checkBudget(state(entries, settings), 'c', nextMonth).ok).toBe(true);
  });

  it('stops at the per-meeting call cap', () => {
    const settings = { ...DEFAULT_BUDGET_SETTINGS, maxCallsPerMeeting: 2 };
    const entries = [entry({ costUsd: 0 }), entry({ costUsd: 0 })];
    expect(checkBudget(state(entries, settings), 'r1', NOW)).toMatchObject({ ok: false, reason: 'calls' });
  });

  it('treats a zero budget as "refuse", not "unlimited"', () => {
    expect(checkBudget(state([], { ...DEFAULT_BUDGET_SETTINGS, perMeetingUsd: 0 }), 'r1', NOW).ok).toBe(false);
    expect(checkBudget(state([], { ...DEFAULT_BUDGET_SETTINGS, perMonthUsd: 0 }), 'r1', NOW).ok).toBe(false);
  });

  it('persists settings and entries, rejecting invalid values', () => {
    saveBudgetSettings({ perMeetingUsd: 5, perMonthUsd: -1 });
    recordUsage(entry());
    const loaded = loadBudgetState();
    expect(loaded.settings.perMeetingUsd).toBe(5);
    expect(loaded.settings.perMonthUsd).toBe(DEFAULT_BUDGET_SETTINGS.perMonthUsd);
    expect(loaded.entries).toHaveLength(1);
  });

  it('prunes entries older than the retention window', () => {
    const old = entry({ at: NOW - 200 * 24 * 60 * 60 * 1000 });
    expect(pruneEntries([old, entry()], NOW)).toHaveLength(1);
  });
});

describe('parseGeminiResponse', () => {
  const ok = {
    candidates: [
      {
        finishReason: 'STOP',
        content: { parts: [{ text: 'hidden reasoning', thought: true }, { text: 'Hello ' }, { text: 'world' }] },
      },
    ],
    usageMetadata: { promptTokenCount: 100, cachedContentTokenCount: 40, candidatesTokenCount: 10, thoughtsTokenCount: 25 },
  };

  it('joins visible parts, drops thought parts, and maps usage', () => {
    const result = parseGeminiResponse('m', ok);
    expect(result.text).toBe('Hello world');
    expect(result.usage).toEqual({ inputTokens: 100, cachedInputTokens: 40, outputTokens: 10, thoughtTokens: 25 });
  });

  it('classifies prompt blocks, safety stops, truncation and empty replies', () => {
    expect(() => parseGeminiResponse('m', { promptFeedback: { blockReason: 'SAFETY' } })).toThrowError(
      expect.objectContaining({ kind: 'blocked' }),
    );
    expect(() => parseGeminiResponse('m', { candidates: [{ finishReason: 'SAFETY' }] })).toThrowError(
      expect.objectContaining({ kind: 'blocked' }),
    );
    expect(() =>
      parseGeminiResponse('m', { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'partial' }] } }] }),
    ).toThrowError(expect.objectContaining({ kind: 'truncated' }));
    expect(() => parseGeminiResponse('m', { candidates: [{ finishReason: 'STOP', content: { parts: [] } }] })).toThrowError(
      expect.objectContaining({ kind: 'empty' }),
    );
  });
});

describe('geminiProvider.generate', () => {
  const okBody = {
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'hi' }] } }],
    usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 },
  };
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('sends the key in a header (never the URL) and only sends thinking config when set', async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(jsonResponse(okBody)));
    vi.stubGlobal('fetch', fetchMock);

    await geminiProvider.generate('SECRET', { model: 'gemini-3.8-flash', prompt: 'p', system: 's' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    expect(url).not.toContain('SECRET');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('SECRET');
    const sent = JSON.parse(init.body as string);
    expect(sent.systemInstruction.parts[0].text).toBe('s');
    expect(sent.generationConfig.thinkingConfig).toBeUndefined();

    await geminiProvider.generate('SECRET', { model: 'gemini-3.8-flash', prompt: 'p', thinkingLevel: 'low' });
    const second = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(second.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
    vi.unstubAllGlobals();
  });

  it.each([
    [401, 'auth', false],
    [403, 'auth', false],
    [429, 'rate-limit', true],
    [503, 'server', true],
    [400, 'bad-request', false],
  ])('classifies HTTP %i as %s', async (status, kind, retryable) => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ error: { message: 'nope' } }, status))));
    const error = await geminiProvider.generate('k', { model: 'm', prompt: 'p' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).kind).toBe(kind);
    expect((error as LlmError).retryable).toBe(retryable);
    vi.unstubAllGlobals();
  });

  it('reports network failures and caller aborts distinctly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(geminiProvider.generate('k', { model: 'm', prompt: 'p' })).rejects.toMatchObject({ kind: 'network' });

    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
      ),
    );
    const controller = new AbortController();
    const pending = geminiProvider.generate('k', { model: 'm', prompt: 'p', signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
    vi.unstubAllGlobals();
  });

  it('times out slow requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
      ),
    );
    await expect(geminiProvider.generate('k', { model: 'm', prompt: 'p', timeoutMs: 5 })).rejects.toMatchObject({ kind: 'timeout' });
    vi.unstubAllGlobals();
  });
});

describe('runLlm', () => {
  const response: LlmResponse = {
    text: 'ok',
    finishReason: 'STOP',
    model: 'gemini-3.8-flash',
    usage: { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 500, thoughtTokens: 500 },
  };
  const request = { model: 'gemini-3.8-flash', prompt: 'p' };
  const noSleep = (_ms: number) => Promise.resolve();

  it('refuses without a saved key and never calls the provider', async () => {
    const generate = vi.fn();
    await expect(runLlm(request, { roomId: 'r', provider: { id: 'gemini', generate } })).rejects.toMatchObject({
      kind: 'no-credentials',
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it('passes the stored key, records the cost, and counts thoughts as output', async () => {
    setApiKey('gemini', 'KEY');
    const generate = vi.fn().mockResolvedValue(response);
    const provider: LlmProvider = { id: 'gemini', generate };
    await runLlm(request, { roomId: 'r', provider, now: () => 1_000 });
    expect(generate).toHaveBeenCalledWith('KEY', request);
    const [recorded] = loadBudgetState().entries;
    expect(recorded).toMatchObject({ roomId: 'r', inputTokens: 1000, outputTokens: 1000 });
    expect(recorded?.costUsd).toBeGreaterThan(0);
  });

  it('retries transient errors with backoff but not auth errors', async () => {
    setApiKey('gemini', 'KEY');
    const sleep = vi.fn(noSleep);
    const flaky = vi
      .fn()
      .mockRejectedValueOnce(new LlmError('rate-limit', 'slow down', 429))
      .mockRejectedValueOnce(new LlmError('server', 'oops', 503))
      .mockResolvedValue(response);
    await runLlm(request, { roomId: 'r', provider: { id: 'gemini', generate: flaky }, sleep });
    expect(flaky).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(call => call[0])).toEqual([1000, 2000]);

    const denied = vi.fn().mockRejectedValue(new LlmError('auth', 'bad key', 401));
    await expect(runLlm(request, { roomId: 'r', provider: { id: 'gemini', generate: denied }, sleep })).rejects.toMatchObject({
      kind: 'auth',
    });
    expect(denied).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxAttempts and does not record failed calls', async () => {
    setApiKey('gemini', 'KEY');
    const generate = vi.fn().mockRejectedValue(new LlmError('server', 'down', 500));
    await expect(
      runLlm(request, { roomId: 'r', provider: { id: 'gemini', generate }, sleep: noSleep, maxAttempts: 2 }),
    ).rejects.toMatchObject({ kind: 'server' });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(loadBudgetState().entries).toHaveLength(0);
  });

  it('blocks the call before sending when the budget is exhausted', async () => {
    setApiKey('gemini', 'KEY');
    saveBudgetSettings({ perMeetingUsd: 0.001 });
    const generate = vi.fn().mockResolvedValue(response);
    const provider: LlmProvider = { id: 'gemini', generate };
    await runLlm(request, { roomId: 'r', provider });
    await expect(runLlm(request, { roomId: 'r', provider })).rejects.toMatchObject({ kind: 'budget' });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
