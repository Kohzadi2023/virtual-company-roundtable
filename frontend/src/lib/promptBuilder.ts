import { MEETING_FACILITATOR_AGENT_ID, sharedAgentBehavior } from '@/lib/defaultCompany';
import { getRoomLanguage } from '@/lib/languages';
import { ensureMeetingRoom, hasMeetingStarted, type MeetingRoomState } from '@/lib/meetingOrchestration';
import { assessMeetingReadiness } from '@/lib/meetingReadiness';
import { getSpecialistRoundGuidance } from '@/lib/meetingRoundGuidance';
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

function xmlSection(tag: string, lines: string[]): string[] {
  if (lines.length === 0) return [];
  return ['', `<${tag}>`, ...lines, `</${tag}>`];
}

function oliviaMeetingBriefInstructions(activeRoom: Room, meeting: MeetingRoomState): string[] {
  const missingBrief = !meeting.objective?.trim() || !meeting.expectedOutcome?.trim() || !meeting.decisionQuestion?.trim();
  if (!missingBrief) return [];

  return xmlSection('MEETING_BRIEF_INSTRUCTIONS', [
    `Define the meeting brief automatically for the user before facilitating "${activeRoom.name}" — it is currently missing.`,
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
  ]);
}

function isOliviaAloneInRoom(activeRoom: Room): boolean {
  return activeRoom.agentIds.every(id => id === MEETING_FACILITATOR_AGENT_ID);
}

function oliviaSoloBootstrapPreamble(): string[] {
  return [
    '',
    'YOU ARE CURRENTLY THE ONLY PARTICIPANT IN THIS MEETING.',
    'Your first responsibility this turn is NOT to answer the meeting question yourself.',
    'Your responsibility is to determine which existing people, agents, or teams must participate for this meeting to reach a reliable decision or outcome, then assemble that team before any specialist discussion begins.',
    'Do not attempt to solve the meeting topic in this response. Focus this response on team assembly.',
  ];
}

const MAX_ROSTER_ACTIVE_ROOMS_LISTED = 3;

export interface MeetingStaffingRosterEntry {
  id: string;
  name: string;
  role: string;
  skills: string[];
  responsibilities: string[];
  boundaries: string[];
  teams: Array<{ id: string; name: string }>;
  /**
   * A workload signal only — NOT availability, ownership, authority, or a
   * current task assignment. Counts rooms other than the one this prompt is
   * being built for (a room's own facilitator is trivially "in" it, so
   * including that room would make every agent look busier than they are).
   */
  workload: {
    activeRoomCount: number;
    activeRoomTitles?: string[];
  };
  alreadyInRoom: boolean;
}

function dedupeStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/**
 * Real, current per-agent context for Olivia to match capabilities against —
 * not just a name and a skill list.
 *
 * "Responsibilities" and "boundaries" come from RoleDefinition
 * (scope/deliverables/description and limitations) since there's no
 * separate field for either. "Teams" is derived by looking up which
 * TeamDefinition(s) list this agent, since Agent itself doesn't carry a team
 * reference — an agent can be on more than one team. There is no "current
 * ownership" or "availability" field anywhere in the domain model:
 * ActionItem.owner is a free-text string, not an agent id, so it can't be
 * matched reliably to a specific agent. Room membership across the
 * workspace is used instead only as what it actually is — a count of how
 * many other rooms this agent is currently active in — never relabeled as
 * ownership or availability.
 */
function buildRosterEntry(agent: Agent, workspace: WorkspaceState, activeRoom: Room): MeetingStaffingRosterEntry {
  const role = workspace.roles.find(item => item.id === agent.roleId);
  const teams = workspace.teams
    .filter(team => team.agentIds.includes(agent.id))
    .map(team => ({ id: team.id, name: team.name }));
  const otherRooms = workspace.rooms.filter(room => room.id !== activeRoom.id && room.agentIds.includes(agent.id));
  const activeRoomTitles = otherRooms.slice(0, MAX_ROSTER_ACTIVE_ROOMS_LISTED).map(room => room.name);

  return {
    id: agent.id,
    name: agent.name,
    role: role?.name ?? 'Unknown role',
    skills: role?.skills.length ? role.skills : [],
    responsibilities: dedupeStrings([role?.scope, ...(role?.deliverables ?? []), role?.description]),
    boundaries: role?.limitations?.length ? role.limitations : [],
    teams,
    workload: {
      activeRoomCount: otherRooms.length,
      ...(activeRoomTitles.length > 0 ? { activeRoomTitles } : {}),
    },
    alreadyInRoom: activeRoom.agentIds.includes(agent.id),
  };
}

function formatRosterEntry(entry: MeetingStaffingRosterEntry): string {
  const skills = entry.skills.length ? entry.skills.join(', ') : 'No skills listed';
  const responsibilities = entry.responsibilities.length ? entry.responsibilities.join('; ') : 'Not specified';
  const boundaries = entry.boundaries.length ? entry.boundaries.join('; ') : 'None specified';
  const teamNames = entry.teams.length ? entry.teams.map(team => team.name).join(', ') : 'Unassigned';
  const { activeRoomCount, activeRoomTitles } = entry.workload;
  const workload = activeRoomCount > 0
    ? `activeRoomCount: ${activeRoomCount} (${(activeRoomTitles ?? []).join(', ')}${activeRoomCount > (activeRoomTitles?.length ?? 0) ? ', …' : ''})`
    : 'activeRoomCount: 0';
  const roomStatus = entry.alreadyInRoom ? ' · ALREADY IN ROOM' : '';

  return `- ${entry.id}: ${entry.name} — ${entry.role}`
    + ` | Skills: ${skills}`
    + ` | Responsibilities: ${responsibilities}`
    + ` | Boundaries: ${boundaries}`
    + ` | Teams: ${teamNames}`
    + ` | ${workload}${roomStatus}`;
}

function buildAvailableRoster(activeRoom: Room, workspace: WorkspaceState, meeting: MeetingRoomState): string[] {
  if (meeting.roundStage !== 'opening' || hasMeetingStarted(meeting)) return [];
  const roster = workspace.agents.map(agent => formatRosterEntry(buildRosterEntry(agent, workspace, activeRoom)));
  return xmlSection('AVAILABLE_ORGANIZATION_ROSTER', roster);
}

function buildCurrentParticipants(activeRoom: Room, workspace: WorkspaceState): string[] {
  const roleById = new Map(workspace.roles.map(role => [role.id, role]));
  const lines = activeRoom.agentIds.flatMap(agentId => {
    const agent = workspace.agents.find(item => item.id === agentId);
    if (!agent) return [];
    const role = roleById.get(agent.roleId);
    return [`- ${agent.id}: ${agent.name} — ${role?.name ?? 'Unknown role'}`];
  });
  return xmlSection('CURRENT_PARTICIPANTS', lines.length > 0 ? lines : ['(none)']);
}

function buildStaffingRules(activeRoom: Room, meeting: MeetingRoomState): string[] {
  if (meeting.roundStage !== 'opening' || hasMeetingStarted(meeting)) return [];
  const solo = isOliviaAloneInRoom(activeRoom);

  return xmlSection('MEETING_STAFFING_RULES', [
    ...(solo ? oliviaSoloBootstrapPreamble() : []),
    '',
    'Assess the minimum expert team before you open the round.',
    'Use MEETING_CONTEXT and the current discussion to decide which specialties are actually needed.',
    'If the objective/expected outcome/decision question in MEETING_CONTEXT were missing, use the brief you just inferred in MEETING_BRIEF_INSTRUCTIONS as the basis for staffing.',
    'Prefer existing company specialists whenever their role and skills are sufficient. Do not create a duplicate specialist merely to rename an existing capability.',
    'Only propose a new hire when AVAILABLE_ORGANIZATION_ROSTER has a material skill gap that would weaken the meeting. Keep the team small and decision-relevant.',
    'For every participant and every hire, give a short reason and the expected contribution — a specific decision, evidence, or deliverable, not a generic "provides input".',
    'A capability gap only exists when an essential area of expertise is missing, no existing person or agent legitimately owns it, and the meeting cannot safely reach its objective without it. Do not invite someone only because they are senior or generally important.',
    'The user remains the final approver: you propose the staffing plan; Virtual Company will show it for one-click review before mutating the company directory.',
    '',
    'WORKLOAD SIGNAL',
    'activeRoomCount in AVAILABLE_ORGANIZATION_ROSTER is how many OTHER active meeting rooms that participant currently belongs to. It is only a workload signal.',
    'Do NOT interpret it as: availability, ownership, authority, or a current task assignment. A busy specialist (high activeRoomCount) can still be the right choice — it is context for you and the user, never a disqualifier, and activeRoomCount: 0 does not mean the person is "available".',
    '',
    'Match each required capability against AVAILABLE_ORGANIZATION_ROSTER before deciding anything:',
    '- A need this roster already covers → add that person/agent as a participant. Do not hire for it.',
    '- A need no existing person or agent legitimately owns → propose an AI specialist hire (type "ai-agent" or "temporary-specialist").',
    '- A need that genuinely requires a real person (legal standing, an external vendor relationship, physical presence, anything an AI cannot legitimately do) → do NOT invent an agent for it. Mark it as a "human" or "contractor" hire; it becomes a blocker, not a fabricated participant.',
    '',
    'At the END of your opening response, append exactly one machine-readable staffing block using this format:',
    'VC_STAFFING_PLAN',
    '```json',
    '{',
    '  "teamName": "Short meeting-specific team name",',
    '  "teamDescription": "What this team is responsible for in this meeting",',
    '  "participants": [',
    '    {',
    '      "agentId": "agent-emma",',
    '      "priority": "required",',
    '      "reason": "Why this specific person is needed for this meeting",',
    '      "expectedContribution": "The decision, evidence, or deliverable expected from them"',
    '    }',
    '  ],',
    '  "hires": [',
    '    {',
    '      "agentName": "A concise human first name",',
    '      "roleName": "Precise professional role",',
    '      "description": "Professional scope for this role",',
    '      "skills": ["Skill 1", "Skill 2", "Skill 3"],',
    '      "systemPrompt": "A durable professional instruction defining scope, expected contribution, and boundaries.",',
    '      "emoji": "🧑‍💼",',
    '      "priority": "required",',
    '      "type": "ai-agent",',
    '      "reason": "Why this capability is missing and why no existing participant can cover it",',
    '      "expectedContribution": "The decision, evidence, or deliverable expected from them"',
    '    }',
    '  ],',
    '  "readiness": "TEAM_READY",',
    '  "rationale": "Why this is the minimum sufficient team and why any new hire is necessary"',
    '}',
    '```',
    'Staffing block rules:',
    '- participants[].agentId must be an exact ID from the roster above. Include every existing specialist that should participate, even if already in the room.',
    '- priority is "required" when the meeting cannot reliably reach its outcome without them, "optional" when they would materially help but are not essential.',
    '- hires must be [] when existing company skills are sufficient.',
    '- Never hire a new person for a skill that an existing specialist already covers adequately.',
    '- Limit new hires to genuine gaps; normally 0-3 and never more than 8.',
    '- A new hire must have a reusable professional role and skill matrix, not a task-specific persona.',
    '- type is "ai-agent" (default) or "temporary-specialist" for a capability you can create yourself as an AI teammate; use "human" or "contractor" ONLY when the work genuinely requires a real person (e.g. legal sign-off, an external vendor relationship) — never invent an existing employee or fabricate expertise, and never use "human"/"contractor" as a way to avoid defining a normal AI specialist.',
    '- readiness is exactly one of TEAM_READY (no unresolved gap), STAFFING_ACTION_REQUIRED (a "human"/"contractor" hire is still needed, or an AI hire awaits the user\'s one-click approval), or INSUFFICIENT_CONTEXT (you cannot determine the required team from what you have — say what is missing in rationale).',
    '- Do not put comments inside the JSON and do not write anything after the closing code fence.',
  ]);
}

function oliviaMeetingSection(agent: Agent, activeRoom: Room | undefined): string[] {
  if (agent.id !== MEETING_FACILITATOR_AGENT_ID || !activeRoom) return [];
  // Must not depend on some other component (MeetingOrchestrationBar) having
  // already called ensureMeetingRoom as a side effect of rendering — that
  // silently dropped this entire section (no facilitation, no staffing, no
  // error) whenever a prompt was built through any path that got here first.
  // ensureMeetingRoom is idempotent, so calling it here makes this section
  // self-sufficient instead of a passive, easy-to-break dependency.
  const meeting = ensureMeetingRoom(activeRoom.id, activeRoom.agentIds);

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
    ...xmlSection('MEETING_CONTEXT', [
      `Title: ${activeRoom.name}`,
      `Objective: ${meeting.objective?.trim() || '(not set — infer automatically)'}`,
      `Expected outcome: ${meeting.expectedOutcome?.trim() || '(not set — infer automatically)'}`,
      `Decision question: ${meeting.decisionQuestion?.trim() || '(not set — infer automatically)'}`,
      `Phase: ${meeting.phase}`,
      `Round: ${meeting.roundIndex + 1}/${meeting.rounds.length} · ${roundName}`,
      `Stage: ${meeting.roundStage}`,
      `Decision readiness: ${readiness.decisionReady ? 'READY' : `BLOCKED — ${readiness.decisionBlockers.join(' | ')}`}`,
      `Close readiness: ${readiness.closeReady ? 'READY' : `BLOCKED — ${readiness.closeBlockers.join(' | ')}`}`,
    ]),
    ...oliviaMeetingBriefInstructions(activeRoom, meeting),
    ...buildCurrentParticipants(activeRoom, workspace),
    ...buildAvailableRoster(activeRoom, workspace, meeting),
    ...buildStaffingRules(activeRoom, meeting),
    ...xmlSection('MEETING_FACILITATION_INSTRUCTIONS', [
      stageInstruction,
      'Treat the readiness state in MEETING_CONTEXT as workflow guardrails. Do not claim a blocker is resolved unless the supplied workspace state or discussion shows that it is resolved.',
    ]),
  ];
}

function specialistMeetingSection(agent: Agent, activeRoom: Room | undefined): string[] {
  if (!activeRoom || agent.id === MEETING_FACILITATOR_AGENT_ID) return [];

  const meeting = ensureMeetingRoom(activeRoom.id, activeRoom.agentIds);
  const workspace = useWorkspaceStore.getState();
  const roundName = meeting.rounds[meeting.roundIndex] ?? `Round ${meeting.roundIndex + 1}`;
  const guidance = getSpecialistRoundGuidance(meeting);
  const activeSpeaker = meeting.activeSpeakerId
    ? workspace.agents.find(item => item.id === meeting.activeSpeakerId)
    : undefined;

  const turnInstruction = meeting.roundStage === 'opening'
    ? 'Olivia is still opening this round. Do not act as the facilitator or claim that the specialist queue has started. If the user asks you to prepare, prepare specifically for the round task below.'
    : meeting.roundStage === 'specialists'
      ? meeting.activeSpeakerId === agent.id
        ? 'You are the current specialist speaker. Give this round contribution now and keep it within your professional scope.'
        : `The current specialist speaker is ${activeSpeaker?.name ?? 'another specialist'}. If the user explicitly invokes you out of sequence, contribute to the same round task but do not claim that it is your scheduled turn.`
      : meeting.roundStage === 'synthesis'
        ? 'Normal specialist turns for this round are complete and Olivia is synthesizing. If explicitly invoked, provide only a concise correction or clarification grounded in your specialty; do not restart the round.'
        : 'This round is complete. If explicitly invoked, provide only a correction or newly discovered material fact; do not reopen settled discussion without new evidence.';

  return xmlSection('MEETING_ROUND_INSTRUCTIONS', [
    `Meeting: ${activeRoom.name}`,
    `Objective: ${meeting.objective?.trim() || '(not set)'}`,
    `Expected outcome: ${meeting.expectedOutcome?.trim() || '(not set)'}`,
    `Decision question: ${meeting.decisionQuestion?.trim() || '(not set)'}`,
    `Phase: ${meeting.phase}`,
    `Round: ${meeting.roundIndex + 1}/${meeting.rounds.length} · ${roundName}`,
    `Stage: ${meeting.roundStage}`,
    `Current speaker: ${activeSpeaker?.name ?? '(none)'}`,
    `Round purpose: ${guidance.purpose}`,
    `Your task this round: ${guidance.instruction}`,
    turnInstruction,
    'Use the prior discussion as evidence and context. Address relevant earlier claims directly instead of producing a generic standalone answer.',
    'Stay inside your professional scope and boundaries. Surface cross-functional dependencies, but do not impersonate or replace another specialist.',
  ]);
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
  const meetingSections = [
    ...oliviaMeetingSection(agent, activeRoom),
    ...specialistMeetingSection(agent, activeRoom),
  ];

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
