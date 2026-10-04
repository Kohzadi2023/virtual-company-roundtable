import { MAX_ENTRIES, RETENTION_MS, summarizeUsageByRoom, type UsageEntry } from '@/lib/llm/budget';

/** The tolerance the productization baseline uses to accept the app's own estimate against the provider's invoice. */
export const INVOICE_TOLERANCE = 0.1;

export interface BenchmarkOptions {
  /** Room id to display name. Unknown ids are printed as-is. */
  roomNames?: Readonly<Record<string, string>>;
  /** Settings the run used, printed so the measurement can be reproduced. */
  configuration?: Readonly<Record<string, string>>;
  /** What the provider actually billed for the same calls, from its console or invoice. */
  invoiceUsd?: number | undefined;
  now?: Date;
}

export interface InvoiceReconciliation {
  appUsd: number;
  invoiceUsd: number;
  /** (app - invoice) / invoice; positive means the app over-estimated. */
  variance: number;
  withinTolerance: boolean;
}

export function reconcileWithInvoice(appUsd: number, invoiceUsd: number): InvoiceReconciliation | undefined {
  if (!Number.isFinite(invoiceUsd) || invoiceUsd <= 0) return undefined;
  const variance = (appUsd - invoiceUsd) / invoiceUsd;
  // Rounded first: (1.1 - 1) / 1 is 0.10000000000000009 in floating point, which would
  // wrongly put a variance of exactly 10% outside the tolerance.
  const withinTolerance = Math.abs(Math.round(variance * 1e6) / 1e6) <= INVOICE_TOLERANCE;
  return { appUsd, invoiceUsd, variance, withinTolerance };
}

function cell(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
}

function usd(value: number): string {
  return `$${value.toFixed(value < 0.1 ? 4 : 3)}`;
}

function tokens(value: number): string {
  return value >= 10_000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
}

function minutes(from: number, to: number): string {
  const seconds = Math.round((to - from) / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

function median(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Markdown report of recorded Gemini usage, one row per meeting, for the
 * "measured cost" gate: it gives the real token mix (including hidden
 * reasoning and cache hits) and, when an invoice figure is supplied, how far
 * the app's own estimate is from what the provider billed.
 */
export function buildBenchmarkReport(entries: readonly UsageEntry[], options: BenchmarkOptions = {}): string {
  const now = options.now ?? new Date();
  const names = options.roomNames ?? {};
  const rows = summarizeUsageByRoom(entries);
  const modelsByRoom = new Map<string, Set<string>>();
  for (const entry of entries) {
    const models = modelsByRoom.get(entry.roomId) ?? new Set<string>();
    models.add(entry.model);
    modelsByRoom.set(entry.roomId, models);
  }

  const lines: string[] = [
    '# Gemini cost benchmark',
    '',
    `**Generated:** ${now.toLocaleString()}  `,
    `**Recorded calls:** ${entries.length}  `,
    `**Meetings:** ${rows.length}`,
  ];

  const configuration = Object.entries(options.configuration ?? {});
  if (configuration.length > 0) {
    lines.push('', '## Configuration used', '', ...configuration.map(([key, value]) => `- **${key}:** ${value}`));
  }

  lines.push('', '## Per meeting', '');
  if (rows.length === 0) {
    lines.push('No API usage has been recorded yet. Run a meeting through the API first.');
  } else {
    lines.push(
      '| Meeting | Models | Calls | Input | Cached | Output | of which thinking | Cost | Cost per call | Duration |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...rows.map(row => {
        const cached = row.inputTokens > 0 ? `${Math.round((row.cachedInputTokens / row.inputTokens) * 100)}%` : '—';
        const models = [...(modelsByRoom.get(row.roomId) ?? [])].join(', ');
        return `| ${cell(names[row.roomId] ?? row.roomId)} | ${cell(models)} | ${row.calls} | ${tokens(row.inputTokens)} | ${cached} | ${tokens(row.outputTokens)} | ${tokens(row.thoughtTokens)} | ${usd(row.costUsd)} | ${usd(row.costUsd / row.calls)} | ${minutes(row.firstAt, row.lastAt)} |`;
      }),
    );

    const costs = rows.map(row => row.costUsd).sort((a, b) => a - b);
    const total = costs.reduce((sum, value) => sum + value, 0);
    const input = rows.reduce((sum, row) => sum + row.inputTokens, 0);
    const output = rows.reduce((sum, row) => sum + row.outputTokens, 0);
    lines.push(
      '',
      '## Totals',
      '',
      `- **App estimate, all meetings:** ${usd(total)}`,
      `- **Cost per meeting:** min ${usd(costs[0]!)} · median ${usd(median(costs))} · max ${usd(costs[costs.length - 1]!)}`,
      `- **Token mix:** ${tokens(input)} input (${input + output > 0 ? Math.round((input / (input + output)) * 100) : 0}% of all tokens) · ${tokens(output)} output`,
    );

    const reconciliation = options.invoiceUsd === undefined ? undefined : reconcileWithInvoice(total, options.invoiceUsd);
    lines.push('', '## Reconciliation with the provider invoice', '');
    if (reconciliation) {
      const sign = reconciliation.variance >= 0 ? '+' : '';
      lines.push(
        `- **App estimate:** ${usd(reconciliation.appUsd)}`,
        `- **Provider invoice:** ${usd(reconciliation.invoiceUsd)}`,
        `- **Variance:** ${sign}${(reconciliation.variance * 100).toFixed(1)}% (${reconciliation.variance >= 0 ? 'app over-estimates' : 'app under-estimates'})`,
        `- **Within ±${INVOICE_TOLERANCE * 100}%:** ${reconciliation.withinTolerance ? 'yes' : '**no** — do not quote these costs to users until the gap is explained'}`,
      );
    } else {
      lines.push('Not done. Enter the amount billed by Google for exactly these calls to get the variance.');
    }
  }

  lines.push(
    '',
    '## Read this before quoting a number',
    '',
    '- Costs are the app\'s own estimate from the published rate table (including any promotional price in force on the day of each call). Only the invoice is authoritative.',
    '- Thinking tokens are billed as output and are included in "Output".',
    '- Calls that failed but were still billed (for example a cut-off answer) are included.',
    `- The app keeps at most ${MAX_ENTRIES} calls and ${Math.round(RETENTION_MS / 86_400_000)} days of history; older calls are not in this report.`,
    '- If the same API key was used anywhere else in the period, the invoice will be higher than this report; use a key dedicated to the benchmark.',
  );
  return lines.join('\n');
}
