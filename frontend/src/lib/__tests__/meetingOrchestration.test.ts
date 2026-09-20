import { beforeEach, describe, expect, it } from 'vitest';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import {
  ensureMeetingRoom,
  getExternalAgentChat,
  loadMeetingOrchestration,
  markSpeakerStatus,
  setExternalAgentChat,
  setMeetingPhase,
  setMeetingRound,
} from '@/lib/meetingOrchestration';

const OLIVIA = MEETING_FACILITATOR_AGENT_ID;
const EMMA = 'agent-emma';
const MIKE = 'agent-mike';

describe('meeting orchestration', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('puts Olivia first and initializes four rounds', () => {
    const meeting = ensureMeetingRoom('room-a', [EMMA, OLIVIA, MIKE]);
    expect(meeting.speakerOrder[0]).toBe(OLIVIA);
    expect(meeting.rounds).toHaveLength(4);
    expect(meeting.phase).toBe('open');
    expect(meeting.roundStage).toBe('opening');
    expect(meeting.activeSpeakerId).toBe(OLIVIA);
  });

  it('routes the completed specialist round back to Olivia for synthesis', () => {
    ensureMeetingRoom('room-a', [OLIVIA, EMMA, MIKE]);

    markSpeakerStatus('room-a', OLIVIA, 'responded');
    expect(loadMeetingOrchestration().rooms['room-a']?.roundStage).toBe('specialists');
    expect(loadMeetingOrchestration().rooms['room-a']?.activeSpeakerId).toBe(EMMA);

    markSpeakerStatus('room-a', EMMA, 'responded');
    expect(loadMeetingOrchestration().rooms['room-a']?.activeSpeakerId).toBe(MIKE);

    markSpeakerStatus('room-a', MIKE, 'responded');
    const synthesis = loadMeetingOrchestration().rooms['room-a'];
    expect(synthesis?.roundStage).toBe('synthesis');
    expect(synthesis?.activeSpeakerId).toBe(OLIVIA);
    expect(synthesis?.speakerStatus[OLIVIA]).toBe('waiting');
  });

  it('uses Olivia synthesis to open the next round without a second consecutive Olivia turn', () => {
    ensureMeetingRoom('room-a', [OLIVIA, EMMA, MIKE]);
    markSpeakerStatus('room-a', OLIVIA, 'responded');
    markSpeakerStatus('room-a', EMMA, 'responded');
    markSpeakerStatus('room-a', MIKE, 'responded');
    markSpeakerStatus('room-a', OLIVIA, 'responded');

    const next = loadMeetingOrchestration().rooms['room-a'];
    expect(next?.roundIndex).toBe(1);
    expect(next?.roundStage).toBe('specialists');
    expect(next?.activeSpeakerId).toBe(EMMA);
    expect(next?.speakerStatus[OLIVIA]).toBe('responded');
    expect(next?.speakerStatus[EMMA]).toBe('waiting');
    expect(next?.speakerStatus[MIKE]).toBe('waiting');
  });

  it('keeps Olivia next when a specialist response is pasted before the opening turn', () => {
    ensureMeetingRoom('room-a', [OLIVIA, EMMA]);
    markSpeakerStatus('room-a', EMMA, 'responded');

    const state = loadMeetingOrchestration().rooms['room-a'];
    expect(state?.roundStage).toBe('opening');
    expect(state?.activeSpeakerId).toBe(OLIVIA);
  });

  it('resets the queue when a round is selected manually', () => {
    ensureMeetingRoom('room-a', [OLIVIA, EMMA]);
    markSpeakerStatus('room-a', OLIVIA, 'responded');

    setMeetingRound('room-a', 1);
    const next = loadMeetingOrchestration().rooms['room-a'];
    expect(next?.roundIndex).toBe(1);
    expect(next?.roundStage).toBe('opening');
    expect(next?.speakerStatus[OLIVIA]).toBe('waiting');
    expect(next?.activeSpeakerId).toBe(OLIVIA);
  });

  it('tracks meeting phase and expanded external chat providers', () => {
    ensureMeetingRoom('room-a', [OLIVIA, EMMA]);
    setMeetingPhase('room-a', 'challenge');
    setExternalAgentChat(OLIVIA, 'ChatGPT', 'https://chatgpt.com/c/example');
    setExternalAgentChat(EMMA, 'DeepSeek', 'https://chat.deepseek.com/');

    expect(loadMeetingOrchestration().rooms['room-a']?.phase).toBe('challenge');
    expect(getExternalAgentChat(OLIVIA)?.provider).toBe('ChatGPT');
    expect(getExternalAgentChat(EMMA)?.provider).toBe('DeepSeek');
  });
});
