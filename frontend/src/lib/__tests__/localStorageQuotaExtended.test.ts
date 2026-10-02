import { beforeEach, describe, expect, it } from 'vitest';
import {
  removeRedundantLegacySnapshots,
  runWithLocalStorageQuotaRecovery,
} from '@/lib/localStorageQuota';

const V4_KEY = 'ai-team-chat:snapshot:v4';
const V3_KEY = 'ai-team-chat:snapshot:v3';
const V2_KEY = 'ai-team-chat:snapshot:v2';
const MEMORY_KEY = 'virtual-company:memory-v2:v1';

describe('extended localStorage quota recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('removes redundant legacy workspace snapshots only after v4 exists', () => {
    localStorage.setItem(V3_KEY, JSON.stringify({ version: 3, payload: 'x'.repeat(500) }));
    localStorage.setItem(V2_KEY, JSON.stringify({ version: 2, payload: 'y'.repeat(500) }));

    expect(removeRedundantLegacySnapshots()).toBe(0);
    expect(localStorage.getItem(V3_KEY)).not.toBeNull();
    expect(localStorage.getItem(V2_KEY)).not.toBeNull();

    localStorage.setItem(V4_KEY, JSON.stringify({ version: 4, rooms: [], savedAt: 1 }));
    const freed = removeRedundantLegacySnapshots();

    expect(freed).toBeGreaterThan(900);
    expect(localStorage.getItem(V3_KEY)).toBeNull();
    expect(localStorage.getItem(V2_KEY)).toBeNull();
    expect(localStorage.getItem(V4_KEY)).not.toBeNull();
  });

  it('uses bounded Memory V2 compaction as a second recovery stage before giving up', () => {
    const history = Array.from({ length: 320 }, (_, index) => ({
      id: `history-${index}`,
      event: 'updated',
      detail: 'x'.repeat(80),
    }));
    localStorage.setItem(MEMORY_KEY, JSON.stringify({
      version: 1,
      sharedMemories: [{ id: 'durable-memory', content: 'must remain' }],
      suggestions: [],
      relations: [],
      conflicts: [],
      history,
      agentMemoryCache: {},
    }));
    const before = localStorage.getItem(MEMORY_KEY)?.length ?? 0;

    let attempts = 0;
    const result = runWithLocalStorageQuotaRecovery(() => {
      attempts += 1;
      if (attempts < 3) throw new DOMException('storage full', 'QuotaExceededError');
      return 'saved';
    });

    const afterRaw = localStorage.getItem(MEMORY_KEY) ?? '{}';
    const after = JSON.parse(afterRaw) as {
      sharedMemories?: Array<{ id?: string }>;
      history?: unknown[];
    };

    expect(result.ok).toBe(true);
    expect(result.recovered).toBe(true);
    expect(result.value).toBe('saved');
    expect(result.freedCharacters).toBeGreaterThan(0);
    expect(attempts).toBe(3);
    expect(afterRaw.length).toBeLessThan(before);
    expect(after.sharedMemories?.[0]?.id).toBe('durable-memory');
    expect(after.history?.length).toBe(200);
  });
});
