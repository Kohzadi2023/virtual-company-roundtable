import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeLlmError, estimateRunCostUsd, formatUsd, isCancelled, runPromptViaApi } from '@/lib/llm/apiRun';
import { loadBudgetState, saveBudgetSettings } from '@/lib/llm/budget';
import { setApiKey } from '@/lib/llm/credentials';
import { LLM_CHANGE_EVENT, getSelectedModel, setSelectedModel } from '@/lib/llm/llmSettings';
import { DEFAULT_MODEL_ID } from '@/lib/llm/pricing';
import { LlmError } from '@/lib/llm/types';
import type { LlmErrorKind } from '@/lib/llm/types';

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('model selection', () => {
  it('defaults, persists a known model, and ignores unknown ids', () => {
    expect(getSelectedModel()).toBe(DEFAULT_MODEL_ID);
    setSelectedModel('gemini-3.1-pro-preview');
    expect(getSelectedModel()).toBe('gemini-3.1-pro-preview');
    setSelectedModel('not-a-model');
    expect(getSelectedModel()).toBe('gemini-3.1-pro-preview');
  });

  it('falls back to the default when storage holds a model that was removed', () => {
    window.localStorage.setItem('virtual-company:llm-settings:v1', JSON.stringify({ model: 'gemini-retired' }));
    expect(getSelectedModel()).toBe(DEFAULT_MODEL_ID);
  });

  it('announces changes so open UI can refresh', () => {
    const listener = vi.fn();
    window.addEventListener(LLM_CHANGE_EVENT, listener);
    setSelectedModel('gemini-3.5-flash-lite');
    window.removeEventListener(LLM_CHANGE_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('estimateRunCostUsd', () => {
  it('grows with prompt size and is zero for unknown models', () => {
    const small = estimateRunCostUsd('gemini-3.8-flash', 'x'.repeat(400));
    const large = estimateRunCostUsd('gemini-3.8-flash', 'x'.repeat(400_000));
    expect(large).toBeGreaterThan(small);
    expect(small).toBeGreaterThan(0);
    expect(estimateRunCostUsd('mystery', 'x')).toBe(0);
  });
});

describe('describeLlmError', () => {
  const kinds: LlmErrorKind[] = [
    'auth',
    'rate-limit',
    'server',
    'network',
    'timeout',
    'aborted',
    'bad-request',
    'blocked',
    'empty',
    'truncated',
    'no-credentials',
    'budget',
  ];

  it('gives every error kind a readable, non-empty message', () => {
    for (const kind of kinds) expect(describeLlmError(new LlmError(kind, 'detail')).length).toBeGreaterThan(10);
    expect(describeLlmError(new Error('boom'))).toContain('failed');
  });

  it('tells the user how to raise a hit budget', () => {
    expect(describeLlmError(new LlmError('budget', 'Monthly limit reached.'))).toContain('AI API');
  });

  it('treats only aborts as a silent cancel', () => {
    expect(isCancelled(new LlmError('aborted', 'x'))).toBe(true);
    expect(isCancelled(new LlmError('server', 'x'))).toBe(false);
  });
});

describe('formatUsd', () => {
  it('shows sub-cent amounts instead of rounding them to zero', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(0.004)).toBe('<$0.01');
    expect(formatUsd(1.236)).toBe('$1.24');
  });
});

describe('runPromptViaApi', () => {
  const okFetch = () =>
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'agent answer' }] } }],
            usageMetadata: { promptTokenCount: 2000, candidatesTokenCount: 300, thoughtsTokenCount: 100 },
          }),
          { status: 200 },
        ),
      ),
    );

  it('calls the selected model, records usage against the room, and announces the change', async () => {
    setApiKey('gemini', 'KEY');
    setSelectedModel('gemini-3.5-flash-lite');
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    const listener = vi.fn();
    window.addEventListener(LLM_CHANGE_EVENT, listener);

    const { response, model } = await runPromptViaApi('hello', 'room-1');
    window.removeEventListener(LLM_CHANGE_EVENT, listener);

    expect(response.text).toBe('agent answer');
    expect(model).toBe('gemini-3.5-flash-lite');
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('gemini-3.5-flash-lite');
    expect(loadBudgetState().entries[0]).toMatchObject({ roomId: 'room-1', model: 'gemini-3.5-flash-lite' });
    expect(listener).toHaveBeenCalled();
  });

  it('refuses before any network call when a prompt would blow the budget', async () => {
    setApiKey('gemini', 'KEY');
    saveBudgetSettings({ perMeetingUsd: 0.0001 });
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    await expect(runPromptViaApi('x'.repeat(40_000), 'room-1')).rejects.toMatchObject({ kind: 'budget' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still announces a change when the call fails, and records nothing', async () => {
    setApiKey('gemini', 'KEY');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: { message: 'bad' } }), { status: 401 }))));
    const listener = vi.fn();
    window.addEventListener(LLM_CHANGE_EVENT, listener);

    await expect(runPromptViaApi('hello', 'room-1')).rejects.toMatchObject({ kind: 'auth' });
    window.removeEventListener(LLM_CHANGE_EVENT, listener);
    expect(listener).toHaveBeenCalled();
    expect(loadBudgetState().entries).toHaveLength(0);
  });
});
