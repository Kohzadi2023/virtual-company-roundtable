import { runLlm } from '@/lib/llm/llmClient';
import { notifyLlmChange, getSelectedModel } from '@/lib/llm/llmSettings';
import { rateFor } from '@/lib/llm/pricing';
import { LlmError } from '@/lib/llm/types';
import type { LlmResponse } from '@/lib/llm/types';

/** Generous allowance for visible answer plus hidden reasoning, used only to reserve budget. */
const ASSUMED_OUTPUT_TOKENS = 4000;
/** Same ~4 chars/token heuristic the context preview uses. */
const CHARS_PER_TOKEN = 4;

export function estimateRunCostUsd(model: string, prompt: string): number {
  const rate = rateFor(model);
  if (!rate) return 0;
  const inputTokens = Math.ceil(prompt.length / CHARS_PER_TOKEN);
  return (inputTokens * rate.input + ASSUMED_OUTPUT_TOKENS * rate.output) / 1_000_000;
}

export interface ApiRunResult {
  response: LlmResponse;
  model: string;
}

/**
 * Sends one already-built agent prompt to the model. The caller decides what
 * to do with the text (Phase 2 puts it in the response box for review).
 */
export async function runPromptViaApi(prompt: string, roomId: string, signal?: AbortSignal): Promise<ApiRunResult> {
  const model = getSelectedModel();
  try {
    const response = await runLlm(
      { model, prompt, ...(signal ? { signal } : {}) },
      { roomId, estimatedCostUsd: estimateRunCostUsd(model, prompt) },
    );
    return { response, model };
  } finally {
    // Usage was recorded (or the call failed); either way the totals shown in
    // the UI may have moved.
    notifyLlmChange();
  }
}

export function isCancelled(error: unknown): boolean {
  return error instanceof LlmError && error.kind === 'aborted';
}

export function describeLlmError(error: unknown): string {
  if (!(error instanceof LlmError)) return 'The API request failed unexpectedly.';
  switch (error.kind) {
    case 'no-credentials':
      return 'No API key saved. Add your Gemini API key under Tools → AI API.';
    case 'auth':
      return 'Gemini rejected the API key. Check it under Tools → AI API.';
    case 'rate-limit':
      return 'Gemini is rate limiting this key or its quota is used up. Wait a bit and try again.';
    case 'server':
      return 'The Gemini service had an error. Try again in a moment.';
    case 'network':
      return 'Could not reach the Gemini API. Check your connection.';
    case 'timeout':
      return 'The request timed out. Try again, or use a smaller context.';
    case 'blocked':
      return `Gemini declined to answer: ${error.message}`;
    case 'truncated':
      return 'The answer was cut off at the output limit. Try again, or use a lighter context mode.';
    case 'empty':
      return 'Gemini returned an empty answer. Try again.';
    case 'budget':
      return `${error.message} Raise the limit under Tools → AI API to continue.`;
    case 'bad-request':
      return `Gemini rejected the request: ${error.message}`;
    case 'aborted':
      return 'The request was cancelled.';
  }
}

export function formatUsd(value: number): string {
  if (value > 0 && value < 0.01) return '<$0.01';
  return `$${value.toFixed(2)}`;
}
