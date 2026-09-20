import type { ActionItem, DecisionRecord } from '@/types/domain';
import type { DecisionDependency } from '@/lib/operationsSuite';

const PREF_KEY = 'virtual-company:roadmap-completion-preferences:v1';
const SENT_KEY = 'virtual-company:roadmap-completion-sent:v1';
export const ROADMAP_COMPLETION_EVENT = 'virtual-company:roadmap-completion-changed';

export interface ReminderPreferences {
  desktopEnabled: boolean;
  dueSoonHours: number;
  timerNotifications: boolean;
}

export interface DecisionGraphNode {
  decision: DecisionRecord;
  depth: number;
  parentIds: string[];
  childIds: string[];
  impactedByReversal: boolean;
}

const DEFAULT_PREFERENCES: ReminderPreferences = {
  desktopEnabled: false,
  dueSoonHours: 24,
  timerNotifications: true,
};

export function loadReminderPreferences(): ReminderPreferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREF_KEY) ?? '') as Partial<ReminderPreferences>;
    return {
      desktopEnabled: parsed.desktopEnabled ?? DEFAULT_PREFERENCES.desktopEnabled,
      dueSoonHours: Math.max(1, Math.min(168, Number(parsed.dueSoonHours ?? DEFAULT_PREFERENCES.dueSoonHours))),
      timerNotifications: parsed.timerNotifications ?? DEFAULT_PREFERENCES.timerNotifications,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function saveReminderPreferences(next: ReminderPreferences): void {
  const normalized: ReminderPreferences = {
    desktopEnabled: Boolean(next.desktopEnabled),
    dueSoonHours: Math.max(1, Math.min(168, Math.round(next.dueSoonHours))),
    timerNotifications: Boolean(next.timerNotifications),
  };
  localStorage.setItem(PREF_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(ROADMAP_COMPLETION_EVENT));
}

export function decisionIdForAction(action: Pick<ActionItem, 'sourceDecisionId' | 'evidence'>): string | undefined {
  if (action.sourceDecisionId?.trim()) return action.sourceDecisionId.trim();
  const match = action.evidence?.trim().match(/^Decision\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

export function deadlineTimestamp(deadline: string | undefined): number | null {
  if (!deadline) return null;
  const value = Date.parse(`${deadline}T23:59:59`);
  return Number.isFinite(value) ? value : null;
}

export function actionReminderState(
  action: Pick<ActionItem, 'status' | 'deadline'>,
  now = Date.now(),
  dueSoonHours = 24,
): 'overdue' | 'due-soon' | null {
  if (action.status === 'done') return null;
  const due = deadlineTimestamp(action.deadline);
  if (due === null) return null;
  if (due < now) return 'overdue';
  if (due - now <= Math.max(1, dueSoonHours) * 60 * 60 * 1000) return 'due-soon';
  return null;
}

function loadSent(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SENT_KEY) ?? '{}') as Record<string, number>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function shouldSendReminder(key: string, now = Date.now(), repeatAfterMs = 12 * 60 * 60 * 1000): boolean {
  const sent = loadSent();
  const previous = sent[key] ?? 0;
  return now - previous >= repeatAfterMs;
}

export function markReminderSent(key: string, now = Date.now()): void {
  const sent = loadSent();
  const entries = Object.entries({ ...sent, [key]: now })
    .sort((left, right) => right[1] - left[1])
    .slice(0, 500);
  localStorage.setItem(SENT_KEY, JSON.stringify(Object.fromEntries(entries)));
}

export function buildDecisionGraph(decisions: DecisionRecord[], dependencies: DecisionDependency[]): DecisionGraphNode[] {
  const decisionById = new Map(decisions.map(decision => [decision.id, decision]));
  const parents = new Map<string, Set<string>>();
  const children = new Map<string, Set<string>>();

  for (const dependency of dependencies) {
    if (!decisionById.has(dependency.decisionId) || !decisionById.has(dependency.dependsOnDecisionId)) continue;
    if (!parents.has(dependency.decisionId)) parents.set(dependency.decisionId, new Set());
    if (!children.has(dependency.dependsOnDecisionId)) children.set(dependency.dependsOnDecisionId, new Set());
    parents.get(dependency.decisionId)?.add(dependency.dependsOnDecisionId);
    children.get(dependency.dependsOnDecisionId)?.add(dependency.decisionId);
  }

  const memo = new Map<string, number>();
  const depthFor = (id: string, visiting = new Set<string>()): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    const parentIds = [...(parents.get(id) ?? [])];
    if (parentIds.length === 0) {
      memo.set(id, 0);
      return 0;
    }
    const nextVisiting = new Set(visiting).add(id);
    const depth = 1 + Math.max(...parentIds.map(parentId => depthFor(parentId, nextVisiting)));
    memo.set(id, depth);
    return depth;
  };

  return decisions.map(decision => {
    const parentIds = [...(parents.get(decision.id) ?? [])];
    const parentReversed = parentIds.some(parentId => decisionById.get(parentId)?.status === 'reversed');
    return {
      decision,
      depth: depthFor(decision.id),
      parentIds,
      childIds: [...(children.get(decision.id) ?? [])],
      impactedByReversal: parentReversed,
    };
  }).sort((left, right) => left.depth - right.depth || left.decision.createdAt - right.decision.createdAt);
}
