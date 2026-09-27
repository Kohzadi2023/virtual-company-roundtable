import { describe, expect, it } from 'vitest';
import { isActionItemDueSoon, isActionItemOverdue } from '@/lib/actionItemDeadline';
import type { ActionItemStatus } from '@/types/domain';

const NOW = new Date('2026-06-15T12:00:00Z');

function item(deadline: string | undefined, status: ActionItemStatus = 'todo') {
  return { deadline, status };
}

describe('isActionItemOverdue', () => {
  it('is true for a past deadline still open', () => {
    expect(isActionItemOverdue(item('2026-06-14'), NOW)).toBe(true);
  });

  it('is false for today or a future deadline', () => {
    expect(isActionItemOverdue(item('2026-06-15'), NOW)).toBe(false);
    expect(isActionItemOverdue(item('2026-06-16'), NOW)).toBe(false);
  });

  it('is false with no deadline set', () => {
    expect(isActionItemOverdue(item(undefined), NOW)).toBe(false);
  });

  it('is false once the item is done, no matter how late', () => {
    expect(isActionItemOverdue(item('2026-01-01', 'done'), NOW)).toBe(false);
  });
});

describe('isActionItemDueSoon', () => {
  it('is true for today and within the window', () => {
    expect(isActionItemDueSoon(item('2026-06-15'), 3, NOW)).toBe(true);
    expect(isActionItemDueSoon(item('2026-06-18'), 3, NOW)).toBe(true);
  });

  it('is false just past the window', () => {
    expect(isActionItemDueSoon(item('2026-06-19'), 3, NOW)).toBe(false);
  });

  it('is false for an already-overdue item (it is overdue, not "due soon")', () => {
    expect(isActionItemDueSoon(item('2026-06-14'), 3, NOW)).toBe(false);
  });

  it('is false with no deadline or when done', () => {
    expect(isActionItemDueSoon(item(undefined), 3, NOW)).toBe(false);
    expect(isActionItemDueSoon(item('2026-06-15', 'done'), 3, NOW)).toBe(false);
  });
});
