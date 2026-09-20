import { beforeEach, describe, expect, it } from 'vitest';
import { getExternalAgentChat, setExternalAgentChat } from '@/lib/meetingOrchestration';

const EMMA = 'agent-emma';

describe('external chat removal', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('removes a previously saved external chat when an empty URL is persisted', () => {
    setExternalAgentChat(EMMA, 'https://chatgpt.com/c/example');
    expect(getExternalAgentChat(EMMA)?.url).toBe('https://chatgpt.com/c/example');

    setExternalAgentChat(EMMA, '');
    expect(getExternalAgentChat(EMMA)).toBeUndefined();
  });
});
