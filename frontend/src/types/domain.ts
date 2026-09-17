export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  skills: string[];
  systemPrompt: string;
  builtIn: boolean;
  createdAt: number;
}

export interface Agent {
  id: string;
  name: string;
  roleId: string;
  emoji: string;
  color: string;
  /** Local/static URL for built-ins, or an optional user-provided URL for custom employees. */
  avatarUrl?: string;
  createdAt: number;
}

export interface TeamDefinition {
  id: string;
  name: string;
  description: string;
  emoji: string;
  agentIds: string[];
  builtIn: boolean;
  createdAt: number;
}

export interface Message {
  id: string;
  authorType: 'user' | 'agent';
  authorId?: string;
  /** Preserve identity in the timeline even if an agent is later removed. */
  authorNameSnapshot?: string;
  roleNameSnapshot?: string;
  content: string;
  createdAt: number;
}

export interface Room {
  id: string;
  name: string;
  emoji: string;
  agentIds: string[];
  messages: Message[];
  createdAt: number;
}

export interface AgentContextState {
  lastCopiedMessageId: string | null;
  lastCopiedAt: number | null;
  copiedAt: number | null;
}

export interface StorageSnapshot {
  version: 4;
  rooms: Room[];
  roles: RoleDefinition[];
  agents: Agent[];
  teams: TeamDefinition[];
  agentContext: Record<string, AgentContextState>;
  activeRoomId: string | null;
  savedAt: number;
}
