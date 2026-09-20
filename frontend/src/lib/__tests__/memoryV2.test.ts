import { beforeEach, describe, expect, it } from 'vitest';
import {
  acceptMemorySuggestion,
  addSharedMemory,
  buildMemoryDigest,
  captureAgentMemoryHistory,
  loadMemoryV2,
  relevantSharedMemories,
  suggestMemoryFromMessage,
  syncOliviaMeetingState,
} from '@/lib/memoryV2';
import { addAgentMemory, loadWorkspaceSuite, updateAgentMemory } from '@/lib/workspaceSuite';
import type { Room } from '@/types/domain';

const MEMORY_V2_KEY = 'virtual-company:memory-v2:v1';

function room(): Room {
  return {
    id: 'room-a',
    name: 'Architecture Review',
    emoji: '🏗️',
    companyId: 'company-default',
    projectId: 'project-a',
    agentIds: ['agent-emma', 'agent-olivia'],
    agenda: ['Storage decision', 'Risks'],
    messages: [],
    createdAt: 1,
  };
}

describe('memory v2', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps company memory visible while isolating project memory', () => {
    addSharedMemory({
      scope: 'company',
      companyId: 'company-default',
      category: 'constraint',
      title: 'Manual AI',
      content: 'Keep the external AI workflow manual.',
      status: 'active',
      importance: 'high',
    });
    addSharedMemory({
      scope: 'project',
      companyId: 'company-default',
      projectId: 'project-a',
      category: 'decision',
      title: 'Desktop shell',
      content: 'Use Tauri 2 for this project.',
      status: 'active',
      importance: 'medium',
    });
    addSharedMemory({
      scope: 'project',
      companyId: 'company-default',
      projectId: 'project-b',
      category: 'decision',
      title: 'Other project',
      content: 'Do not include this in Project A.',
      status: 'active',
      importance: 'medium',
    });

    const memories = relevantSharedMemories('project-a', 'company-default', 'desktop manual');
    expect(memories.map(item => item.title)).toContain('Manual AI');
    expect(memories.map(item => item.title)).toContain('Desktop shell');
    expect(memories.map(item => item.title)).not.toContain('Other project');
  });

  it('creates a reviewable local suggestion and accepts it as agent memory', () => {
    const source = room();
    const message = {
      id: 'message-1',
      authorType: 'agent' as const,
      authorId: 'agent-emma',
      authorNameSnapshot: 'Emma',
      roleNameSnapshot: 'Software Architect',
      content: 'Decision: we will use SQLite as the local source of truth for durable workspace data.',
      createdAt: 2,
    };
    source.messages.push(message);

    const suggestionId = suggestMemoryFromMessage(source, message, 'company-default');
    expect(suggestionId).not.toBeNull();
    expect(loadMemoryV2().suggestions[0]?.status).toBe('pending');

    const memoryId = acceptMemorySuggestion(suggestionId!);
    expect(memoryId).not.toBeNull();
    expect(loadWorkspaceSuite().agentMemories.some(item => item.id === memoryId && item.agentId === 'agent-emma')).toBe(true);
    expect(loadMemoryV2().suggestions.find(item => item.id === suggestionId)?.status).toBe('accepted');
  });

  it('stores compact agent-memory fingerprints instead of duplicating memory content', () => {
    const content = `Long memory payload ${'x'.repeat(5000)}`;
    const memoryId = addAgentMemory({
      agentId: 'agent-emma',
      companyId: 'company-default',
      projectId: 'project-a',
      category: 'decision',
      title: 'Large durable memory',
      content,
      status: 'active',
      importance: 'high',
    });

    expect(memoryId).not.toBeNull();
    captureAgentMemoryHistory();

    const cached = loadMemoryV2().agentMemoryCache[memoryId!];
    expect(cached?.fingerprint).toMatch(/^h1:[0-9a-f]{16}$/);
    expect(cached?.fingerprint).not.toContain(content.slice(0, 32));
    expect(JSON.stringify(cached).length).toBeLessThan(200);
  });

  it('migrates legacy raw fingerprints without creating a false change event', () => {
    const memoryId = addAgentMemory({
      agentId: 'agent-emma',
      companyId: 'company-default',
      projectId: 'project-a',
      category: 'decision',
      title: 'Legacy cache entry',
      content: 'Use the legacy cache entry only to verify migration behavior.',
      status: 'active',
      importance: 'medium',
    });
    const entry = loadWorkspaceSuite().agentMemories.find(item => item.id === memoryId)!;
    const legacyFingerprint = [entry.title, entry.content, entry.status, entry.importance, entry.projectId ?? '', entry.updatedAt].join('|');

    localStorage.setItem(MEMORY_V2_KEY, JSON.stringify({
      version: 1,
      sharedMemories: [],
      suggestions: [],
      relations: [],
      conflicts: [],
      history: [],
      agentMemoryCache: {
        [entry.id]: { fingerprint: legacyFingerprint, title: entry.title },
      },
    }));

    captureAgentMemoryHistory();

    const state = loadMemoryV2();
    expect(state.agentMemoryCache[entry.id]?.fingerprint).toMatch(/^h1:[0-9a-f]{16}$/);
    expect(state.history.some(event => event.action === 'agent-memory.changed')).toBe(false);
  });

  it('still records a real agent-memory change after compact fingerprints are stored', () => {
    const memoryId = addAgentMemory({
      agentId: 'agent-emma',
      companyId: 'company-default',
      projectId: 'project-a',
      category: 'decision',
      title: 'Change detection',
      content: 'Original durable memory content.',
      status: 'active',
      importance: 'medium',
    });

    expect(memoryId).not.toBeNull();
    captureAgentMemoryHistory();
    updateAgentMemory(memoryId!, { content: 'Updated durable memory content.' });
    captureAgentMemoryHistory();

    const changes = loadMemoryV2().history.filter(event => event.action === 'agent-memory.changed' && event.memoryRef === `agent:${memoryId}`);
    expect(changes).toHaveLength(1);
  });

  it('detects potential conflicts in overlapping active memory', () => {
    addSharedMemory({
      scope: 'project',
      companyId: 'company-default',
      projectId: 'project-a',
      category: 'decision',
      title: 'Workspace persistence decision',
      content: 'Workspace persistence uses SQLite as the durable local source of truth.',
      status: 'active',
      importance: 'high',
    });
    addSharedMemory({
      scope: 'project',
      companyId: 'company-default',
      projectId: 'project-a',
      category: 'decision',
      title: 'Workspace persistence decision',
      content: 'Workspace persistence uses browser localStorage as the durable local source of truth.',
      status: 'active',
      importance: 'high',
    });

    expect(loadMemoryV2().conflicts.some(item => item.status === 'open')).toBe(true);
  });

  it('maintains Olivia meeting state as agent-system memory', () => {
    const source = room();
    source.messages.push({ id: 'm1', authorType: 'user', content: 'Should we keep port 8765 fixed?', createdAt: 3 });
    syncOliviaMeetingState(
      source,
      [{ id: 'd1', projectId: 'project-a', roomId: source.id, title: 'Use Tauri', details: '', status: 'approved', createdAt: 1, updatedAt: 1 }],
      [{ id: 'a1', projectId: 'project-a', roomId: source.id, title: 'Review port collision', owner: 'Emma', status: 'todo', priority: 'high', createdAt: 1, updatedAt: 1 }],
      'company-default',
    );

    const state = loadMemoryV2();
    const meeting = state.sharedMemories.find(item => item.scope === 'agent-system' && item.agentId === 'agent-olivia');
    expect(meeting?.content).toContain('Review port collision');
    expect(meeting?.content).toContain('Should we keep port 8765 fixed');
  });

  it('builds deterministic compact digests without an AI API', () => {
    const digest = buildMemoryDigest([
      { category: 'risk', title: 'Port collision', content: 'Fixed port 8765 can collide with another local service.', importance: 'high' },
      { category: 'decision', title: 'Desktop shell', content: 'Use Tauri 2.', importance: 'medium' },
    ]);
    expect(digest).toContain('RISK:');
    expect(digest).toContain('Port collision');
    expect(digest).toContain('DECISION:');
  });
});
