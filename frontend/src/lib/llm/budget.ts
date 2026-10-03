import { setLocalStorageWithQuotaRecovery } from '@/lib/localStorageQuota';

/**
 * Client-side spend guard. The browser/desktop app calls the model directly
 * with the user's own key, so these limits are soft: they stop this app from
 * issuing further calls but cannot stop spend made elsewhere with the same key.
 */
export const LLM_BUDGET_STORAGE_KEY = 'virtual-company:llm-budget:v1';

export interface BudgetSettings {
  perMeetingUsd: number;
  perMonthUsd: number;
  maxCallsPerMeeting: number;
}

export interface UsageEntry {
  at: number;
  roomId: string;
  model: string;
  costUsd: number;
  inputTokens: number;
  /** Part of inputTokens billed at the cached rate; absent on entries recorded before this was tracked. */
  cachedInputTokens?: number;
  outputTokens: number;
}

export interface BudgetState {
  settings: BudgetSettings;
  entries: UsageEntry[];
}

export const DEFAULT_BUDGET_SETTINGS: BudgetSettings = {
  perMeetingUsd: 3,
  perMonthUsd: 30,
  maxCallsPerMeeting: 80,
};

const MAX_ENTRIES = 3000;
const RETENTION_MS = 120 * 24 * 60 * 60 * 1000;

export type BudgetVerdict =
  | { ok: true }
  | { ok: false; reason: 'meeting' | 'month' | 'calls'; message: string };

function finiteNonNegative(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function normalizeBudgetSettings(input: Partial<BudgetSettings> | undefined): BudgetSettings {
  return {
    perMeetingUsd: finiteNonNegative(input?.perMeetingUsd, DEFAULT_BUDGET_SETTINGS.perMeetingUsd),
    perMonthUsd: finiteNonNegative(input?.perMonthUsd, DEFAULT_BUDGET_SETTINGS.perMonthUsd),
    maxCallsPerMeeting: Math.floor(
      finiteNonNegative(input?.maxCallsPerMeeting, DEFAULT_BUDGET_SETTINGS.maxCallsPerMeeting),
    ),
  };
}

function isUsageEntry(value: unknown): value is UsageEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.at === 'number' &&
    typeof entry.roomId === 'string' &&
    typeof entry.model === 'string' &&
    typeof entry.costUsd === 'number' &&
    typeof entry.inputTokens === 'number' &&
    typeof entry.outputTokens === 'number'
  );
}

/**
 * Set when the ledger could not be written to localStorage. Reads then use
 * this copy so the budget guard keeps counting for the rest of the session
 * instead of silently seeing a ledger that never grows.
 */
let unpersistedState: BudgetState | null = null;

function cloneState(state: BudgetState): BudgetState {
  return { settings: { ...state.settings }, entries: [...state.entries] };
}

/** Test hook. */
export function resetBudgetMemory(): void {
  unpersistedState = null;
}

export function loadBudgetState(): BudgetState {
  if (unpersistedState) return cloneState(unpersistedState);
  try {
    const raw = window.localStorage.getItem(LLM_BUDGET_STORAGE_KEY);
    if (!raw) return { settings: { ...DEFAULT_BUDGET_SETTINGS }, entries: [] };
    const parsed = JSON.parse(raw) as { settings?: Partial<BudgetSettings>; entries?: unknown };
    return {
      settings: normalizeBudgetSettings(parsed.settings),
      entries: Array.isArray(parsed.entries) ? parsed.entries.filter(isUsageEntry) : [],
    };
  } catch {
    return { settings: { ...DEFAULT_BUDGET_SETTINGS }, entries: [] };
  }
}

function saveBudgetState(state: BudgetState): void {
  const result = setLocalStorageWithQuotaRecovery(LLM_BUDGET_STORAGE_KEY, JSON.stringify(state));
  unpersistedState = result.ok ? null : cloneState(state);
}

export function saveBudgetSettings(settings: Partial<BudgetSettings>): BudgetSettings {
  const state = loadBudgetState();
  const next = normalizeBudgetSettings({ ...state.settings, ...settings });
  saveBudgetState({ ...state, settings: next });
  return next;
}

export function pruneEntries(entries: UsageEntry[], now: number): UsageEntry[] {
  const fresh = entries.filter(entry => now - entry.at <= RETENTION_MS);
  return fresh.length > MAX_ENTRIES ? fresh.slice(fresh.length - MAX_ENTRIES) : fresh;
}

export function recordUsage(entry: UsageEntry): void {
  const state = loadBudgetState();
  saveBudgetState({ ...state, entries: pruneEntries([...state.entries, entry], entry.at) });
}

export function clearUsage(): void {
  saveBudgetState({ ...loadBudgetState(), entries: [] });
}

export interface RoomUsageSummary {
  roomId: string;
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** Per-meeting totals, most expensive first, so it is visible where tokens actually go. */
export function summarizeUsageByRoom(entries: readonly UsageEntry[]): RoomUsageSummary[] {
  const byRoom = new Map<string, RoomUsageSummary>();
  for (const entry of entries) {
    const row = byRoom.get(entry.roomId) ?? { roomId: entry.roomId, calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0 };
    row.calls += 1;
    row.inputTokens += entry.inputTokens;
    row.cachedInputTokens += entry.cachedInputTokens ?? 0;
    row.outputTokens += entry.outputTokens;
    row.costUsd += entry.costUsd;
    byRoom.set(entry.roomId, row);
  }
  return [...byRoom.values()].sort((left, right) => right.costUsd - left.costUsd);
}

/** Share of input tokens served from the provider's cache, or undefined when nothing has been recorded. */
export function cachedInputShare(entries: readonly UsageEntry[]): number | undefined {
  const input = entries.reduce((sum, entry) => sum + entry.inputTokens, 0);
  if (input === 0) return undefined;
  return entries.reduce((sum, entry) => sum + (entry.cachedInputTokens ?? 0), 0) / input;
}

export function meetingSpendUsd(entries: readonly UsageEntry[], roomId: string): number {
  return entries.reduce((sum, entry) => (entry.roomId === roomId ? sum + entry.costUsd : sum), 0);
}

export function meetingCallCount(entries: readonly UsageEntry[], roomId: string): number {
  return entries.reduce((count, entry) => (entry.roomId === roomId ? count + 1 : count), 0);
}

/** Spend in the local calendar month containing `at`. */
export function monthSpendUsd(entries: readonly UsageEntry[], at: number): number {
  const ref = new Date(at);
  return entries.reduce((sum, entry) => {
    const date = new Date(entry.at);
    return date.getFullYear() === ref.getFullYear() && date.getMonth() === ref.getMonth() ? sum + entry.costUsd : sum;
  }, 0);
}

const usd = (value: number): string => `$${value.toFixed(2)}`;

/**
 * A limit of 0 means "no calls allowed", not "unlimited": the safe reading of a
 * zero budget is to refuse. `estimatedNextCostUsd` lets callers reserve the
 * expected cost of the call they are about to make.
 */
export function checkBudget(
  state: BudgetState,
  roomId: string,
  now: number,
  estimatedNextCostUsd = 0,
): BudgetVerdict {
  const { settings, entries } = state;
  const calls = meetingCallCount(entries, roomId);
  if (calls >= settings.maxCallsPerMeeting) {
    return {
      ok: false,
      reason: 'calls',
      message: `This meeting reached its limit of ${settings.maxCallsPerMeeting} API calls.`,
    };
  }
  const meeting = meetingSpendUsd(entries, roomId);
  if (meeting + estimatedNextCostUsd > settings.perMeetingUsd || settings.perMeetingUsd === 0) {
    return {
      ok: false,
      reason: 'meeting',
      message: `This meeting has used ${usd(meeting)} of its ${usd(settings.perMeetingUsd)} API budget.`,
    };
  }
  const month = monthSpendUsd(entries, now);
  if (month + estimatedNextCostUsd > settings.perMonthUsd || settings.perMonthUsd === 0) {
    return {
      ok: false,
      reason: 'month',
      message: `This month's API spend (${usd(month)}) has reached the ${usd(settings.perMonthUsd)} monthly budget.`,
    };
  }
  return { ok: true };
}
