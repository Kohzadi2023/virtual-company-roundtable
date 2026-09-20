import { beforeEach, describe, expect, it } from 'vitest';
import {
  assessMemoryCandidate,
  consolidateRoundMemory,
  loadMemoryIntelligence,
  queueMemoryCandidate,
} from '@/lib/memoryIntelligence';
import { addSharedMemory, loadMemoryV2 } from '@/lib/memoryV2';
import { loadWorkspaceSuite } from '@/lib/workspaceSuite';
import type { Message, Room } from '@/types/domain';

function room(messages: Message[] = []): Room {
  return {
    id: 'room-memory',
    name: 'Architecture Review',
    emoji: '🏗️',
    companyId: 'company-default',
    projectId: 'project-atoms',
    agentIds: ['agent-emma'],
    messages,
    createdAt: 1,
  };
}

function agentMessage(id: string, content: string): Message {
  return {
    id,
    authorType: 'agent',
    authorId: 'agent-emma',
    authorNameSnapshot: 'Emma',
    roleNameSnapshot: 'Software Architect',
    content,
    createdAt: Date.now(),
  };
}

const round = {
  roundIndex: 0,
  rounds: ['Initial opinions', 'Critique', 'Revised proposals', 'Final decision'],
};

describe('memory intelligence', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('routes project architecture constraints to Project Memory with a high score', () => {
    const message = agentMessage('m1', 'For this project, all cross-service contracts must remain versioned and backward compatible.');
    const assessment = assessMemoryCandidate(room([message]), message, 'company-default', round);

    expect(assessment?.target).toBe('project');
    expect(assessment?.category).toBe('constraint');
    expect(assessment?.score.total).toBeGreaterThanOrEqual(9);
    expect(assessment?.confidence).toBe('high');
  });

  it('routes durable professional preferences to the specialist Agent Memory', () => {
    const message = agentMessage('m2', 'I prefer explicit bounded contexts and I prioritize clear service ownership when I evaluate architecture.');
    const assessment = assessMemoryCandidate(room([message]), message, 'company-default', round);

    expect(assessment?.target).toBe('agent');
    expect(assessment?.category).toBe('preference');
    expect(assessment?.score.total).toBeGreaterThanOrEqual(9);
  });

  it('auto-saves a high-confidence candidate only when the round completes', () => {
    const message = agentMessage('m3', 'For this project, all cross-service contracts must remain versioned and backward compatible.');
    const currentRoom = room([message]);
    queueMemoryCandidate(currentRoom, message, 'company-default', round);

    expect(loadMemoryV2().sharedMemories).toHaveLength(0);
    const result = consolidateRoundMemory(currentRoom, { ...round, roundStage: 'complete' });

    expect(result.autoSaved).toBe(1);
    expect(loadMemoryV2().sharedMemories.some(memory => memory.projectId === 'project-atoms' && memory.sourceMessageId === 'm3')).toBe(true);
    expect(loadMemoryIntelligence().candidates.find(candidate => candidate.sourceMessageId === 'm3')?.disposition).toBe('auto-saved');
  });

  it('auto-saves stable specialist behavior into Persistent Agent Memory', () => {
    const message = agentMessage('m4', 'I prefer explicit bounded contexts and I prioritize clear service ownership when I evaluate architecture.');
    const currentRoom = room([message]);
    queueMemoryCandidate(currentRoom, message, 'company-default', round);
    consolidateRoundMemory(currentRoom, { ...round, roundStage: 'complete' });

    const memory = loadWorkspaceSuite().agentMemories.find(entry => entry.sourceMessageId === 'm4');
    expect(memory?.agentId).toBe('agent-emma');
    expect(memory?.category).toBe('preference');
  });

  it('sends medium-confidence candidates to Memory Center review instead of auto-saving', () => {
    const message = agentMessage('m5', 'What evidence is still missing before we settle the retry budget for the next release?');
    const currentRoom = room([message]);
    queueMemoryCandidate(currentRoom, message, 'company-default', round);
    const result = consolidateRoundMemory(currentRoom, { ...round, roundStage: 'complete' });

    expect(result.autoSaved).toBe(0);
    expect(result.reviewQueued).toBe(1);
    expect(loadMemoryV2().suggestions.some(suggestion => suggestion.sourceMessageId === 'm5' && suggestion.status === 'pending')).toBe(true);
  });

  it('blocks auto-save when a high-score candidate may conflict with active memory', () => {
    addSharedMemory({
      scope: 'project',
      companyId: 'company-default',
      projectId: 'project-atoms',
      category: 'constraint',
      title: 'API compatibility policy',
      content: 'API contracts must remain backward compatible across services and releases.',
      status: 'active',
      importance: 'high',
    });
    const message = agentMessage('m6', 'For this project, API contracts must not remain backward compatible across services; breaking changes are allowed.');
    const currentRoom = room([message]);
    const candidate = queueMemoryCandidate(currentRoom, message, 'company-default', round);

    expect(candidate?.potentialConflict).toBe(true);
    const result = consolidateRoundMemory(currentRoom, { ...round, roundStage: 'complete' });
    expect(result.autoSaved).toBe(0);
    expect(result.reviewQueued).toBe(1);
  });

  it('processes each source message only once', () => {
    const message = agentMessage('m7', 'For this project, all deployment changes must have an explicit rollback procedure.');
    const currentRoom = room([message]);
    queueMemoryCandidate(currentRoom, message, 'company-default', round);
    queueMemoryCandidate(currentRoom, message, 'company-default', round);

    expect(loadMemoryIntelligence().candidates.filter(candidate => candidate.sourceMessageId === 'm7')).toHaveLength(1);
  });
});
