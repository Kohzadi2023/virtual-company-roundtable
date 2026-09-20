import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  compactMemoryV2State,
  compactMemoryV2Storage,
  hasLocalStorageHeadroom,
  isStorageQuotaError,
  prepareMemoryV2Storage,
  runWithMemoryV2StorageRecovery,
} from '@/lib/memoryV2Storage';

const MEMORY_KEY = 'virtual-company:memory-v2:v1';

describe('memoryV2Storage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('compacts derived and old metadata without deleting shared memories or relations', () => {
    const state = {
      version: 1,
      sharedMemories: [{ id: 'memory-1', content: 'keep me' }],
      relations: [{ id: 'relation-1', fromRef: 'v2:memory-1', toRef: 'agent:a' }],
      suggestions: [
        { id: 'pending', status: 'pending', createdAt: 10 },
        ...Array.from({ length: 100 }, (_, index) => ({ id: `resolved-${index}`, status: 'accepted', createdAt: index })),
      ],
      conflicts: [
        { id: 'open', status: 'open', createdAt: 10 },
        ...Array.from({ length: 100 }, (_, index) => ({ id: `closed-${index}`, status: 'resolved', resolvedAt: index })),
      ],
      history: Array.from({ length: 500 }, (_, index) => ({ id: `history-${index}` })),
      agentMemoryCache: {
        a: { fingerprint: 'full memory content duplicated here', title: 'Agent memory' },
      },
    };

    const compacted = compactMemoryV2State(state);

    expect(compacted.sharedMemories).toEqual(state.sharedMemories);
    expect(compacted.relations).toEqual(state.relations);
    expect(compacted.history).toHaveLength(250);
    expect(compacted.suggestions).toHaveLength(61);
    expect(compacted.conflicts).toHaveLength(61);
    expect(compacted.agentMemoryCache).toEqual({});
  });

  it('does not discard a small derived cache when storage is healthy', () => {
    const state = {
      version: 1,
      sharedMemories: [],
      suggestions: [],
      relations: [],
      conflicts: [],
      history: [],
      agentMemoryCache: {
        a: { fingerprint: 'small-fingerprint', title: 'Agent memory' },
      },
    };
    localStorage.setItem(MEMORY_KEY, JSON.stringify(state));

    expect(prepareMemoryV2Storage()).toBe(false);
    expect(JSON.parse(localStorage.getItem(MEMORY_KEY)!).agentMemoryCache).toEqual(state.agentMemoryCache);
  });

  it('shrinks an existing Memory V2 localStorage payload in place', () => {
    localStorage.setItem(MEMORY_KEY, JSON.stringify({
      version: 1,
      sharedMemories: [{ id: 'memory-1', content: 'important' }],
      suggestions: [],
      relations: [],
      conflicts: [],
      history: Array.from({ length: 500 }, (_, index) => ({ id: `h-${index}`, label: 'x'.repeat(50) })),
      agentMemoryCache: {
        a: { fingerprint: 'duplicated'.repeat(1000), title: 'A' },
      },
    }));
    const before = localStorage.getItem(MEMORY_KEY)!.length;

    expect(compactMemoryV2Storage()).toBe(true);

    const raw = localStorage.getItem(MEMORY_KEY)!;
    const after = raw.length;
    const parsed = JSON.parse(raw);
    expect(after).toBeLessThan(before);
    expect(parsed.sharedMemories[0].content).toBe('important');
    expect(parsed.agentMemoryCache).toEqual({});
    expect(parsed.history).toHaveLength(250);
  });

  it('recognizes browser quota errors', () => {
    expect(isStorageQuotaError(new DOMException('full', 'QuotaExceededError'))).toBe(true);
    expect(isStorageQuotaError(new Error('ordinary failure'))).toBe(false);
  });

  it('compacts and retries once after a quota error instead of propagating the crash', () => {
    localStorage.setItem(MEMORY_KEY, JSON.stringify({
      version: 1,
      sharedMemories: [],
      suggestions: [],
      relations: [],
      conflicts: [],
      history: Array.from({ length: 400 }, (_, index) => ({ id: `h-${index}`, label: 'old' })),
      agentMemoryCache: { a: { fingerprint: 'large'.repeat(100), title: 'A' } },
    }));
    let attempts = 0;

    const result = runWithMemoryV2StorageRecovery(() => {
      attempts += 1;
      if (attempts === 1) throw new DOMException('full', 'QuotaExceededError');
      return 'saved';
    }, 'test save');

    expect(result).toBe('saved');
    expect(attempts).toBe(2);
    expect(JSON.parse(localStorage.getItem(MEMORY_KEY)!).agentMemoryCache).toEqual({});
  });

  it('returns undefined when the retry still exceeds quota', () => {
    const result = runWithMemoryV2StorageRecovery(() => {
      throw new DOMException('still full', 'QuotaExceededError');
    }, 'test save');

    expect(result).toBeUndefined();
  });

  it('can conservatively reject a derived-cache rebuild before storage is full', () => {
    localStorage.setItem('large-key', 'x'.repeat(1000));
    expect(hasLocalStorageHeadroom(200, 1500)).toBe(true);
    expect(hasLocalStorageHeadroom(600, 1500)).toBe(false);
  });
});
