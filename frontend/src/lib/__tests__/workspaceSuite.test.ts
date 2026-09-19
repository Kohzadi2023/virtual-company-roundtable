import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadAutomaticBackups,
  loadWorkspaceSuite,
  recordAudit,
  saveAutomaticBackup,
  updateWorkspaceSuite,
} from '@/lib/workspaceSuite';
import type { StorageSnapshot } from '@/types/domain';

function emptySnapshot(savedAt = Date.now()): StorageSnapshot {
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
    savedAt,
  };
}

describe('workspaceSuite', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('hydrates built-in company, prompt and room templates', () => {
    const suite = loadWorkspaceSuite();

    expect(suite.companies[0].name).toBe('Virtual Company');
    expect(suite.promptTemplates.some(item => item.id === 'prompt-brainstorm')).toBe(true);
    expect(suite.roomTemplates.some(item => item.id === 'room-template-idea-lab')).toBe(true);
  });

  it('records audit entries newest first', () => {
    recordAudit('room.archived', 'Archived Architecture room.');
    recordAudit('backup.exported', 'Exported backup.');

    const suite = loadWorkspaceSuite();
    expect(suite.auditLog).toHaveLength(2);
    expect(suite.auditLog[0]?.action).toBe('backup.exported');
    expect(suite.auditLog[1]?.action).toBe('room.archived');
  });

  it('creates a rolling local backup when enabled', () => {
    updateWorkspaceSuite(state => ({ ...state, autoBackupEnabled: true }));
    saveAutomaticBackup(emptySnapshot(123));

    const backups = loadAutomaticBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0]?.snapshot.savedAt).toBe(123);
    expect(backups[0]?.suite.activeCompanyId).toBe('company-default');
  });
});
