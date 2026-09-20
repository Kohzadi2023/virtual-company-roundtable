import { describe, expect, it } from 'vitest';
import { assessMeetingReadiness } from '@/lib/meetingReadiness';
import type { MeetingRoomState } from '@/lib/meetingOrchestration';
import type { OperationsSuiteState } from '@/lib/operationsSuite';

function meeting(overrides: Partial<MeetingRoomState> = {}): MeetingRoomState {
  return {
    roomId: 'room-a',
    phase: 'decision',
    rounds: ['Initial opinions', 'Critique', 'Revised proposals', 'Final decision'],
    roundIndex: 3,
    roundStage: 'complete',
    speakerOrder: ['agent-olivia', 'agent-emma'],
    speakerStatus: { 'agent-olivia': 'responded', 'agent-emma': 'responded' },
    objective: 'Choose an architecture.',
    expectedOutcome: 'Approved decision with owned actions.',
    decisionQuestion: 'Which persistence architecture should we adopt?',
    updatedAt: 1,
    ...overrides,
  };
}

function operations(overrides: Partial<OperationsSuiteState> = {}): OperationsSuiteState {
  return {
    version: 1,
    assumptions: [],
    risks: [],
    questions: [],
    ideas: [],
    deliverables: [],
    decisionDependencies: [],
    actionDependencies: [],
    actionKanban: {},
    roomSnapshots: [],
    reviewRequests: [],
    timers: {},
    dismissedNotifications: [],
    ...overrides,
  };
}

describe('meeting readiness', () => {
  it('blocks decision when the brief is incomplete or room questions remain open', () => {
    const result = assessMeetingReadiness({
      roomId: 'room-a',
      meeting: meeting({ decisionQuestion: '' }),
      operations: operations({
        questions: [{
          id: 'question-1',
          projectId: 'project-a',
          roomId: 'room-a',
          question: 'What is the recovery target?',
          status: 'open',
          createdAt: 1,
          updatedAt: 1,
        }],
      }),
      decisions: [],
      actionItems: [],
    });

    expect(result.decisionReady).toBe(false);
    expect(result.decisionBlockers).toContain('Decision question is missing.');
    expect(result.openQuestionCount).toBe(1);
  });

  it('allows decision when the brief is complete and no critical blockers remain', () => {
    const result = assessMeetingReadiness({
      roomId: 'room-a',
      meeting: meeting(),
      operations: operations(),
      decisions: [],
      actionItems: [],
    });

    expect(result.decisionReady).toBe(true);
    expect(result.closeReady).toBe(false);
    expect(result.closeBlockers).toContain('No approved decision is recorded for this meeting.');
  });

  it('allows close only after an approved decision exists and open actions have owners', () => {
    const result = assessMeetingReadiness({
      roomId: 'room-a',
      meeting: meeting(),
      operations: operations(),
      decisions: [{
        id: 'decision-1',
        projectId: 'project-a',
        roomId: 'room-a',
        title: 'Canonical persistence envelope',
        details: 'Use the unified v4 snapshot.',
        status: 'approved',
        createdAt: 1,
        updatedAt: 1,
      }],
      actionItems: [{
        id: 'action-1',
        projectId: 'project-a',
        roomId: 'room-a',
        sourceDecisionId: 'decision-1',
        title: 'Verify restore migration.',
        owner: 'Nina',
        status: 'todo',
        priority: 'high',
        createdAt: 1,
        updatedAt: 1,
      }],
    });

    expect(result.decisionReady).toBe(true);
    expect(result.closeReady).toBe(true);
    expect(result.approvedDecisionCount).toBe(1);
    expect(result.unownedOpenActionCount).toBe(0);
  });
});
