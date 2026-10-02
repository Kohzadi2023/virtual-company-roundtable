import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultAgents, defaultRoles, defaultTeams } from '@/lib/defaultCompany';
import type { SnapshotBackend } from '@/lib/snapshotDb';
import { bootstrapPersistence, setSnapshotBackend, startPersistence, stopPersistence } from '@/lib/storage';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { Room, StorageSnapshot } from '@/types/domain';

const KEY = 'ai-team-chat:snapshot:v4';

/**
 * In-memory Storage whose writes can be made to fail like a full quota. The
 * real jsdom/Node localStorage differs between runtimes and cannot be spied on
 * reliably, so the whole object is replaced.
 */
class FakeStorage implements Storage {
  private readonly data = new Map<string, string>();
  full = false;
  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.full) throw new DOMException('full', 'QuotaExceededError');
    this.data.set(key, value);
  }
}

let storage: FakeStorage;

class MemoryBackend implements SnapshotBackend {
  stored: string | null = null;
  failWrites = false;
  writes = 0;
  async read() {
    return this.stored;
  }
  async write(json: string) {
    if (this.failWrites) return false;
    this.writes += 1;
    this.stored = json;
    return true;
  }
}

function room(id: string, messageCount: number): Room {
  return {
    id,
    name: id,
    emoji: '🏢',
    agentIds: [],
    messages: Array.from({ length: messageCount }, (_, index) => ({
      id: `${id}-m${index}`,
      authorType: 'user' as const,
      content: `message ${index}`,
      createdAt: index + 1,
    })),
    createdAt: 1,
  };
}

function snapshot(rooms: Room[], savedAt: number): StorageSnapshot {
  return {
    version: 4,
    rooms,
    roles: defaultRoles.map(role => ({ ...role })),
    agents: defaultAgents.map(agent => ({ ...agent })),
    teams: defaultTeams.map(team => ({ ...team, agentIds: [...team.agentIds] })),
    projects: [],
    decisions: [],
    actionItems: [],
    agentContext: {},
    activeRoomId: rooms[0]?.id ?? null,
    savedAt,
  };
}

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 450));
const roomIds = () => useWorkspaceStore.getState().rooms.map(item => item.id);

let backend: MemoryBackend;

beforeEach(() => {
  storage = new FakeStorage();
  vi.stubGlobal('localStorage', storage);
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  backend = new MemoryBackend();
  setSnapshotBackend(backend);
  useWorkspaceStore.setState({ rooms: [], hydrated: false, syncState: 'idle' });
});

afterEach(() => {
  stopPersistence();
  setSnapshotBackend(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('snapshot persistence with a database backend', () => {
  it('migrates a localStorage snapshot into the database and frees the quota', async () => {
    localStorage.setItem(KEY, JSON.stringify(snapshot([room('legacy', 3)], 100)));

    await bootstrapPersistence();

    expect(roomIds()).toEqual(['legacy']);
    expect(JSON.parse(backend.stored ?? '{}').rooms[0].id).toBe('legacy');
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(useWorkspaceStore.getState().syncState).not.toBe('error');
  });

  it('keeps saving changes to the database even when localStorage is completely full', async () => {
    await bootstrapPersistence();
    startPersistence();
    storage.full = true;

    useWorkspaceStore.getState().createRoom('New thread');
    await flush();

    expect(useWorkspaceStore.getState().syncState).not.toBe('error');
    expect(JSON.parse(backend.stored ?? '{}').rooms.some((item: Room) => item.name === 'New thread')).toBe(true);
  });

  it('loads the newest copy: a newer localStorage copy (e.g. a restored backup) beats the database', async () => {
    backend.stored = JSON.stringify(snapshot([room('old-db', 1)], 100));
    localStorage.setItem(KEY, JSON.stringify(snapshot([room('restored', 1)], 200)));

    await bootstrapPersistence();

    expect(roomIds()).toEqual(['restored']);
    expect(JSON.parse(backend.stored ?? '{}').rooms[0].id).toBe('restored');
  });

  it('prefers the database on a tie and when it is newer', async () => {
    backend.stored = JSON.stringify(snapshot([room('db', 1)], 300));
    localStorage.setItem(KEY, JSON.stringify(snapshot([room('ls', 1)], 200)));

    await bootstrapPersistence();

    expect(roomIds()).toEqual(['db']);
  });

  it('falls back to localStorage when the database write fails, and flags an error only if that fails too', async () => {
    backend.failWrites = true;
    await bootstrapPersistence();
    startPersistence();

    useWorkspaceStore.getState().createRoom('Fallback thread');
    await flush();
    expect(useWorkspaceStore.getState().syncState).not.toBe('error');
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}').rooms.some((item: Room) => item.name === 'Fallback thread')).toBe(true);

    storage.full = true;
    useWorkspaceStore.getState().createRoom('Unsaveable thread');
    await flush();
    expect(useWorkspaceStore.getState().syncState).toBe('error');
  });

  it('flushes pending changes synchronously when the page is being closed', async () => {
    await bootstrapPersistence();
    startPersistence();

    useWorkspaceStore.getState().createRoom('Last second thread');
    // Reload before the 350 ms debounce fires.
    window.dispatchEvent(new Event('pagehide'));

    const flushed = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    expect(flushed.rooms.some((item: Room) => item.name === 'Last second thread')).toBe(true);
  });

  it('applies overlapping saves in order so an older snapshot never overwrites a newer one', async () => {
    await bootstrapPersistence();
    startPersistence();
    const order: string[] = [];
    const original = backend.write.bind(backend);
    backend.write = async json => {
      const names = (JSON.parse(json).rooms as Room[]).map(item => item.name);
      // The first write is slow; a naive implementation would let the second overtake it.
      if (names.includes('first')) await new Promise(resolve => setTimeout(resolve, 100));
      order.push(names[names.length - 1] ?? '');
      return original(json);
    };

    useWorkspaceStore.getState().createRoom('first');
    await new Promise(resolve => setTimeout(resolve, 380));
    useWorkspaceStore.getState().createRoom('second');
    await new Promise(resolve => setTimeout(resolve, 700));

    expect(order).toEqual(['first', 'second']);
    expect((JSON.parse(backend.stored ?? '{}').rooms as Room[]).map(item => item.name)).toContain('second');
  });
});
