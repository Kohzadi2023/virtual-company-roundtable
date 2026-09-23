import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import {
  applyOliviaMeetingBrief,
  backfillMeetingBriefFromMessages,
  parseOliviaMeetingBrief,
} from '@/lib/meetingBriefAutomation';
import {
  ensureMeetingRoom,
  loadMeetingOrchestration,
  setMeetingBrief,
} from '@/lib/meetingOrchestration';

describe('Olivia meeting brief automation', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('parses a structured VC_MEETING_BRIEF block', () => {
    const brief = parseOliviaMeetingBrief(`Opening guidance.\n\nVC_MEETING_BRIEF\n\`\`\`json\n{\n  "objective": "Choose the safe production path.",\n  "expectedOutcome": "A prioritized plan with owners and controls.",\n  "decisionQuestion": "Can live execution be enabled now?",\n  "needsClarification": false,\n  "clarificationQuestion": ""\n}\n\`\`\``);

    expect(brief).toEqual({
      objective: 'Choose the safe production path.',
      expectedOutcome: 'A prioritized plan with owners and controls.',
      decisionQuestion: 'Can live execution be enabled now?',
    });
  });

  it('backfills the legacy Genesisco-style brief even when labels have no colons', () => {
    ensureMeetingRoom('room-a', [MEETING_FACILITATOR_AGENT_ID, 'agent-emma']);
    const applied = backfillMeetingBriefFromMessages('room-a', [{
      authorType: 'agent',
      authorId: MEETING_FACILITATOR_AGENT_ID,
      content: `Objective Determine the safe path from the current parked staging state to production-ready live execution for Genesisco.\n\nExpected Outcome A concrete prioritized plan for closing the remaining production execution gates, with explicit decisions, owners, and safety controls.\n\nDecision Question Can Genesisco proceed toward live execution and activation of real provider credentials (#14) now? If not, which prerequisites must be completed first?`,
    }]);

    const meeting = loadMeetingOrchestration().rooms['room-a'];
    expect(applied).toBe(true);
    expect(meeting?.objective).toContain('safe path');
    expect(meeting?.expectedOutcome).toContain('prioritized plan');
    expect(meeting?.decisionQuestion).toContain('#14');
  });

  it('does not auto-apply a brief when Olivia explicitly requires clarification', () => {
    ensureMeetingRoom('room-a', [MEETING_FACILITATOR_AGENT_ID]);
    const applied = applyOliviaMeetingBrief('room-a', {
      objective: 'Provisional objective',
      expectedOutcome: 'Provisional outcome',
      decisionQuestion: 'Which direction should we choose?',
      needsClarification: true,
      clarificationQuestion: 'Which product is in scope?',
    });

    const meeting = loadMeetingOrchestration().rooms['room-a'];
    expect(applied).toBe(false);
    expect(meeting?.objective).toBeUndefined();
  });

  it('fills only missing fields and preserves an explicit existing brief field', () => {
    ensureMeetingRoom('room-a', [MEETING_FACILITATOR_AGENT_ID]);
    setMeetingBrief('room-a', { objective: 'User-approved objective.' });

    const applied = applyOliviaMeetingBrief('room-a', {
      objective: 'AI replacement objective',
      expectedOutcome: 'AI inferred outcome',
      decisionQuestion: 'AI inferred question?',
    });

    const meeting = loadMeetingOrchestration().rooms['room-a'];
    expect(applied).toBe(true);
    expect(meeting?.objective).toBe('User-approved objective.');
    expect(meeting?.expectedOutcome).toBe('AI inferred outcome');
    expect(meeting?.decisionQuestion).toBe('AI inferred question?');
  });

  it('compacts the canonical snapshot and retries when applying the brief hits localStorage quota', () => {
    ensureMeetingRoom('room-a', [MEETING_FACILITATOR_AGENT_ID]);
    localStorage.setItem('ai-team-chat:snapshot:v4', JSON.stringify({
      version: 4,
      rooms: [],
      extensions: {
        version: 1,
        memoryV2: { large: 'x'.repeat(2_000) },
        meetingOrchestration: { rooms: { 'room-a': { roundIndex: 0 } } },
      },
      savedAt: 1,
    }));

    const originalSetItem = Storage.prototype.setItem;
    let meetingWriteAttempts = 0;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key: string, value: string) {
      if (key === 'virtual-company:meeting-orchestration:v1') {
        meetingWriteAttempts += 1;
        if (meetingWriteAttempts === 1) {
          throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
        }
      }
      return originalSetItem.call(this, key, value);
    });

    const applied = applyOliviaMeetingBrief('room-a', {
      objective: 'Choose the safe production path.',
      expectedOutcome: 'A prioritized plan with owners and controls.',
      decisionQuestion: 'Can live execution be enabled now?',
    });

    const meeting = loadMeetingOrchestration().rooms['room-a'];
    const compactSnapshot = JSON.parse(localStorage.getItem('ai-team-chat:snapshot:v4') ?? '{}') as Record<string, unknown>;

    expect(applied).toBe(true);
    expect(meetingWriteAttempts).toBe(2);
    expect(meeting?.objective).toBe('Choose the safe production path.');
    expect(compactSnapshot.extensions).toBeUndefined();
  });
});
