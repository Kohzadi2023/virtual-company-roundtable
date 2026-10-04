import { describe, expect, it } from 'vitest';
import { buildBenchmarkReport, reconcileWithInvoice } from '@/lib/llm/benchmarkReport';
import type { UsageEntry } from '@/lib/llm/budget';

const NOW = new Date('2026-10-04T12:00:00Z');

function entry(roomId: string, patch: Partial<UsageEntry> = {}): UsageEntry {
  return {
    at: 0,
    roomId,
    model: 'gemini-3.8-flash',
    costUsd: 0.1,
    inputTokens: 10_000,
    cachedInputTokens: 0,
    outputTokens: 1_000,
    thoughtTokens: 0,
    ...patch,
  };
}

describe('reconcileWithInvoice', () => {
  it('reports the signed variance against the invoice and the ±10% tolerance', () => {
    expect(reconcileWithInvoice(1.05, 1)).toMatchObject({ variance: expect.closeTo(0.05, 6), withinTolerance: true });
    expect(reconcileWithInvoice(0.85, 1)).toMatchObject({ variance: expect.closeTo(-0.15, 6), withinTolerance: false });
    expect(reconcileWithInvoice(1.1, 1)?.withinTolerance).toBe(true);
  });

  it('refuses a missing or non-positive invoice instead of dividing by zero', () => {
    expect(reconcileWithInvoice(1, 0)).toBeUndefined();
    expect(reconcileWithInvoice(1, -2)).toBeUndefined();
    expect(reconcileWithInvoice(1, Number.NaN)).toBeUndefined();
  });
});

describe('buildBenchmarkReport', () => {
  const entries = [
    entry('a', { at: 0, costUsd: 0.2, inputTokens: 20_000, cachedInputTokens: 10_000, outputTokens: 4_000, thoughtTokens: 1_500 }),
    entry('a', { at: 90_000, costUsd: 0.3, inputTokens: 30_000, cachedInputTokens: 24_000, outputTokens: 6_000, thoughtTokens: 2_500, model: 'gemini-3.5-flash-lite' }),
    entry('b', { at: 1_000, costUsd: 0.1 }),
    entry('c', { at: 2_000, costUsd: 0.9 }),
  ];

  it('prints one row per meeting with calls, cache share, thinking, cost per call and duration', () => {
    const report = buildBenchmarkReport(entries, { roomNames: { a: 'Quick Review | EN', b: 'Second' }, now: NOW });
    expect(report).toContain('**Recorded calls:** 4');
    expect(report).toContain('**Meetings:** 3');
    expect(report).toContain('| Quick Review \\| EN | gemini-3.8-flash, gemini-3.5-flash-lite | 2 | 50.0k | 68% | 10.0k | 4000 | $0.500 | $0.250 | 1m 30s |');
    expect(report).toContain('| c |');
  });

  it('summarises cost per meeting as min, median and max', () => {
    const report = buildBenchmarkReport(entries, { now: NOW });
    expect(report).toContain('**App estimate, all meetings:** $1.500');
    expect(report).toContain('min $0.100 · median $0.500 · max $0.900');
  });

  it('reconciles against the invoice when one is given', () => {
    const within = buildBenchmarkReport(entries, { invoiceUsd: 1.4, now: NOW });
    expect(within).toContain('**Provider invoice:** $1.400');
    expect(within).toContain('**Variance:** +7.1% (app over-estimates)');
    expect(within).toContain('**Within ±10%:** yes');

    const outside = buildBenchmarkReport(entries, { invoiceUsd: 2, now: NOW });
    expect(outside).toContain('**Variance:** -25.0% (app under-estimates)');
    expect(outside).toContain('**no** — do not quote these costs');
  });

  it('says reconciliation was not done when there is no usable invoice figure', () => {
    expect(buildBenchmarkReport(entries, { now: NOW })).toContain('Not done. Enter the amount billed by Google');
    expect(buildBenchmarkReport(entries, { invoiceUsd: 0, now: NOW })).toContain('Not done.');
  });

  it('records the configuration so the measurement can be reproduced', () => {
    const report = buildBenchmarkReport(entries, { configuration: { Thinking: 'low', 'Token saver': 'on' }, now: NOW });
    expect(report).toContain('## Configuration used');
    expect(report).toContain('- **Thinking:** low');
    expect(report).toContain('- **Token saver:** on');
  });

  it('is explicit when nothing has been recorded, and always carries the caveats', () => {
    const report = buildBenchmarkReport([], { now: NOW });
    expect(report).toContain('No API usage has been recorded yet.');
    expect(report).not.toContain('## Totals');
    expect(report).toContain('Only the invoice is authoritative.');
    expect(report).toContain('120 days');
  });
});
