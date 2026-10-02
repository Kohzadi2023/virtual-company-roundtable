import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBudgetState } from '@/lib/llm/budget';
import { setApiKey } from '@/lib/llm/credentials';
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  MAX_OUTPUT_TOKENS_CEILING,
  geminiProvider,
  parseGeminiResponse,
} from '@/lib/llm/geminiProvider';
import { runLlm } from '@/lib/llm/llmClient';
import { LlmError } from '@/lib/llm/types';
import type { LlmProvider, LlmRequest, LlmResponse } from '@/lib/llm/types';

const usage = { inputTokens: 5000, cachedInputTokens: 0, outputTokens: 3000, thoughtTokens: 2000 };
const request: LlmRequest = { model: 'gemini-3.8-flash', prompt: 'p' };
const complete: LlmResponse = { text: 'complete answer', finishReason: 'STOP', model: request.model, usage };

beforeEach(() => {
  window.localStorage.clear();
  setApiKey('gemini', 'KEY');
});
afterEach(() => vi.unstubAllGlobals());

describe('output limit', () => {
  it('asks for a generous output allowance by default', async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'ok' }] } }] }), { status: 200 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await geminiProvider.generate('KEY', request);

    const sent = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(sent.generationConfig.maxOutputTokens).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    expect(DEFAULT_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(32_768);
  });

  it('keeps the billed usage on a cut-off answer so it can be counted', () => {
    const body = {
      candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'half an ans' }] } }],
      usageMetadata: { promptTokenCount: 5000, candidatesTokenCount: 3000, thoughtsTokenCount: 2000 },
    };
    try {
      parseGeminiResponse('m', body);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(LlmError);
      expect((error as LlmError).kind).toBe('truncated');
      expect((error as LlmError).usage).toEqual(usage);
    }
  });
});

describe('early stops', () => {
  it.each(['RECITATION', 'LANGUAGE', 'OTHER'])('does not pass off a %s stop as a complete answer', reason => {
    const body = { candidates: [{ finishReason: reason, content: { parts: [{ text: 'partial' }] } }] };
    expect(() => parseGeminiResponse('m', body)).toThrowError(expect.objectContaining({ kind: 'blocked' }));
  });

  it('still accepts a normal stop', () => {
    const body = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'whole answer' }] } }] };
    expect(parseGeminiResponse('m', body).text).toBe('whole answer');
  });
});

describe('runLlm on a cut-off answer', () => {
  it('retries once with the largest allowance and returns the complete answer', async () => {
    const generate = vi
      .fn<LlmProvider['generate']>()
      .mockRejectedValueOnce(new LlmError('truncated', 'cut off', undefined, usage))
      .mockResolvedValueOnce(complete);

    const response = await runLlm(request, { roomId: 'r', provider: { id: 'gemini', generate } });

    expect(response.text).toBe('complete answer');
    expect(generate).toHaveBeenCalledTimes(2);
    expect((generate.mock.calls[1] as [string, LlmRequest])[1].maxOutputTokens).toBe(MAX_OUTPUT_TOKENS_CEILING);
  });

  it('counts the cost of the cut-off call as well as the retry', async () => {
    const generate = vi
      .fn<LlmProvider['generate']>()
      .mockRejectedValueOnce(new LlmError('truncated', 'cut off', undefined, usage))
      .mockResolvedValueOnce(complete);

    await runLlm(request, { roomId: 'r', provider: { id: 'gemini', generate } });

    expect(loadBudgetState().entries).toHaveLength(2);
  });

  it('stops after the retry if the answer is still cut off, and does not loop', async () => {
    const generate = vi.fn<LlmProvider['generate']>().mockRejectedValue(new LlmError('truncated', 'cut off', undefined, usage));

    await expect(runLlm(request, { roomId: 'r', provider: { id: 'gemini', generate } })).rejects.toMatchObject({ kind: 'truncated' });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(loadBudgetState().entries).toHaveLength(2);
  });

  it('does not retry when the caller already asked for the maximum', async () => {
    const generate = vi.fn<LlmProvider['generate']>().mockRejectedValue(new LlmError('truncated', 'cut off', undefined, usage));

    await expect(
      runLlm({ ...request, maxOutputTokens: MAX_OUTPUT_TOKENS_CEILING }, { roomId: 'r', provider: { id: 'gemini', generate } }),
    ).rejects.toMatchObject({ kind: 'truncated' });

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('does not record calls that failed without being billed', async () => {
    const generate = vi.fn<LlmProvider['generate']>().mockRejectedValue(new LlmError('auth', 'bad key', 401));
    await expect(runLlm(request, { roomId: 'r', provider: { id: 'gemini', generate } })).rejects.toMatchObject({ kind: 'auth' });
    expect(loadBudgetState().entries).toHaveLength(0);
  });
});

describe('billing errors', () => {
  const failWith = (status: number, message: string) =>
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: { message } }), { status }))));
  const depleted = 'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.';

  it.each([400, 403, 429])('classifies depleted credits on HTTP %i as billing, not a retryable or generic error', async status => {
    failWith(status, depleted);
    const error = await geminiProvider.generate('KEY', request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).kind).toBe('billing');
    expect((error as LlmError).retryable).toBe(false);
  });

  it('does not retry a billing error', async () => {
    const generate = vi.fn<LlmProvider['generate']>().mockRejectedValue(new LlmError('billing', depleted, 429));
    await expect(runLlm(request, { roomId: 'r', provider: { id: 'gemini', generate } })).rejects.toMatchObject({ kind: 'billing' });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('still treats an ordinary rate limit as retryable', async () => {
    failWith(429, 'Resource has been exhausted (e.g. check quota).');
    const error = await geminiProvider.generate('KEY', request).catch((e: unknown) => e);
    expect((error as LlmError).kind).toBe('rate-limit');
  });
});
