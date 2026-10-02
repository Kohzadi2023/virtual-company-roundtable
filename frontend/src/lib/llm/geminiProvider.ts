import { LlmError } from '@/lib/llm/types';
import type { LlmProvider, LlmRequest, LlmResponse, LlmUsage } from '@/lib/llm/types';

export const GEMINI_API_HOST = 'https://generativelanguage.googleapis.com';
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

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

function classifyHttpError(status: number, message: string): LlmError {
  if (status === 401 || status === 403) return new LlmError('auth', message || 'The API key was rejected.', status);
  if (status === 429) return new LlmError('rate-limit', message || 'Rate limit or quota reached.', status);
  if (status >= 500) return new LlmError('server', message || 'The Gemini service had an error.', status);
  return new LlmError('bad-request', message || `Request rejected (HTTP ${status}).`, status);
}

export function parseGeminiResponse(model: string, body: GeminiResponseBody): LlmResponse {
  const blockReason = body.promptFeedback?.blockReason;
  if (blockReason) throw new LlmError('blocked', `The prompt was blocked (${blockReason}).`);

  const candidate = body.candidates?.[0];
  const finishReason = candidate?.finishReason ?? 'UNKNOWN';
  const text = (candidate?.content?.parts ?? [])
    .filter(part => !part.thought && typeof part.text === 'string')
    .map(part => part.text as string)
    .join('');

  if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT' || finishReason === 'BLOCKLIST') {
    throw new LlmError('blocked', `The response was blocked (${finishReason}).`);
  }
  if (finishReason === 'MAX_TOKENS') {
    // With no visible text this usually means thinking consumed the whole
    // output allowance; with text it is a cut-off answer. Either way the
    // meeting flow needs to know rather than receive a half-formed reply.
    throw new LlmError('truncated', 'The response hit the output token limit.');
  }
  if (!text.trim()) throw new LlmError('empty', 'The model returned no text.');

  const meta = body.usageMetadata ?? {};
  const usage: LlmUsage = {
    inputTokens: meta.promptTokenCount ?? 0,
    cachedInputTokens: meta.cachedContentTokenCount ?? 0,
    outputTokens: meta.candidatesTokenCount ?? 0,
    thoughtTokens: meta.thoughtsTokenCount ?? 0,
  };
  return { text, usage, finishReason, model };
}

async function generateOnce(apiKey: string, request: LlmRequest): Promise<LlmResponse> {
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

export const geminiProvider: LlmProvider = {
  id: 'gemini',
  generate: generateOnce,
};
