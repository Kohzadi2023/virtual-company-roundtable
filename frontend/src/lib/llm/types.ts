export type LlmProviderId = 'gemini';

export type LlmThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

export interface LlmRequest {
  model: string;
  prompt: string;
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
  /** Only sent to the API when set; leave undefined for the model default. */
  thinkingLevel?: LlmThinkingLevel;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface LlmUsage {
  /** Prompt tokens, including any served from the implicit cache. */
  inputTokens: number;
  /** Subset of inputTokens that were billed at the cached rate. */
  cachedInputTokens: number;
  /** Visible answer tokens. */
  outputTokens: number;
  /** Reasoning tokens; billed as output but never shown. */
  thoughtTokens: number;
}

export interface LlmResponse {
  text: string;
  usage: LlmUsage;
  finishReason: string;
  model: string;
}

export type LlmErrorKind =
  | 'auth'
  | 'rate-limit'
  | 'server'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'bad-request'
  | 'blocked'
  | 'empty'
  | 'truncated'
  | 'no-credentials'
  | 'budget'
  /** The Google account has no credit / billing problem; retrying cannot help. */
  | 'billing';

const RETRYABLE: ReadonlySet<LlmErrorKind> = new Set(['rate-limit', 'server', 'network', 'timeout']);

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly status: number | undefined;
  /** Tokens the provider billed for a call that still failed (e.g. a cut-off answer). */
  readonly usage: LlmUsage | undefined;

  constructor(kind: LlmErrorKind, message: string, status?: number, usage?: LlmUsage) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
    this.status = status;
    this.usage = usage;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.kind);
  }
}

export interface LlmProvider {
  readonly id: LlmProviderId;
  generate(apiKey: string, request: LlmRequest): Promise<LlmResponse>;
}
