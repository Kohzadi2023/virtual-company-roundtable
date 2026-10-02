import type { LlmUsage } from '@/lib/llm/types';

/** USD per one million tokens. */
export interface ModelRate {
  input: number;
  cachedInput: number;
  output: number;
}

interface RateWindow extends ModelRate {
  /** Inclusive ISO date (UTC) from which this rate applies. */
  from: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  /** Rate windows sorted ascending by `from`. */
  rates: RateWindow[];
}

const EPOCH = '1970-01-01';

// Prices are copied from Google's public pricing page and WILL drift. Treat
// every figure here as an estimate for budgeting, never as a bill. Gemini 3.8
// Flash is on promotional pricing that doubles on 2027-01-01.
export const MODELS: readonly ModelInfo[] = [
  {
    id: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite (cheapest)',
    rates: [{ from: EPOCH, input: 0.3, cachedInput: 0.03, output: 2.5 }],
  },
  {
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash (recommended)',
    rates: [
      { from: EPOCH, input: 0.75, cachedInput: 0.075, output: 3.75 },
      { from: '2027-01-01', input: 1.5, cachedInput: 0.15, output: 7.5 },
    ],
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro (highest quality)',
    rates: [{ from: EPOCH, input: 2, cachedInput: 0.2, output: 12 }],
  },
];

export const DEFAULT_MODEL_ID = 'gemini-3.8-flash';

export function findModel(modelId: string): ModelInfo | undefined {
  return MODELS.find(model => model.id === modelId);
}

export function rateFor(modelId: string, at: Date = new Date()): ModelRate | undefined {
  const model = findModel(modelId);
  if (!model) return undefined;
  const day = at.toISOString().slice(0, 10);
  let current: RateWindow | undefined;
  for (const window of model.rates) {
    if (window.from <= day) current = window;
  }
  return current;
}

/**
 * Estimated USD cost of one call. Thought tokens are billed as output. An
 * unknown model falls back to the most expensive known rate so that a budget
 * guard errs toward stopping early rather than overspending.
 */
export function estimateCostUsd(modelId: string, usage: LlmUsage, at: Date = new Date()): number {
  const rate = rateFor(modelId, at) ?? mostExpensiveRate(at);
  const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const billedOutput = usage.outputTokens + usage.thoughtTokens;
  return (
    (uncachedInput * rate.input + usage.cachedInputTokens * rate.cachedInput + billedOutput * rate.output) /
    1_000_000
  );
}

function mostExpensiveRate(at: Date): ModelRate {
  let worst: ModelRate = { input: 0, cachedInput: 0, output: 0 };
  for (const model of MODELS) {
    const rate = rateFor(model.id, at);
    if (rate && rate.output > worst.output) worst = rate;
  }
  return worst;
}
