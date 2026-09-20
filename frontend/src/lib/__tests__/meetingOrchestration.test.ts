import { beforeEach, describe, expect, it } from 'vitest';
import {
  ensureMeetingRoom,
  getExternalAgentChat,
  loadMeetingOrchestration,
  markSpeakerStatus,
  setExternalAgentChat,
  setMeetingPhase,
  setMeetingRound,
} from '@/lib/meetingOrchestration';

describe('meeting orchestration', () => {
  beforeEach(() => localStorage.clear());

  it('puts Olivia first and initializes four rounds', () => {
    const meeting = ensureMeetingRoom('room-a', ['agent-emma', 'agent-olivia', 'agent-mike']);
    expect(meeting.speakerOrder[0]).toBe('agent-olivia');
    expect(meeting.rounds).toHaveLength(4);
    expect(meeting.phase).toBe('open');
    expect(meeting.activeSpeakerId).toBe('agent-olivia');
  });

  it('advances the active speaker after a response and resets queue on a new round', () => {
    ensureMeetingRoom('room-a', ['agent-olivia', 'agent-emma']);
    markSpeakerStatus('room-a', 'agent-olivia', 'responded');
    expect(loadMeetingOrchestration().rooms['room-a']?.activeSpeakerId).toBe('agent-emma');
    expect(loadMeetingOrchestration().rooms['room-a']?.speakerStatus['agent-olivia']).toBe('responded');

    setMeetingRound('room-a', 1);
    const next = loadMeetingOrchestration().rooms['room-a'];
    expect(next?.roundIndex).toBe(1);
    expect(next?.speakerStatus['agent-olivia']).toBe('waiting');
    expect(next?.activeSpeakerId).toBe('agent-olivia');
  });

  it('tracks meeting phase and external chat links', () => {
    ensureMeetingRoom('room-a', ['agent-olivia']);
    setMeetingPhase('room-a', 'challenge');
    setExternalAgentChat('agent-olivia', 'ChatGPT', 'https://chatgpt.com/c/example');

    expect(loadMeetingOrchestration().rooms['room-a']?.phase).toBe('challenge');
    expect(getExternalAgentChat('agent-olivia')?.provider).toBe('ChatGPT');
  });
});
