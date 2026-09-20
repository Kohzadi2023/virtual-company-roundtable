import { beforeEach, describe, expect, it } from 'vitest';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import {
  ensureMeetingRoom,
  getExternalAgentChat,
  inferExternalChatProvider,
  loadMeetingOrchestration,
  markSpeakerStatus,
  resetCurrentRound,
  restartMeeting,
  setExternalAgentChat,
  setMeetingPhase,
  setMeetingRound,
  startNextRound,
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
    expect(loadMeetingOrchestration().rooms['room-a']?.phase).toBe('collect');
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

  it('stops on round complete after Olivia synthesis instead of restarting the queue', () => {
    ensureMeetingRoom('room-a', [OLIVIA, EMMA, MIKE]);
    markSpeakerStatus('room-a', OLIVIA, 'responded');
    markSpeakerStatus('room-a', EMMA, 'responded');
    markSpeakerStatus('room-a', MIKE, 'responded');
    markSpeakerStatus('room-a', OLIVIA, 'responded');

    const completed = loadMeetingOrchestration().rooms['room-a'];
    expect(completed?.roundIndex).toBe(0);
    expect(completed?.phase).toBe('collect');
    expect(completed?.roundStage).toBe('complete');
    expect(completed?.activeSpeakerId).toBeUndefined();
    expect(completed?.speakerStatus[EMMA]).toBe('responded');
    expect(completed?.speakerStatus[MIKE]).toBe('responded');
  });

  it('starts the next round only on explicit request and begins with Olivia', () => {
    ensureMeetingRoom('room-a', [OLIVIA, EMMA, MIKE]);
    markSpeakerStatus('room-a', OLIVIA, 'responded');
    markSpeakerStatus('room-a', EMMA, 'responded');
    markSpeakerStatus('room-a', MIKE, 'responded');
    markSpeakerStatus('room-a', OLIVIA, 'responded');

    expect(startNextRound('room-a')).toBe(true);
    const next = loadMeetingOrchestration().rooms['room-a'];
    expect(next?.roundIndex).toBe(1);
    expect(next?.phase).toBe('challenge');
    expect(next?.roundStage).toBe('opening');
    expect(next?.activeSpeakerId).toBe(OLIVIA);
    expect(next?.speakerStatus[OLIVIA]).toBe('waiting');
    expect(next?.speakerStatus[EMMA]).toBe('waiting');
    expect(next?.speakerStatus[MIKE]).toBe('waiting');
  });

  it('does not start a next round before the current round is complete', () => {
    ensureMeetingRoom('room-a', [OLIVIA, EMMA]);
    expect(startNextRound('room-a')).toBe(false);
    expect(loadMeetingOrchestration().rooms['room-a']?.roundIndex).toBe(0);
  });

  it('keeps Olivia next when a specialist response is pasted before the opening turn', () => {
    ensureMeetingRoom('room-a', [OLIVIA, EMMA]);
    markSpeakerStatus('room-a', EMMA, 'responded');

    const state = loadMeetingOrchestration().rooms['room-a'];
    expect(state?.roundStage).toBe('opening');
    expect(state?.activeSpeakerId).toBe(OLIVIA);
  });

  it('resets the queue and synchronizes the phase when a round is selected manually', () => {
    ensureMeetingRoom('room-a', [OLIVIA, EMMA]);
    markSpeakerStatus('room-a', OLIVIA, 'responded');

    setMeetingRound('room-a', 1);
    const next = loadMeetingOrchestration().rooms['room-a'];
    expect(next?.roundIndex).toBe(1);
    expect(next?.phase).toBe('challenge');
    expect(next?.roundStage).toBe('opening');
    expect(next?.speakerStatus[OLIVIA]).toBe('waiting');
    expect(next?.activeSpeakerId).toBe(OLIVIA);
  });

  it('resets the current completed round and makes Olivia next again', () => {
    ensureMeetingRoom('room-a', [OLIVIA, EMMA]);
    setMeetingRound('room-a', 3);
    markSpeakerStatus('room-a', OLIVIA, 'responded');
    markSpeakerStatus('room-a', EMMA, 'responded');
    markSpeakerStatus('room-a', OLIVIA, 'responded');
    expect(loadMeetingOrchestration().rooms['room-a']?.roundStage).toBe('complete');

    resetCurrentRound('room-a');
    const reset = loadMeetingOrchestration().rooms['room-a'];
    expect(reset?.roundIndex).toBe(3);
    expect(reset?.phase).toBe('decision');
    expect(reset?.roundStage).toBe('opening');
    expect(reset?.activeSpeakerId).toBe(OLIVIA);
    expect(reset?.speakerStatus[OLIVIA]).toBe('waiting');
    expect(reset?.speakerStatus[EMMA]).toBe('waiting');
  });

  it('restarts the whole meeting at round one without changing the round definitions', () => {
    ensureMeetingRoom('room-a', [OLIVIA, EMMA, MIKE]);
    setMeetingPhase('room-a', 'closed');
    setMeetingRound('room-a', 2);
    const before = loadMeetingOrchestration().rooms['room-a'];

    restartMeeting('room-a');
    const restarted = loadMeetingOrchestration().rooms['room-a'];
    expect(restarted?.phase).toBe('open');
    expect(restarted?.roundIndex).toBe(0);
    expect(restarted?.roundStage).toBe('opening');
    expect(restarted?.activeSpeakerId).toBe(OLIVIA);
    expect(restarted?.speakerStatus[OLIVIA]).toBe('waiting');
    expect(restarted?.speakerStatus[EMMA]).toBe('waiting');
    expect(restarted?.speakerStatus[MIKE]).toBe('waiting');
    expect(restarted?.rounds).toEqual(before?.rounds);
    expect(restarted?.startedAt).toBeUndefined();
    expect(restarted?.closedAt).toBeUndefined();
  });

  it('infers supported external chat providers directly from conversation URLs', () => {
    const cases = [
      ['https://chatgpt.com/c/example', 'ChatGPT'],
      ['https://chat.openai.com/c/example', 'ChatGPT'],
      ['https://gemini.google.com/app/example', 'Gemini'],
      ['https://claude.ai/chat/example', 'Claude'],
      ['https://copilot.microsoft.com/chats/example', 'Copilot'],
      ['https://chat.deepseek.com/a/chat/s/example', 'DeepSeek'],
      ['https://chat.qwen.ai/c/example', 'Qwen'],
      ['https://grok.com/c/example', 'Grok'],
      ['https://x.com/i/grok?conversation=example', 'Grok'],
      ['https://www.meta.ai/chat/example', 'META'],
      ['https://example.com/chat/example', 'Other'],
    ] as const;

    for (const [url, provider] of cases) expect(inferExternalChatProvider(url)).toBe(provider);
  });

  it('stores the detected provider without a manual provider argument', () => {
    ensureMeetingRoom('room-a', [OLIVIA, EMMA]);
    setMeetingPhase('room-a', 'challenge');
    setExternalAgentChat(OLIVIA, 'https://chatgpt.com/c/example');
    setExternalAgentChat(EMMA, 'https://chat.deepseek.com/');

    expect(loadMeetingOrchestration().rooms['room-a']?.phase).toBe('challenge');
    expect(getExternalAgentChat(OLIVIA)?.provider).toBe('ChatGPT');
    expect(getExternalAgentChat(EMMA)?.provider).toBe('DeepSeek');
  });
});
