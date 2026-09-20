import { beforeEach, describe, expect, it } from 'vitest';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import {
  ensureMeetingRoom,
  loadMeetingOrchestration,
  restartMeeting,
  setMeetingBrief,
} from '@/lib/meetingOrchestration';

describe('meeting brief', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('persists the objective, expected outcome and decision question across a restart', () => {
    ensureMeetingRoom('room-a', [MEETING_FACILITATOR_AGENT_ID, 'agent-emma']);
    setMeetingBrief('room-a', {
      objective: 'Choose the persistence architecture.',
      expectedOutcome: 'An approved architecture decision and owned follow-up actions.',
      decisionQuestion: 'Should the desktop workspace use the unified v4 snapshot as the canonical persistence envelope?',
    });

    restartMeeting('room-a');
    const meeting = loadMeetingOrchestration().rooms['room-a'];

    expect(meeting?.objective).toBe('Choose the persistence architecture.');
    expect(meeting?.expectedOutcome).toContain('approved architecture decision');
    expect(meeting?.decisionQuestion).toContain('unified v4 snapshot');
    expect(meeting?.phase).toBe('open');
    expect(meeting?.roundIndex).toBe(0);
  });
});
