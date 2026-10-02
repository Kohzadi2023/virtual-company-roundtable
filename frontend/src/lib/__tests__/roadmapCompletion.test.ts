import { beforeEach, describe, expect, it } from 'vitest';
import {
  actionReminderState,
  summarizeActionDeadlines,
  buildDecisionGraph,
  decisionIdForAction,
  loadReminderPreferences,
  saveReminderPreferences,
} from '@/lib/roadmapCompletion';
import type { ActionItem, DecisionRecord } from '@/types/domain';

function decision(id: string, status: DecisionRecord['status'] = 'approved', createdAt = 1): DecisionRecord {
  return {
    id,
    projectId: 'project-a',
    title: id,
    details: '',
    status,
    createdAt,
    updatedAt: createdAt,
  };
}

function action(patch: Partial<ActionItem> = {}): ActionItem {
  return {
    id: 'action-a',
    projectId: 'project-a',
    title: 'Implement decision',
    status: 'todo',
    priority: 'medium',
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  };
}

describe('roadmap completion utilities', () => {
  beforeEach(() => localStorage.clear());

  it('uses explicit decision links and migrates legacy Decision evidence', () => {
    expect(decisionIdForAction(action({ sourceDecisionId: 'decision-explicit', evidence: 'Decision legacy' }))).toBe('decision-explicit');
    expect(decisionIdForAction(action({ evidence: 'Decision decision-legacy' }))).toBe('decision-legacy');
    expect(decisionIdForAction(action({ evidence: 'Other note' }))).toBeUndefined();
  });

  it('classifies overdue and due-soon actions', () => {
    const now = new Date('2026-09-20T12:00:00').getTime();
    expect(actionReminderState(action({ deadline: '2026-09-19' }), now, 24)).toBe('overdue');
    expect(actionReminderState(action({ deadline: '2026-09-20' }), now, 24)).toBe('due-soon');
    expect(actionReminderState(action({ deadline: '2026-09-30' }), now, 24)).toBeNull();
    expect(actionReminderState(action({ deadline: '2026-09-19', status: 'done' }), now, 24)).toBeNull();
  });

  it('counts overdue and due-soon actions, ignoring done and undated ones', () => {
    const now = new Date('2026-09-20T12:00:00').getTime();
    const summary = summarizeActionDeadlines([
      action({ deadline: '2026-09-18' }),
      action({ deadline: '2026-09-19' }),
      action({ deadline: '2026-09-20' }),
      action({ deadline: '2026-10-30' }),
      action({ deadline: '2026-09-01', status: 'done' }),
      action({}),
    ], now, 24);
    expect(summary).toEqual({ overdue: 2, dueSoon: 1 });
    expect(summarizeActionDeadlines([], now)).toEqual({ overdue: 0, dueSoon: 0 });
  });

  it('builds dependency depth and propagates reversed-ancestor impact', () => {
    const decisions = [decision('a', 'reversed', 1), decision('b', 'approved', 2), decision('c', 'proposed', 3)];
    const graph = buildDecisionGraph(decisions, [
      { id: 'ab', decisionId: 'b', dependsOnDecisionId: 'a', createdAt: 1 },
      { id: 'bc', decisionId: 'c', dependsOnDecisionId: 'b', createdAt: 2 },
    ]);
    expect(graph.find(node => node.decision.id === 'a')?.depth).toBe(0);
    expect(graph.find(node => node.decision.id === 'b')?.depth).toBe(1);
    expect(graph.find(node => node.decision.id === 'b')?.impactedByReversal).toBe(true);
    expect(graph.find(node => node.decision.id === 'c')?.depth).toBe(2);
    expect(graph.find(node => node.decision.id === 'c')?.impactedByReversal).toBe(true);
  });

  it('persists reminder preferences with safe bounds', () => {
    saveReminderPreferences({ desktopEnabled: true, dueSoonHours: 999, timerNotifications: false });
    expect(loadReminderPreferences()).toEqual({ desktopEnabled: true, dueSoonHours: 168, timerNotifications: false });
  });
});
