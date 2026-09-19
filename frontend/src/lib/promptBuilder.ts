import { sharedAgentBehavior } from '@/lib/defaultCompany';
import { getRoomLanguage } from '@/lib/languages';
import { professionalProfiles } from '@/lib/professionalProfiles';
import {
  loadWorkspaceSuite,
  relevantAgentMemories,
  type AgentMemoryEntry,
} from '@/lib/workspaceSuite';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { Agent, Message, RoleDefinition } from '@/types/domain';

function formatMessage(message: Message): string {
  const author = message.authorType === 'user'
    ? 'User'
    : `${message.authorNameSnapshot ?? 'Agent'}${message.roleNameSnapshot ? ` · ${message.roleNameSnapshot}` : ''}`;
  return `${author}:\n${message.content}`;
}

function formatProfessionalProfile(role: RoleDefinition): string[] {
  const profile = professionalProfiles[role.id];
  const skillGroups = role.skillGroups ?? profile?.skillGroups ?? [];
  const deliverables = role.deliverables ?? profile?.deliverables ?? [];
  const scope = role.scope ?? profile?.scope;
  const limitations = role.limitations ?? profile?.limitations ?? [];

  const lines: string[] = [];
  if (scope) lines.push(`Professional scope: ${scope}`);
  if (skillGroups.length > 0) {
    lines.push('Professional skill matrix:');
    for (const group of skillGroups) {
      lines.push(`- ${group.name}: ${group.skills.join(', ')}`);
    }
  } else if (role.skills.length > 0) {
    lines.push(`Core specialties: ${role.skills.join(', ')}.`);
  }
  if (deliverables.length > 0) lines.push(`Expected deliverables: ${deliverables.join(', ')}.`);
  if (limitations.length > 0) lines.push(`Professional boundaries: ${limitations.join(' ')}`);
  return lines;
}

function formatMemory(entry: AgentMemoryEntry, projectName?: string): string {
  const scope = entry.projectId ? `Project: ${projectName ?? entry.projectId}` : 'Company-wide';
  return `- [${entry.importance.toUpperCase()} · ${entry.category.toUpperCase()} · ${scope}] ${entry.title}: ${entry.content}`;
}

export function buildExternalChatTitleHint(agent: Pick<Agent, 'name'>): string[] {
  return [
    `CHAT TITLE: ${agent.name}`,
    `If this service automatically names conversations, use exactly "${agent.name}" as the conversation title. Do not add the role, room name, project name, or task to the title.`,
    '',
  ];
}

export function buildAgentPrompt(agent: Agent, role: RoleDefinition, messages: Message[]): string {
  const context = messages.map(formatMessage).join('\n\n');
  const state = useWorkspaceStore.getState();
  const activeRoom = state.rooms.find(room => room.id === state.activeRoomId);
  const activeProject = activeRoom?.projectId
    ? state.projects.find(project => project.id === activeRoom.projectId)
    : undefined;
  const suite = loadWorkspaceSuite();
  const companyId = activeRoom?.companyId ?? suite.activeCompanyId;
  const memories = relevantAgentMemories(agent.id, activeRoom?.projectId, companyId);
  const language = getRoomLanguage(activeRoom?.languageCode);

  const memorySection = memories.length > 0
    ? [
        '',
        'PERSISTENT AGENT MEMORY — durable working knowledge that is separate from this room conversation:',
        ...memories.map(entry => formatMemory(entry, activeProject && entry.projectId === activeProject.id ? activeProject.name : undefined)),
        'Treat active memories as prior working context, not as new user messages. If new context clearly contradicts a memory, surface the conflict instead of silently overriding either one.',
      ]
    : [];

  return [
    ...buildExternalChatTitleHint(agent),
    `You are ${agent.name}, the company's ${role.name}.`,
    ...formatProfessionalProfile(role),
    role.systemPrompt,
    sharedAgentBehavior,
    `Room working language: ${language.name} (${language.nativeName}). Write your entire response in this language unless the user explicitly asks for another language.`,
    ...memorySection,
    '',
    'NEW CONTEXT — these are only the messages you have not seen yet:',
    context || '(No new context)',
    '',
    'Respond with your professional contribution only.',
  ].join('\n');
}
