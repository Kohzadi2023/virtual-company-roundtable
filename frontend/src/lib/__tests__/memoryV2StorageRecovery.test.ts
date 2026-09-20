import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  compactMemoryV2State,
  isStorageQuotaExceeded,
  runWithMemoryQuotaRecovery,
} from '@/lib/memoryV2StorageRecovery';

const KEY = 'virtual-company:memory-v2:v1';

function quotaError(): Error {
  const error = new Error('Storage quota exceeded');
  error.name = 'QuotaExceededError';
  return error;
}

describe('Memory V2 storage quota recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('recognizes browser quota errors without treating unrelated errors as quota failures', () => {
    expect(isStorageQuotaExceeded(quotaError())).toBe(true);
    expect(isStorageQuotaExceeded(Object.assign(new Error('Firefox quota'), { code: 1014 }))).toBe(true);
    expect(isStorageQuotaExceeded(new Error('network failed'))).toBe(false);
  });

  it('compacts derived metadata while preserving active shared memories and pending review items', () => {
    const activeShared = Array.from({ length: 20 }, (_, index) => ({ id: `memory-${index}`, status: 'active' }));
    const pendingSuggestions = Array.from({ length: 4 }, (_, index) => ({ id: `pending-${index}`, status: 'pending' }));
    const resolvedSuggestions = Array.from({ length: 180 }, (_, index) => ({ id: `resolved-${index}`, status: 'accepted' }));
    const openConflicts = Array.from({ length: 3 }, (_, index) => ({ id: `open-${index}`, status: 'open' }));
    const resolvedConflicts = Array.from({ length: 170 }, (_, index) => ({ id: `closed-${index}`, status: 'resolved' }));
    const cache = Object.fromEntries(Array.from({ length: 420 }, (_, index) => [`agent-${index}`, { fingerprint: `${index}` }]));

    const compacted = compactMemoryV2State({
      version: 1,
      sharedMemories: activeShared,
      suggestions: [...pendingSuggestions, ...resolvedSuggestions],
      relations: Array.from({ length: 450 }, (_, index) => ({ id: `relation-${index}` })),
      conflicts: [...openConflicts, ...resolvedConflicts],
      history: Array.from({ length: 600 }, (_, index) => ({ id: `history-${index}` })),
      agentMemoryCache: cache,
    });

    expect(compacted.sharedMemories).toEqual(activeShared);
    expect(compacted.suggestions).toHaveLength(104);
    expect(compacted.suggestions?.filter(item => item.status === 'pending')).toHaveLength(4);
    expect(compacted.relations).toHaveLength(300);
    expect(compacted.conflicts).toHaveLength(103);
    expect(compacted.history).toHaveLength(200);
    expect(Object.keys(compacted.agentMemoryCache ?? {})).toHaveLength(300);
  });

  it('compacts persisted Memory V2 data and retries the failed operation once', () => {
    localStorage.setItem(KEY, JSON.stringify({
      version: 1,
      sharedMemories: [{ id: 'keep-me', status: 'active', content: 'Important memory' }],
      suggestions: Array.from({ length: 180 }, (_, index) => ({ id: `suggestion-${index}`, status: 'accepted', content: 'x'.repeat(40) })),
      relations: Array.from({ length: 450 }, (_, index) => ({ id: `relation-${index}` })),
      conflicts: [],
      history: Array.from({ length: 600 }, (_, index) => ({ id: `history-${index}`, label: 'x'.repeat(40) })),
      agentMemoryCache: {},
    }));
    const before = localStorage.getItem(KEY)?.length ?? 0;
    let attempts = 0;

    const result = runWithMemoryQuotaRecovery('Test memory write', () => {
      attempts += 1;
      if (attempts === 1) throw quotaError();
      return 'saved';
    }, 'fallback');

    const after = localStorage.getItem(KEY)?.length ?? 0;
    const persisted = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { sharedMemories?: Array<{ id: string }>; history?: unknown[] };
    expect(result).toBe('saved');
    expect(attempts).toBe(2);
    expect(after).toBeLessThan(before);
    expect(persisted.sharedMemories?.[0]?.id).toBe('keep-me');
    expect(persisted.history).toHaveLength(200);
  });

  it('returns the fallback instead of crashing when quota cannot be recovered', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = runWithMemoryQuotaRecovery('Unrecoverable write', () => {
      throw quotaError();
    }, 'skipped');

    expect(result).toBe('skipped');
  });
});
