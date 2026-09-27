import type { ActionItem } from '@/types/domain';

type DeadlineInput = Pick<ActionItem, 'deadline' | 'status'>;

/** deadline is stored as the value of an <input type="date">, i.e. an ISO YYYY-MM-DD string, so lexicographic comparison against another ISO date string is a valid chronological comparison. */
function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** A done item is never overdue -- the work is finished, regardless of when the deadline was. */
export function isActionItemOverdue(item: DeadlineInput, now: Date = new Date()): boolean {
  if (!item.deadline || item.status === 'done') return false;
  return item.deadline < todayIso(now);
}

/** Due today or within the next `withinDays` days, and not already overdue or done. */
export function isActionItemDueSoon(item: DeadlineInput, withinDays = 3, now: Date = new Date()): boolean {
  if (!item.deadline || item.status === 'done') return false;
  const today = todayIso(now);
  if (item.deadline < today) return false;
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + withinDays);
  return item.deadline <= todayIso(horizon);
}
