import { beforeEach, describe, expect, it } from 'vitest';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import {
  ensureMeetingRoom,
  MEETING_ORCHESTRATION_EVENT,
} from '@/lib/meetingOrchestration';

const OLIVIA = MEETING_FACILITATOR_AGENT_ID;
const EMMA = 'agent-emma';
const MIKE = 'agent-mike';

describe('ensureMeetingRoom idempotency', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('does not rewrite or dispatch when the persisted meeting is already synchronized', () => {
    let events = 0;
    const onMeetingChange = () => { events += 1; };
    window.addEventListener(MEETING_ORCHESTRATION_EVENT, onMeetingChange);

    try {
      const first = ensureMeetingRoom('room-a', [EMMA, OLIVIA]);
      expect(events).toBe(1);

      const second = ensureMeetingRoom('room-a', [EMMA, OLIVIA]);
      expect(second.updatedAt).toBe(first.updatedAt);
      expect(second).toEqual(first);
      expect(events).toBe(1);

      const changed = ensureMeetingRoom('room-a', [EMMA, OLIVIA, MIKE]);
      expect(changed.speakerOrder).toContain(MIKE);
      expect(changed.speakerStatus[MIKE]).toBe('waiting');
      expect(events).toBe(2);
    } finally {
      window.removeEventListener(MEETING_ORCHESTRATION_EVENT, onMeetingChange);
    }
  });
});
