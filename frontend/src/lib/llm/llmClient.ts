import { checkBudget, loadBudgetState, recordUsage } from '@/lib/llm/budget';
import { getApiKey } from '@/lib/llm/credentials';
import { geminiProvider } from '@/lib/llm/geminiProvider';
import { estimateCostUsd } from '@/lib/llm/pricing';
import { LlmError } from '@/lib/llm/types';
import type { LlmProvider, LlmRequest, LlmResponse } from '@/lib/llm/types';

export interface RunLlmOptions {
  roomId: string;
  provider?: LlmProvider;
  /** Total attempts including the first. Only transient errors are retried. */
  maxAttempts?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Rough cost of this call, reserved against the budget before sending. */
  estimatedCostUsd?: number;
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function backoffMs(attempt: number): number {
  return Math.min(8000, 1000 * 2 ** (attempt - 1));
}

/**
 * The single entry point for model calls: checks credentials and budget,
 * retries transient failures with backoff, and records the cost of every call
 * that returned usage so the budget reflects real spend.
 */
export async function runLlm(request: LlmRequest, options: RunLlmOptions): Promise<LlmResponse> {
  const provider = options.provider ?? geminiProvider;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);

  const apiKey = getApiKey(provider.id);
  if (!apiKey) throw new LlmError('no-credentials', 'No API key is saved. Add your Gemini API key in settings.');

  let lastError: LlmError | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const verdict = checkBudget(loadBudgetState(), options.roomId, now(), options.estimatedCostUsd ?? 0);
    if (!verdict.ok) throw new LlmError('budget', verdict.message);

    try {
      const response = await provider.generate(apiKey, request);
      recordUsage({
        at: now(),
        roomId: options.roomId,
        model: request.model,
        costUsd: estimateCostUsd(request.model, response.usage, new Date(now())),
        inputTokens: response.usage.inputTokens,
        cachedInputTokens: response.usage.cachedInputTokens,
        outputTokens: response.usage.outputTokens + response.usage.thoughtTokens,
      });
      return response;
    } catch (error) {
      if (!(error instanceof LlmError)) throw error;
      lastError = error;
      if (!error.retryable || attempt === maxAttempts || request.signal?.aborted) throw error;
      await sleep(backoffMs(attempt));
    }
  }
  throw lastError ?? new LlmError('server', 'The request failed.');
}
