import { beforeEach, describe, expect, it } from 'vitest';
import {
  addAgentMemory,
  loadAutomaticBackups,
  loadWorkspaceSuite,
  recordAudit,
  relevantAgentMemories,
  saveAutomaticBackup,
  updateAgentMemory,
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
    expect(suite.agentMemories).toEqual([]);
  });

  it('records audit entries newest first', () => {
    recordAudit('room.archived', 'Archived Architecture room.');
    recordAudit('backup.exported', 'Exported backup.');

    const suite = loadWorkspaceSuite();
    expect(suite.auditLog).toHaveLength(2);
    expect(suite.auditLog[0]?.action).toBe('backup.exported');
    expect(suite.auditLog[1]?.action).toBe('room.archived');
  });

  it('creates a rolling local backup when enabled and includes extension state', () => {
    updateWorkspaceSuite(state => ({ ...state, autoBackupEnabled: true }));
    localStorage.setItem('virtual-company:memory-v2:v1', JSON.stringify({
      version: 1,
      sharedMemories: [{ id: 'memory-1', title: 'Preserve me' }],
    }));
    localStorage.setItem('virtual-company:meeting-orchestration:v1', JSON.stringify({
      rooms: { 'room-a': { roundIndex: 2, roundStage: 'complete' } },
      chats: { 'agent-emma': { provider: 'ChatGPT', url: 'https://chatgpt.com/c/example' } },
    }));

    saveAutomaticBackup(emptySnapshot(123));

    const backups = loadAutomaticBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0]?.snapshot.savedAt).toBe(123);
    expect(backups[0]?.suite.activeCompanyId).toBe('company-default');
    expect(backups[0]?.snapshot.extensions?.memoryV2).toEqual({
      version: 1,
      sharedMemories: [{ id: 'memory-1', title: 'Preserve me' }],
    });
    expect(backups[0]?.snapshot.extensions?.meetingOrchestration).toEqual({
      rooms: { 'room-a': { roundIndex: 2, roundStage: 'complete' } },
      chats: { 'agent-emma': { provider: 'ChatGPT', url: 'https://chatgpt.com/c/example' } },
    });
  });

  it('returns only active memories relevant to the agent and project', () => {
    const globalId = addAgentMemory({
      agentId: 'agent-emma',
      companyId: 'company-default',
      category: 'constraint',
      title: 'Manual AI',
      content: 'Keep the AI workflow manual unless explicitly changed.',
      status: 'active',
      importance: 'high',
    });
    addAgentMemory({
      agentId: 'agent-emma',
      companyId: 'company-default',
      projectId: 'project-a',
      category: 'decision',
      title: 'Desktop shell',
      content: 'Use Tauri 2 for the desktop shell.',
      status: 'active',
      importance: 'medium',
    });
    addAgentMemory({
      agentId: 'agent-emma',
      companyId: 'company-default',
      projectId: 'project-b',
      category: 'decision',
      title: 'Other project',
      content: 'This should not appear in project A.',
      status: 'active',
      importance: 'medium',
    });

    expect(globalId).not.toBeNull();
    const memories = relevantAgentMemories('agent-emma', 'project-a', 'company-default');
    expect(memories.map(entry => entry.title)).toEqual(['Manual AI', 'Desktop shell']);
  });

  it('excludes superseded memories from prompt context', () => {
    const id = addAgentMemory({
      agentId: 'agent-mike',
      companyId: 'company-default',
      category: 'risk',
      title: 'Old risk',
      content: 'This risk has been replaced.',
      status: 'active',
      importance: 'high',
    });
    expect(id).not.toBeNull();
    updateAgentMemory(id!, { status: 'superseded' });

    expect(relevantAgentMemories('agent-mike', undefined, 'company-default')).toEqual([]);
  });
});
