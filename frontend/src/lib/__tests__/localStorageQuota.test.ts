import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  compactCanonicalLocalSnapshot,
  isQuotaExceededError,
  runWithLocalStorageQuotaRecovery,
  stripExtensionsForLocalSnapshot,
} from '@/lib/localStorageQuota';

const SNAPSHOT_KEY = 'ai-team-chat:snapshot:v4';

describe('localStorage quota recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('recognizes browser quota errors', () => {
    expect(isQuotaExceededError(new DOMException('full', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaExceededError({ name: 'NS_ERROR_DOM_QUOTA_REACHED', code: 1014 })).toBe(true);
    expect(isQuotaExceededError(new Error('other'))).toBe(false);
  });

  it('removes only the redundant extension bundle from the canonical local snapshot', () => {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({
      version: 4,
      rooms: [{ id: 'room-a' }],
      extensions: {
        version: 1,
        meetingOrchestration: { rooms: { 'room-a': { roundIndex: 0 } } },
        memoryV2: { large: 'x'.repeat(2_000) },
      },
      savedAt: 123,
    }));

    const before = localStorage.getItem(SNAPSHOT_KEY)?.length ?? 0;
    const freed = compactCanonicalLocalSnapshot();
    const afterRaw = localStorage.getItem(SNAPSHOT_KEY) ?? '{}';
    const after = JSON.parse(afterRaw) as Record<string, unknown>;

    expect(freed).toBeGreaterThan(0);
    expect(afterRaw.length).toBeLessThan(before);
    expect(after.extensions).toBeUndefined();
    expect(after.rooms).toEqual([{ id: 'room-a' }]);
    expect(after.savedAt).toBe(123);
  });

  it('retries an operation once after quota compaction', () => {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({
      version: 4,
      rooms: [],
      extensions: { version: 1, memoryV2: { large: 'x'.repeat(1_000) } },
      savedAt: 1,
    }));

    let attempts = 0;
    const result = runWithLocalStorageQuotaRecovery(() => {
      attempts += 1;
      if (attempts === 1) throw new DOMException('full', 'QuotaExceededError');
      return 'saved';
    });

    expect(result.ok).toBe(true);
    expect(result.recovered).toBe(true);
    expect(result.freedCharacters).toBeGreaterThan(0);
    expect(result.value).toBe('saved');
    expect(attempts).toBe(2);
  });

  it('strips extensions for local persistence without mutating the remote-shaped snapshot', () => {
    const snapshot = {
      version: 4 as const,
      rooms: [],
      extensions: { version: 1 as const, meetingOrchestration: { rooms: {} } },
      savedAt: 7,
    };

    const local = stripExtensionsForLocalSnapshot(snapshot);

    expect(local).not.toHaveProperty('extensions');
    expect(snapshot.extensions).toBeDefined();
  });
});
