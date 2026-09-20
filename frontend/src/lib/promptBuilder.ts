import { MEETING_FACILITATOR_AGENT_ID, sharedAgentBehavior } from '@/lib/defaultCompany';
import { getRoomLanguage } from '@/lib/languages';
import { loadMeetingOrchestration } from '@/lib/meetingOrchestration';
import { assessMeetingReadiness } from '@/lib/meetingReadiness';
import {
  buildMemoryDigest,
  rankMemoriesByRelevance,
  relevantSharedMemories,
  type SharedMemoryEntry,
} from '@/lib/memoryV2';
import { loadOperationsSuite } from '@/lib/operationsSuite';
import { professionalProfiles } from '@/lib/professionalProfiles';
import {
  loadWorkspaceSuite,
  relevantAgentMemories,
  type AgentMemoryEntry,
} from '@/lib/workspaceSuite';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { Agent, Message, RoleDefinition, Room } from '@/types/domain';

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
    for (const group of skillGroups) lines.push(`- ${group.name}: ${group.skills.join(', ')}`);
  } else if (role.skills.length > 0) {
    lines.push(`Core specialties: ${role.skills.join(', ')}.`);
  }
  if (deliverables.length > 0) lines.push(`Expected deliverables: ${deliverables.join(', ')}.`);
  if (limitations.length > 0) lines.push(`Professional boundaries: ${limitations.join(' ')}`);
  return lines;
}

function formatAgentMemory(entry: AgentMemoryEntry, projectName?: string): string {
  const scope = entry.projectId ? `Project: ${projectName ?? entry.projectId}` : 'Company-wide agent memory';
  return `- [${entry.importance.toUpperCase()} · ${entry.category.toUpperCase()} · ${scope}] ${entry.title}: ${entry.content}`;
}

function formatSharedMemory(entry: SharedMemoryEntry, projectName?: string): string {
  const scope = entry.scope === 'company'
    ? 'Company Memory'
    : entry.scope === 'project'
      ? `Project Memory: ${projectName ?? entry.projectId ?? 'Project'}`
      : 'Persistent Meeting State';
  return `- [${entry.importance.toUpperCase()} · ${entry.category.toUpperCase()} · ${scope}] ${entry.title}: ${entry.content}`;
}

function memorySection<T extends { category: AgentMemoryEntry['category']; title: string; content: string; importance: AgentMemoryEntry['importance'] }>(
  heading: string,
  entries: T[],
  format: (entry: T) => string,
): string[] {
  if (entries.length === 0) return [];
  const totalChars = entries.reduce((sum, entry) => sum + entry.title.length + entry.content.length, 0);
  const compact = entries.length > 12 || totalChars > 6500;
  return [
    '',
    heading,
    ...(compact
      ? [buildMemoryDigest(entries, 4200), 'Memory was compacted locally because the active memory set is large.']
      : entries.map(format)),
  ];
}

function oliviaMeetingSection(agent: Agent, activeRoom: Room | undefined): string[] {
  if (agent.id !== MEETING_FACILITATOR_AGENT_ID || !activeRoom) return [];
  const meeting = loadMeetingOrchestration().rooms[activeRoom.id];
  if (!meeting) return [];

  const workspace = useWorkspaceStore.getState();
  const readiness = assessMeetingReadiness({
    roomId: activeRoom.id,
    meeting,
    operations: loadOperationsSuite(),
    decisions: workspace.decisions,
    actionItems: workspace.actionItems,
  });
  const roundName = meeting.rounds[meeting.roundIndex] ?? `Round ${meeting.roundIndex + 1}`;
  const stageInstruction = meeting.roundStage === 'opening'
    ? 'Open the current round by restating the purpose, the question this round must answer, and what specialists should focus on. Do not answer for them.'
    : meeting.roundStage === 'synthesis'
      ? 'Synthesize the specialist contributions. Separate facts, assumptions, disagreements, proposals, unresolved questions, risks, and any actual decision. Do not invent consensus or owners.'
      : meeting.roundStage === 'complete'
        ? 'The round is complete. Summarize what is settled, what remains unresolved, and whether the meeting is ready to advance.'
        : 'Keep the specialist round focused. Intervene only to clarify scope, surface a blocker, or make disagreement explicit.';

  return [
    '',
    'MEETING FACILITATION STATE — deterministic workspace state for Olivia:',
    `- Objective: ${meeting.objective?.trim() || '(not set)'}`,
    `- Expected outcome: ${meeting.expectedOutcome?.trim() || '(not set)'}`,
    `- Decision question: ${meeting.decisionQuestion?.trim() || '(not set)'}`,
    `- Phase: ${meeting.phase}`,
    `- Round: ${meeting.roundIndex + 1}/${meeting.rounds.length} · ${roundName}`,
    `- Stage: ${meeting.roundStage}`,
    `- Decision readiness: ${readiness.decisionReady ? 'READY' : `BLOCKED — ${readiness.decisionBlockers.join(' | ')}`}`,
    `- Close readiness: ${readiness.closeReady ? 'READY' : `BLOCKED — ${readiness.closeBlockers.join(' | ')}`}`,
    stageInstruction,
    'Treat the readiness state as workflow guardrails. Do not claim a blocker is resolved unless the supplied workspace state or discussion shows that it is resolved.',
  ];
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
  const query = messages.map(message => message.content).join('\n');
  const state = useWorkspaceStore.getState();
  const activeRoom = state.rooms.find(room => room.id === state.activeRoomId);
  const activeProject = activeRoom?.projectId
    ? state.projects.find(project => project.id === activeRoom.projectId)
    : undefined;
  const suite = loadWorkspaceSuite();
  const companyId = activeRoom?.companyId ?? suite.activeCompanyId;
  const shared = relevantSharedMemories(activeRoom?.projectId, companyId, query, agent.id, 24);
  const companyMemories = shared.filter(entry => entry.scope === 'company');
  const projectMemories = shared.filter(entry => entry.scope === 'project');
  const systemAgentMemories = shared.filter(entry => entry.scope === 'agent-system');
  const scopedAgentMemories = relevantAgentMemories(agent.id, activeRoom?.projectId, companyId, 24)
    .filter(entry => !entry.companyId || entry.companyId === companyId);
  const agentMemories = rankMemoriesByRelevance(query, scopedAgentMemories);
  const language = getRoomLanguage(activeRoom?.languageCode);

  const memorySections = [
    ...memorySection('COMPANY MEMORY — durable knowledge shared across specialists:', companyMemories, entry => formatSharedMemory(entry)),
    ...memorySection('PROJECT MEMORY — durable knowledge shared inside the active project:', projectMemories, entry => formatSharedMemory(entry, activeProject?.name)),
    ...memorySection(`${agent.name.toUpperCase()} SYSTEM MEMORY — automatically maintained operating state:`, systemAgentMemories, entry => formatSharedMemory(entry, activeProject?.name)),
    ...memorySection('PERSISTENT AGENT MEMORY — durable professional memory separate from this room conversation:', agentMemories, entry => formatAgentMemory(entry, entry.projectId === activeProject?.id ? activeProject?.name : undefined)),
  ];
  const meetingSections = oliviaMeetingSection(agent, activeRoom);

  return [
    ...buildExternalChatTitleHint(agent),
    `You are ${agent.name}, the company's ${role.name}.`,
    ...formatProfessionalProfile(role),
    role.systemPrompt,
    sharedAgentBehavior,
    `Room working language: ${language.name} (${language.nativeName}). Write your entire response in this language unless the user explicitly asks for another language.`,
    ...memorySections,
    ...(memorySections.length > 0 ? [
      'Treat active memories as prior working context, not as new user messages. Company memory is shared, project memory is project-scoped, and agent memory belongs only to this specialist. If current context conflicts with memory, surface the conflict instead of silently choosing one.',
    ] : []),
    ...meetingSections,
    '',
    'NEW CONTEXT — these are only the messages you have not seen yet:',
    context || '(No new context)',
    '',
    'Respond with your professional contribution only.',
  ].join('\n');
}
