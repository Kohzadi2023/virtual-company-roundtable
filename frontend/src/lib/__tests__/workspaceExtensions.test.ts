import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureWorkspaceExtensions,
  restoreWorkspaceExtensions,
  withWorkspaceExtensions,
} from '@/lib/workspaceExtensions';
import type { StorageSnapshot } from '@/types/domain';

function emptySnapshot(): StorageSnapshot {
  return {
    version: 4,
    rooms: [],
    roles: [],
    agents: [],
    teams: [],
    projects: [],
    decisions: [],
    actionItems: [],
    agentContext: {},
    activeRoomId: null,
    savedAt: 123,
  };
}

describe('workspace extension persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('captures all extension stores in one bundle', () => {
    localStorage.setItem('virtual-company:workspace-suite:v1', JSON.stringify({ activeCompanyId: 'company-a' }));
    localStorage.setItem('virtual-company:memory-v2:v1', JSON.stringify({ version: 1, sharedMemories: [{ id: 'memory-1' }] }));
    localStorage.setItem('virtual-company:memory-intelligence:v1', JSON.stringify({ version: 1, candidates: [{ id: 'candidate-1' }] }));
    localStorage.setItem('virtual-company:meeting-orchestration:v1', JSON.stringify({ rooms: { room: { roundIndex: 2 } }, chats: {} }));
    localStorage.setItem('virtual-company:operations-suite:v1', JSON.stringify({ version: 1, risks: [{ id: 'risk-1' }] }));
    localStorage.setItem('virtual-company:security-preferences:v1', JSON.stringify({ appLockEnabled: true }));

    const bundle = captureWorkspaceExtensions();

    expect(bundle.version).toBe(1);
    expect(bundle.workspaceSuite).toEqual({ activeCompanyId: 'company-a' });
    expect(bundle.memoryV2).toEqual({ version: 1, sharedMemories: [{ id: 'memory-1' }] });
    expect(bundle.memoryIntelligence).toEqual({ version: 1, candidates: [{ id: 'candidate-1' }] });
    expect(bundle.meetingOrchestration).toEqual({ rooms: { room: { roundIndex: 2 } }, chats: {} });
    expect(bundle.operationsSuite).toEqual({ version: 1, risks: [{ id: 'risk-1' }] });
    expect(bundle.securityPreferences).toEqual({ appLockEnabled: true });
  });

  it('attaches current extension state without changing core snapshot fields', () => {
    localStorage.setItem('virtual-company:memory-v2:v1', JSON.stringify({ version: 1, sharedMemories: [] }));
    const snapshot = emptySnapshot();

    const combined = withWorkspaceExtensions(snapshot);

    expect(combined.savedAt).toBe(123);
    expect(combined.rooms).toEqual([]);
    expect(combined.extensions?.version).toBe(1);
    expect(combined.extensions?.memoryV2).toEqual({ version: 1, sharedMemories: [] });
  });

  it('restores captured stores, clears explicit null stores, and dispatches change events', () => {
    localStorage.setItem('virtual-company:memory-v2:v1', JSON.stringify({ stale: true }));
    localStorage.setItem('virtual-company:operations-suite:v1', JSON.stringify({ stale: true }));
    const eventSpy = vi.fn();
    window.addEventListener('virtual-company:memory-v2-changed', eventSpy);

    expect(restoreWorkspaceExtensions({
      version: 1,
      memoryV2: { version: 1, sharedMemories: [{ id: 'restored' }] },
      operationsSuite: null,
    })).toBe(true);

    expect(JSON.parse(localStorage.getItem('virtual-company:memory-v2:v1') ?? '{}')).toEqual({
      version: 1,
      sharedMemories: [{ id: 'restored' }],
    });
    expect(localStorage.getItem('virtual-company:operations-suite:v1')).toBeNull();
    expect(eventSpy).toHaveBeenCalledTimes(1);
    window.removeEventListener('virtual-company:memory-v2-changed', eventSpy);
  });

  it('ignores legacy snapshots that do not contain a v1 extension bundle', () => {
    localStorage.setItem('virtual-company:memory-v2:v1', JSON.stringify({ keep: true }));

    expect(restoreWorkspaceExtensions(undefined)).toBe(false);
    expect(restoreWorkspaceExtensions({ version: 2, memoryV2: null })).toBe(false);
    expect(JSON.parse(localStorage.getItem('virtual-company:memory-v2:v1') ?? '{}')).toEqual({ keep: true });
  });
});
