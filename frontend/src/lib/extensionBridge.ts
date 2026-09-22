import { allExternalAgentChats } from '@/lib/meetingOrchestration';

export const EXTENSION_RESPONSE_EVENT = 'virtual-company:extension-response';

export interface ExtensionResponsePayload {
  chatUrl: string;
  content: string;
  capturedAt: number;
}

export interface ExtensionResponseEvent extends CustomEvent<ExtensionResponsePayload> {
  detail: ExtensionResponsePayload;
}

/**
 * The companion browser extension (see /extension) delivers a captured AI
 * chat response by dispatching this event on the app's own page — it never
 * touches app state directly. Dispatch is the extension's contract; this
 * helper exists so tests (and, in principle, any other integration) can
 * trigger the same path without the extension being installed.
 */
export function dispatchExtensionResponse(payload: ExtensionResponsePayload): void {
  window.dispatchEvent(new CustomEvent(EXTENSION_RESPONSE_EVENT, { detail: payload }));
}

/**
 * Resolves which agent (if any) a captured chat URL belongs to, by matching
 * it against the per-agent external chat links already stored for meeting
 * orchestration. Only an exact URL match counts — a near-miss (e.g. a new
 * ChatGPT conversation id) should not silently overwrite an unrelated
 * agent's response box.
 */
export function agentIdForExtensionChatUrl(chatUrl: string): string | undefined {
  return allExternalAgentChats().find(chat => chat.url === chatUrl)?.agentId;
}
