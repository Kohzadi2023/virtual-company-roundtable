import { LlmError } from '@/lib/llm/types';
import type { LlmProvider, LlmRequest, LlmResponse, LlmUsage } from '@/lib/llm/types';

export const GEMINI_API_HOST = 'https://generativelanguage.googleapis.com';
const DEFAULT_TIMEOUT_MS = 120_000;
/**
 * Hidden reasoning counts against this limit, and non-Latin text (Persian, Arabic)
 * costs several tokens per word, so a small cap cuts answers off mid-sentence.
 * Gemini 3 models allow up to 65,536 output tokens; you only pay for what is generated.
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 32_768;
export const MAX_OUTPUT_TOKENS_CEILING = 65_536;

const EARLY_STOP_REASONS: ReadonlySet<string> = new Set(['RECITATION', 'LANGUAGE', 'OTHER', 'SPII', 'MALFORMED_RESPONSE']);

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

export interface GeminiResponseBody {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    cachedContentTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  error?: { message?: string };
}

function buildBody(request: LlmRequest): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
  };
  if (request.temperature !== undefined) generationConfig.temperature = request.temperature;
  if (request.thinkingLevel !== undefined) generationConfig.thinkingConfig = { thinkingLevel: request.thinkingLevel };

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
    generationConfig,
  };
  if (request.system) body.systemInstruction = { parts: [{ text: request.system }] };
  return body;
}

/** Prepaid credits used up, billing not enabled, spending cap reached, and similar account-level stops. */
const BILLING_PATTERN = /prepayment|credits? (?:are|is|have been) (?:depleted|exhausted)|billing|spending cap|payment/i;

function classifyHttpError(status: number, message: string): LlmError {
  // Checked before the status: these can arrive as 400, 403 or 429, and a 429
  // would otherwise be retried although waiting cannot add credit.
  if (status < 500 && BILLING_PATTERN.test(message)) return new LlmError('billing', message, status);
  if (status === 401 || status === 403) return new LlmError('auth', message || 'The API key was rejected.', status);
  if (status === 429) return new LlmError('rate-limit', message || 'Rate limit or quota reached.', status);
  if (status >= 500) return new LlmError('server', message || 'The Gemini service had an error.', status);
  return new LlmError('bad-request', message || `Request rejected (HTTP ${status}).`, status);
}

export function parseGeminiResponse(model: string, body: GeminiResponseBody): LlmResponse {
  const blockReason = body.promptFeedback?.blockReason;
  if (blockReason) throw new LlmError('blocked', `The prompt was blocked (${blockReason}).`);

  const meta = body.usageMetadata ?? {};
  const usage: LlmUsage = {
    inputTokens: meta.promptTokenCount ?? 0,
    cachedInputTokens: meta.cachedContentTokenCount ?? 0,
    outputTokens: meta.candidatesTokenCount ?? 0,
    thoughtTokens: meta.thoughtsTokenCount ?? 0,
  };

  const candidate = body.candidates?.[0];
  const finishReason = candidate?.finishReason ?? 'UNKNOWN';
  const text = (candidate?.content?.parts ?? [])
    .filter(part => !part.thought && typeof part.text === 'string')
    .map(part => part.text as string)
    .join('');

  if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT' || finishReason === 'BLOCKLIST') {
    throw new LlmError('blocked', `The response was blocked (${finishReason}).`, undefined, usage);
  }
  // Anything other than a normal stop means the model ended early, so the text
  // may be only part of an answer; say so instead of passing it off as complete.
  if (EARLY_STOP_REASONS.has(finishReason)) {
    throw new LlmError('blocked', `The response stopped early (${finishReason}).`, undefined, usage);
  }
  if (finishReason === 'MAX_TOKENS') {
    // With no visible text this usually means thinking consumed the whole
    // output allowance; with text it is a cut-off answer. Either way the
    // meeting flow needs to know rather than receive a half-formed reply.
    throw new LlmError('truncated', 'The response hit the output token limit.', undefined, usage);
  }
  if (!text.trim()) throw new LlmError('empty', 'The model returned no text.', undefined, usage);

  return { text, usage, finishReason, model };
}

async function sendOnce(apiKey: string, request: LlmRequest): Promise<LlmResponse> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onCallerAbort = () => controller.abort();
  if (request.signal?.aborted) controller.abort();
  else request.signal?.addEventListener('abort', onCallerAbort, { once: true });

  try {
    let response: Response;
    try {
      response = await fetch(`${GEMINI_API_HOST}/v1beta/models/${encodeURIComponent(request.model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(buildBody(request)),
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) throw new LlmError('timeout', 'The request timed out.');
      if (request.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new LlmError('aborted', 'The request was cancelled.');
      }
      throw new LlmError('network', 'Could not reach the Gemini API. Check your connection.');
    }

    let body: GeminiResponseBody = {};
    try {
      body = (await response.json()) as GeminiResponseBody;
    } catch {
      if (response.ok) throw new LlmError('server', 'The Gemini API returned an unreadable response.', response.status);
    }
    if (!response.ok) throw classifyHttpError(response.status, body.error?.message ?? '');
    return parseGeminiResponse(request.model, body);
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener('abort', onCallerAbort);
  }
}

/**
 * The thinking-level field name is documented for Gemini 3 but differs between
 * API surfaces. If the API rejects it, drop it and retry once so a wrong guess
 * costs one failed call instead of breaking every run; remember the outcome for
 * the rest of the session.
 */
let thinkingLevelRejected = false;

async function generateOnce(apiKey: string, request: LlmRequest): Promise<LlmResponse> {
  if (request.thinkingLevel === undefined) return sendOnce(apiKey, request);
  if (thinkingLevelRejected) return sendOnce(apiKey, withoutThinking(request));
  try {
    return await sendOnce(apiKey, request);
  } catch (error) {
    if (error instanceof LlmError && error.kind === 'bad-request' && /think/i.test(error.message)) {
      thinkingLevelRejected = true;
      return sendOnce(apiKey, withoutThinking(request));
    }
    throw error;
  }
}

function withoutThinking(request: LlmRequest): LlmRequest {
  const { thinkingLevel: _dropped, ...rest } = request;
  return rest;
}

/** Test hook: forget a rejected thinking level. */
export function resetThinkingLevelRejection(): void {
  thinkingLevelRejected = false;
}

export const geminiProvider: LlmProvider = {
  id: 'gemini',
  generate: generateOnce,
};
