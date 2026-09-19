export interface SkillGroup {
  name: string;
  skills: string[];
}

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  skills: string[];
  skillGroups?: SkillGroup[];
  deliverables?: string[];
  scope?: string;
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
  companyId?: string | undefined;
  favorite?: boolean | undefined;
  tags?: string[] | undefined;
  lastOpenedAt?: number | undefined;
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

export type MessageReaction = 'agree' | 'disagree' | 'risk' | 'accepted' | 'important';

export interface MessageRevision {
  content: string;
  savedAt: number;
}

export interface Message {
  id: string;
  authorType: 'user' | 'agent';
  authorId?: string | undefined;
  authorNameSnapshot?: string | undefined;
  roleNameSnapshot?: string | undefined;
  content: string;
  pinned?: boolean | undefined;
  tags?: string[] | undefined;
  reaction?: MessageReaction | undefined;
  versions?: MessageRevision[] | undefined;
  branchRoomId?: string | undefined;
  createdAt: number;
}

export interface MeetingMinutesRevision {
  content: string;
  savedAt: number;
  sourceMessageCount: number;
}

export interface SavedMeetingMinutes {
  content: string;
  savedAt: number;
  sourceMessageCount: number;
  languageCode: string;
  source: 'manual-ai';
  versions?: MeetingMinutesRevision[] | undefined;
}

export interface RoomKnowledgePack {
  objective: string;
  background: string;
  constraints: string;
  requirements: string;
  links: string;
}

export interface RoomAttachment {
  id: string;
  name: string;
  mediaType: string;
  size: number;
  dataUrl: string;
  addedAt: number;
}

export type VoteChoice = 'agree' | 'concern' | 'disagree' | 'abstain';

export interface RoomVote {
  id: string;
  question: string;
  votes: Record<string, VoteChoice>;
  createdAt: number;
}

export interface Room {
  id: string;
  name: string;
  emoji: string;
  projectId?: string | undefined;
  companyId?: string | undefined;
  languageCode?: string | undefined;
  agentIds: string[];
  teamIds?: string[] | undefined;
  individualAgentIds?: string[] | undefined;
  meetingMinutes?: SavedMeetingMinutes | undefined;
  tags?: string[] | undefined;
  favorite?: boolean | undefined;
  archivedAt?: number | undefined;
  lastOpenedAt?: number | undefined;
  agenda?: string[] | undefined;
  knowledge?: RoomKnowledgePack | undefined;
  attachments?: RoomAttachment[] | undefined;
  votes?: RoomVote[] | undefined;
  branchOfRoomId?: string | undefined;
  branchRootMessageId?: string | undefined;
  templateId?: string | undefined;
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
  projects?: ProjectDefinition[] | undefined;
  decisions?: DecisionRecord[] | undefined;
  actionItems?: ActionItem[] | undefined;
  agentContext: Record<string, AgentContextState>;
  activeRoomId: string | null;
  savedAt: number;
}
