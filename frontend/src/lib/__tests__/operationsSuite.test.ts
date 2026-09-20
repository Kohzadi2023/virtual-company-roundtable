import { beforeEach, describe, expect, it } from 'vitest';
import {
  addActionDependency,
  addAssumption,
  addDecisionDependency,
  addDeliverable,
  addDeliverableVersion,
  addIdea,
  addQuestion,
  addRisk,
  createRoomSnapshot,
  loadOperationsSuite,
  mergeIdeas,
  setKanbanStatus,
} from '@/lib/operationsSuite';
import type { Room } from '@/types/domain';

describe('operations suite', () => {
  beforeEach(() => localStorage.clear());

  it('stores project registers independently', () => {
    addAssumption({ projectId: 'project-a', statement: 'Users prefer manual AI handoffs', evidence: 'Interview notes', confidence: 'medium', status: 'open' });
    addRisk({ projectId: 'project-a', description: 'Context can grow too large', probability: 'medium', impact: 'high', mitigation: 'Use smart compact mode', status: 'open' });
    addQuestion({ projectId: 'project-a', question: 'Should project memory move to SQLite?', status: 'open' });

    const state = loadOperationsSuite();
    expect(state.assumptions).toHaveLength(1);
    expect(state.risks[0]?.impact).toBe('high');
    expect(state.questions[0]?.status).toBe('open');
  });

  it('versions deliverables and tracks execution dependencies', () => {
    const id = addDeliverable({ projectId: 'project-a', type: 'ADR', title: 'Persistence ADR', content: '# v1' });
    expect(id).toBeTruthy();
    if (id) addDeliverableVersion(id, '# v2');
    addDecisionDependency('decision-b', 'decision-a');
    addActionDependency('action-b', 'action-a');
    setKanbanStatus('action-b', 'blocked');

    const state = loadOperationsSuite();
    expect(state.deliverables[0]?.versions).toHaveLength(2);
    expect(state.decisionDependencies).toHaveLength(1);
    expect(state.actionDependencies).toHaveLength(1);
    expect(state.actionKanban['action-b']).toBe('blocked');
  });

  it('merges ideas while preserving the source and snapshots rooms', () => {
    const source = addIdea({ projectId: 'project-a', title: 'Idea A', description: 'First', status: 'raw' });
    const target = addIdea({ projectId: 'project-a', title: 'Idea B', description: 'Primary', status: 'promising' });
    expect(source).toBeTruthy();
    expect(target).toBeTruthy();
    if (source && target) mergeIdeas([source], target);

    const room: Room = { id: 'room-a', name: 'Room A', emoji: '🏢', agentIds: [], messages: [], createdAt: 1 };
    createRoomSnapshot(room, 'Before change');

    const state = loadOperationsSuite();
    expect(state.ideas.find(item => item.id === source)?.mergedIntoId).toBe(target);
    expect(state.roomSnapshots[0]?.name).toBe('Before change');
    expect(state.roomSnapshots[0]?.room.id).toBe('room-a');
  });
});
