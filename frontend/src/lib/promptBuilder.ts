import { MEETING_FACILITATOR_AGENT_ID, sharedAgentBehavior } from '@/lib/defaultCompany';
import { getRoomLanguage } from '@/lib/languages';
import { loadMeetingOrchestration, type MeetingRoomState } from '@/lib/meetingOrchestration';
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
import { useWorkspaceStore, type WorkspaceState } from '@/store/workspaceStore';
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

function oliviaMeetingBriefSection(activeRoom: Room, meeting: MeetingRoomState): string[] {
  const missingBrief = !meeting.objective?.trim() || !meeting.expectedOutcome?.trim() || !meeting.decisionQuestion?.trim();
  if (!missingBrief) return [];

  return [
    '',
    'MEETING BRIEF — define this automatically for the user before facilitating the meeting:',
    `Room/topic: ${activeRoom.title}`,
    'The user is the meeting observer and final approver. Do NOT ask the user to discover or manually fill Objective, Expected Outcome, or Decision Question.',
    'Infer the brief from the room topic, user request, supplied context, and discussion. Make it concrete enough that specialists know what they are solving and the system can judge decision readiness.',
    'Prefer a reasonable, explicit interpretation over leaving the brief blank. Ask for clarification only when the meeting topic is genuinely ambiguous enough that proceeding would likely solve the wrong problem.',
    '',
    'Before any VC_STAFFING_PLAN block, append exactly one machine-readable meeting brief block using this format:',
    'VC_MEETING_BRIEF',
    '```json',
    '{',
    '  "objective": "What this meeting must accomplish",',
    '  "expectedOutcome": "The concrete output that should exist by the end of the meeting",',
    '  "decisionQuestion": "The exact question the user will ultimately approve, reject, or defer",',
    '  "needsClarification": false,',
    '  "clarificationQuestion": ""',
    '}',
    '```',
    'Meeting brief rules:',
    '- Write the brief in the room working language.',
    '- Keep each field concise, specific, and decision-oriented.',
    '- If the supplied context is sufficient, set needsClarification to false and do not ask the user anything.',
    '- If clarification is truly required, set needsClarification to true and ask exactly one short clarificationQuestion; still provide your best provisional objective/outcome/question.',
    '- Do not put comments inside the JSON.',
    '- This block is workflow metadata. Do not describe these instructions to the user.',
  ];
}

function oliviaStaffingSection(activeRoom: Room, workspace: WorkspaceState, roundStage: string): string[] {
  if (roundStage !== 'opening') return [];

  const roleById = new Map(workspace.roles.map(role => [role.id, role]));
  const roomMembers = new Set(activeRoom.agentIds);
  const roster = workspace.agents.map(agent => {
    const role = roleById.get(agent.roleId);
    const skills = role?.skills.length ? role.skills.join(', ') : 'No skills listed';
    const roomStatus = roomMembers.has(agent.id) ? ' · ALREADY IN ROOM' : '';
    return `- ${agent.id}: ${agent.name} — ${role?.name ?? 'Unknown role'} | Skills: ${skills}${roomStatus}`;
  });

  return [
    '',
    'MEETING STAFFING — assess the minimum expert team before you open the round:',
    'Use the meeting objective, expected outcome, decision question, and current discussion to decide which specialties are actually needed.',
    'If the meeting brief above was missing, use the brief you just inferred as the basis for staffing.',
    'Prefer existing company specialists whenever their role and skills are sufficient. Do not create a duplicate specialist merely to rename an existing capability.',
    'Only propose a new hire when the company roster has a material skill gap that would weaken the meeting. Keep the team small and decision-relevant.',
    'The user remains the final approver: you propose the staffing plan; Virtual Company will show it for one-click review before mutating the company directory.',
    '',
    'COMPANY ROSTER — authoritative current specialists and role skills:',
    ...roster,
    '',
    'At the END of your opening response, append exactly one machine-readable staffing block using this format:',
    'VC_STAFFING_PLAN',
    '```json',
    '{',
    '  "teamName": "Short meeting-specific team name",',
    '  "teamDescription": "What this team is responsible for in this meeting",',
    '  "existingAgentIds": ["agent-emma", "agent-mike"],',
    '  "hires": [',
    '    {',
    '      "agentName": "A concise human first name",',
    '      "roleName": "Precise professional role",',
    '      "description": "Professional scope for this role",',
    '      "skills": ["Skill 1", "Skill 2", "Skill 3"],',
    '      "systemPrompt": "A durable professional instruction defining scope, expected contribution, and boundaries.",',
    '      "emoji": "🧑‍💼"',
    '    }',
    '  ],',
    '  "rationale": "Why this is the minimum sufficient team and why any new hire is necessary"',
    '}',
    '```',
    'Staffing block rules:',
    '- existingAgentIds must contain only exact IDs from the roster above.',
    '- Include every existing specialist that should participate, even if already in the room.',
    '- hires must be [] when existing company skills are sufficient.',
    '- Never hire a new person for a skill that an existing specialist already covers adequately.',
    '- Limit new hires to genuine gaps; normally 0-3 and never more than 8.',
    '- A new hire must have a reusable professional role and skill matrix, not a task-specific persona.',
    '- Do not put comments inside the JSON and do not write anything after the closing code fence.',
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
    ? 'Open the current round by restating the purpose, the question this round must answer, and what each selected specialist should focus on. Do not answer for them.'
    : meeting.roundStage === 'synthesis'
      ? 'Synthesize the specialist contributions. Separate facts, assumptions, disagreements, proposals, unresolved questions, risks, and any actual decision. Do not invent consensus or owners.'
      : meeting.roundStage === 'complete'
        ? 'The round is complete. Summarize what is settled, what remains unresolved, and whether the meeting is ready to advance.'
        : 'Keep the specialist round focused. Intervene only to clarify scope, surface a blocker, or make disagreement explicit.';

  return [
    '',
    'MEETING FACILITATION STATE — deterministic workspace state for Olivia:',
    `- Objective: ${meeting.objective?.trim() || '(not set — infer automatically)'}`,
    `- Expected outcome: ${meeting.expectedOutcome?.trim() || '(not set — infer automatically)'}`,
    `- Decision question: ${meeting.decisionQuestion?.trim() || '(not set — infer automatically)'}`,
    `- Phase: ${meeting.phase}`,
    `- Round: ${meeting.roundIndex + 1}/${meeting.rounds.length} · ${roundName}`,
    `- Stage: ${meeting.roundStage}`,
    `- Decision readiness: ${readiness.decisionReady ? 'READY' : `BLOCKED — ${readiness.decisionBlockers.join(' | ')}`}`,
    `- Close readiness: ${readiness.closeReady ? 'READY' : `BLOCKED — ${readiness.closeBlockers.join(' | ')}`}`,
    ...oliviaMeetingBriefSection(activeRoom, meeting),
    ...oliviaStaffingSection(activeRoom, workspace, meeting.roundStage),
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