export interface SkillGroup {
  name: string;
  skills: string[];
}

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  skills: string[];
  /** Enterprise-grade grouped capabilities for built-in specialists. */
  skillGroups?: SkillGroup[];
  /** Typical concrete outputs this specialist should produce. */
  deliverables?: string[];
  /** What this role is expected to own or advise on. */
  scope?: string;
  /** Explicit boundaries, especially for regulated/high-stakes roles. */
  limitations?: string[];
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

export interface ProjectDefinition {
  id: string;
  name: string;
  description: string;
  emoji: string;
  createdAt: number;
}

export type DecisionStatus = 'proposed' | 'approved' | 'reversed';

export interface DecisionRecord {
  id: string;
  projectId: string;
  roomId?: string | undefined;
  title: string;
  details: string;
  evidence?: string | undefined;
  status: DecisionStatus;
  createdAt: number;
  updatedAt: number;
}

export type ActionItemStatus = 'todo' | 'in-progress' | 'done';
export type ActionItemPriority = 'low' | 'medium' | 'high';

export interface ActionItem {
  id: string;
  projectId: string;
  roomId?: string | undefined;
  title: string;
  owner?: string | undefined;
  deadline?: string | undefined;
  evidence?: string | undefined;
  status: ActionItemStatus;
  priority: ActionItemPriority;
  createdAt: number;
  updatedAt: number;
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

export interface SavedMeetingMinutes {
  /** Final Markdown pasted back from the manual AI workflow. */
  content: string;
  /** Last local edit/save time. */
  savedAt: number;
  /** Number of room messages represented when this version was saved. */
  sourceMessageCount: number;
  /** Room language at the time this version was saved. */
  languageCode: string;
  source: 'manual-ai';
}

export interface Room {
  id: string;
  name: string;
  emoji: string;
  /** Project/workspace this room belongs to. Legacy rooms are assigned to General. */
  projectId?: string;
  /** Preferred working language for this room. Legacy rooms default to English. */
  languageCode?: string;
  /** Effective membership used by chat and agent selection. */
  agentIds: string[];
  /** Teams explicitly attached to this room. Optional for legacy v4 snapshots. */
  teamIds?: string[];
  /** Specialists explicitly added outside team membership. Optional for legacy v4 snapshots. */
  individualAgentIds?: string[];
  /** Persisted final minutes from the manual copy/paste workflow. */
  meetingMinutes?: SavedMeetingMinutes;
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
  /** Optional for snapshots created before Projects were introduced. */
  projects?: ProjectDefinition[];
  /** Optional for snapshots created before Decision Register was introduced. */
  decisions?: DecisionRecord[];
  /** Optional for snapshots created before Action Items were introduced. */
  actionItems?: ActionItem[];
  agentContext: Record<string, AgentContextState>;
  activeRoomId: string | null;
  savedAt: number;
}
