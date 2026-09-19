export const OPEN_AGENT_MEMORY_EVENT = 'virtual-company:open-agent-memory';

export interface OpenAgentMemoryDetail {
  agentId?: string;
  sourceRoomId?: string;
  sourceMessageId?: string;
  suggestedTitle?: string;
  suggestedContent?: string;
}

export function openAgentMemory(detail: OpenAgentMemoryDetail = {}): void {
  window.dispatchEvent(new CustomEvent<OpenAgentMemoryDetail>(OPEN_AGENT_MEMORY_EVENT, { detail }));
}
