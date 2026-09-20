import { useEffect, useMemo, useState } from 'react';
import {
  loadOperationsSuite,
  OPERATIONS_SUITE_EVENT,
  updateReviewRequest,
} from '@/lib/operationsSuite';
import {
  actionReminderState,
  decisionIdForAction,
  loadReminderPreferences,
  markReminderSent,
  ROADMAP_COMPLETION_EVENT,
  shouldSendReminder,
} from '@/lib/roadmapCompletion';
import { useWorkspaceStore } from '@/store/workspaceStore';

function desktopNotify(title: string, body: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag: title });
  } catch {
    // Desktop/browser notification support is optional; in-app notifications remain available.
  }
}

export function OperationsCompletionRuntime() {
  const actionItems = useWorkspaceStore(state => state.actionItems);
  const decisions = useWorkspaceStore(state => state.decisions);
  const rooms = useWorkspaceStore(state => state.rooms);
  const [ops, setOps] = useState(loadOperationsSuite);
  const [preferences, setPreferences] = useState(loadReminderPreferences);
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const refreshOps = () => setOps(loadOperationsSuite());
    const refreshPreferences = () => setPreferences(loadReminderPreferences());
    window.addEventListener(OPERATIONS_SUITE_EVENT, refreshOps);
    window.addEventListener(ROADMAP_COMPLETION_EVENT, refreshPreferences);
    return () => {
      window.removeEventListener(OPERATIONS_SUITE_EVENT, refreshOps);
      window.removeEventListener(ROADMAP_COMPLETION_EVENT, refreshPreferences);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const validDecisionIds = useMemo(() => new Set(decisions.map(item => item.id)), [decisions]);

  useEffect(() => {
    const missing = actionItems
      .map(action => ({ action, decisionId: decisionIdForAction(action) }))
      .filter(({ action, decisionId }) => !action.sourceDecisionId && decisionId && validDecisionIds.has(decisionId));
    if (missing.length === 0) return;
    const links = new Map(missing.map(({ action, decisionId }) => [action.id, decisionId as string]));
    useWorkspaceStore.setState(state => ({
      actionItems: state.actionItems.map(action => {
        const sourceDecisionId = links.get(action.id);
        return sourceDecisionId ? { ...action, sourceDecisionId, updatedAt: Date.now() } : action;
      }),
    }));
  }, [actionItems, validDecisionIds]);

  useEffect(() => {
    const openRequests = ops.reviewRequests.filter(request => request.status === 'open');
    for (const request of openRequests) {
      const room = rooms.find(item => item.id === request.roomId);
      const answered = room?.messages.some(message =>
        message.authorType === 'agent'
        && message.authorId === request.targetAgentId
        && message.createdAt > request.createdAt,
      );
      if (answered) updateReviewRequest(request.id, { status: 'done' });
    }
  }, [ops.reviewRequests, rooms]);

  useEffect(() => {
    if (!preferences.desktopEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    for (const action of actionItems) {
      const state = actionReminderState(action, tick, preferences.dueSoonHours);
      if (!state) continue;
      const key = `action:${state}:${action.id}`;
      if (!shouldSendReminder(key, tick)) continue;
      desktopNotify(
        state === 'overdue' ? 'Virtual Company · Overdue action' : 'Virtual Company · Action due soon',
        `${action.title}${action.owner ? ` · ${action.owner}` : ''}${action.deadline ? ` · due ${action.deadline}` : ''}`,
      );
      markReminderSent(key, tick);
    }

    if (preferences.timerNotifications) {
      for (const timer of Object.values(ops.timers)) {
        if (!timer.startedAt) continue;
        const endsAt = timer.startedAt + timer.durationSeconds * 1000;
        if (tick < endsAt) continue;
        const key = `timer:${timer.roomId}:${timer.startedAt}`;
        if (!shouldSendReminder(key, tick, 365 * 24 * 60 * 60 * 1000)) continue;
        const room = rooms.find(item => item.id === timer.roomId);
        desktopNotify('Virtual Company · Meeting timer finished', `${timer.label}${room ? ` · ${room.name}` : ''}`);
        markReminderSent(key, tick);
      }
    }
  }, [actionItems, ops.timers, preferences, rooms, tick]);

  return null;
}
