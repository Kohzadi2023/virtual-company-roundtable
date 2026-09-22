import { beforeEach, describe, expect, it } from 'vitest';
import {
  agentIdForExtensionChatUrl,
  dispatchExtensionResponse,
  EXTENSION_RESPONSE_EVENT,
  type ExtensionResponseEvent,
} from '@/lib/extensionBridge';
import { setExternalAgentChat } from '@/lib/meetingOrchestration';

describe('extensionBridge', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('resolves the agent whose stored chat link exactly matches the captured URL', () => {
    setExternalAgentChat('agent-emma', 'https://chatgpt.com/c/example-emma');
    setExternalAgentChat('agent-mike', 'https://gemini.google.com/app/example-mike');

    expect(agentIdForExtensionChatUrl('https://chatgpt.com/c/example-emma')).toBe('agent-emma');
    expect(agentIdForExtensionChatUrl('https://gemini.google.com/app/example-mike')).toBe('agent-mike');
  });

  it('does not match a similar but different URL (e.g. a different conversation id)', () => {
    setExternalAgentChat('agent-emma', 'https://chatgpt.com/c/example-emma');

    expect(agentIdForExtensionChatUrl('https://chatgpt.com/c/some-other-chat')).toBeUndefined();
  });

  it('returns undefined when no agent has a matching chat link', () => {
    expect(agentIdForExtensionChatUrl('https://chatgpt.com/c/unregistered')).toBeUndefined();
  });

  it('dispatchExtensionResponse fires a window event other code can listen for', () => {
    let received: ExtensionResponseEvent['detail'] | null = null;
    const listener = (event: Event) => {
      received = (event as ExtensionResponseEvent).detail;
    };
    window.addEventListener(EXTENSION_RESPONSE_EVENT, listener);

    dispatchExtensionResponse({ chatUrl: 'https://chatgpt.com/c/example', content: 'Captured reply.', capturedAt: 123 });

    expect(received).toEqual({ chatUrl: 'https://chatgpt.com/c/example', content: 'Captured reply.', capturedAt: 123 });
    window.removeEventListener(EXTENSION_RESPONSE_EVENT, listener);
  });
});
