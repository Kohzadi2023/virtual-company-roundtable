import { beforeEach, describe, expect, it } from 'vitest';
import { defaultAgents, defaultRoles, defaultTeams } from '@/lib/defaultCompany';
import {
  applyOliviaStaffingPlan,
  deriveStaffingReadiness,
  findLatestOliviaStaffingPlan,
  isOliviaStaffingPlanApplied,
  parseOliviaStaffingPlan,
} from '@/lib/meetingStaffing';
import { useWorkspaceStore } from '@/store/workspaceStore';

const staffingResponse = `I recommend a focused architecture review team.\n\nVC_STAFFING_PLAN\n\`\`\`json\n{
  "teamName": "Offline Sync Review",
  "teamDescription": "Architecture, risk, and mobile conflict review.",
  "participants": [
    { "agentId": "agent-emma", "priority": "required", "reason": "Owns architecture direction.", "expectedContribution": "Target persistence architecture." },
    { "agentId": "agent-mike", "priority": "optional", "reason": "Can challenge the proposal.", "expectedContribution": "Risk review." }
  ],
  "hires": [
    {
      "agentName": "Iris",
      "roleName": "Mobile Sync Specialist",
      "description": "Owns offline-first mobile synchronization and conflict semantics.",
      "skills": ["Offline-first", "Conflict Resolution", "Mobile Storage"],
      "systemPrompt": "Respond as the mobile sync specialist. Focus on offline queues, reconciliation, idempotency, and multi-device conflicts.",
      "emoji": "📱",
      "priority": "required",
      "type": "ai-agent",
      "reason": "No existing specialist owns offline mobile sync.",
      "expectedContribution": "Conflict-resolution design for the sync engine."
    }
  ],
  "readiness": "STAFFING_ACTION_REQUIRED",
  "rationale": "Emma and Mike cover architecture and challenge; mobile sync is the missing specialist capability."
}\n\`\`\``;

const legacyStaffingResponse = `Recommendation.\n\nVC_STAFFING_PLAN\n\`\`\`json\n{
  "teamName": "Legacy Format Team",
  "existingAgentIds": ["agent-emma"],
  "hires": []
}\n\`\`\``;

const staffingResponseWithHumanHire = `Recommendation.\n\nVC_STAFFING_PLAN\n\`\`\`json\n{
  "teamName": "Compliance Review",
  "participants": [{ "agentId": "agent-emma", "priority": "required" }],
  "hires": [
    {
      "agentName": "Legal Counsel",
      "roleName": "External Legal Counsel",
      "description": "Reviews the contract terms.",
      "skills": ["Contract Law"],
      "systemPrompt": "n/a",
      "priority": "required",
      "type": "human",
      "reason": "Requires a licensed attorney; cannot be an AI agent."
    }
  ],
  "readiness": "STAFFING_ACTION_REQUIRED"
}\n\`\`\``;

const staffingResponseFalseTeamReady = `Recommendation.\n\nVC_STAFFING_PLAN\n\`\`\`json\n{
  "teamName": "Contract Review",
  "participants": [{ "agentId": "agent-emma", "priority": "required" }],
  "hires": [
    {
      "agentName": "Legal Counsel",
      "roleName": "Canadian Legal Counsel",
      "description": "Reviews the Canadian contract terms.",
      "skills": ["Contract Law"],
      "systemPrompt": "n/a",
      "priority": "required",
      "type": "human",
      "reason": "Requires a licensed Canadian attorney."
    }
  ],
  "readiness": "TEAM_READY"
}\n\`\`\``;

const emptyStaffingResponse = `No usable context.\n\nVC_STAFFING_PLAN\n\`\`\`json\n{
  "teamName": "Unresolved",
  "participants": [],
  "hires": [],
  "readiness": "TEAM_READY"
}\n\`\`\``;

beforeEach(() => {
  useWorkspaceStore.setState({
    rooms: [{
      id: 'room-1',
      name: 'Offline Sync',
      emoji: '🏢',
      projectId: 'project-general',
      agentIds: ['agent-olivia'],
      teamIds: [],
      individualAgentIds: ['agent-olivia'],
      messages: [],
      createdAt: 1,
    }],
    activeRoomId: 'room-1',
    roles: defaultRoles.map(role => ({ ...role })),
    agents: defaultAgents.map(agent => ({ ...agent })),
    teams: defaultTeams.map(team => ({ ...team, agentIds: [...team.agentIds] })),
    projects: [],
    decisions: [],
    actionItems: [],
    agentContext: {},
    hydrated: true,
    syncState: 'idle',
  });
});

describe('Olivia meeting staffing', () => {
  it('parses the machine-readable staffing block', () => {
    const plan = parseOliviaStaffingPlan(staffingResponse);
    expect(plan?.teamName).toBe('Offline Sync Review');
    expect(plan?.existingAgentIds).toEqual(['agent-emma', 'agent-mike']);
    expect(plan?.hires).toHaveLength(1);
    expect(plan?.hires[0]?.skills).toContain('Conflict Resolution');
  });

  it('parses participant priority/reason and the readiness enum', () => {
    const plan = parseOliviaStaffingPlan(staffingResponse);
    expect(plan?.participants).toEqual([
      { agentId: 'agent-emma', priority: 'required', reason: 'Owns architecture direction.', expectedContribution: 'Target persistence architecture.' },
      { agentId: 'agent-mike', priority: 'optional', reason: 'Can challenge the proposal.', expectedContribution: 'Risk review.' },
    ]);
    expect(plan?.hires[0]?.priority).toBe('required');
    expect(plan?.hires[0]?.type).toBe('ai-agent');
    expect(plan?.readiness).toBe('STAFFING_ACTION_REQUIRED');
  });

  it('falls back to the legacy flat existingAgentIds shape when participants is absent', () => {
    const plan = parseOliviaStaffingPlan(legacyStaffingResponse);
    expect(plan?.existingAgentIds).toEqual(['agent-emma']);
    expect(plan?.participants).toEqual([{ agentId: 'agent-emma', priority: 'required' }]);
    expect(plan?.readiness).toBe('TEAM_READY');
  });

  it('does not auto-create an agent for a human/contractor hire and reports it as blocked', () => {
    const plan = parseOliviaStaffingPlan(staffingResponseWithHumanHire)!;
    expect(plan.hires[0]?.type).toBe('human');

    const result = applyOliviaStaffingPlan('room-1', plan);
    expect(result?.hiredAgentIds).toHaveLength(0);
    expect(result?.blockedHires).toHaveLength(1);
    expect(result?.blockedHires[0]?.roleName).toBe('External Legal Counsel');

    const state = useWorkspaceStore.getState();
    expect(state.agents.some(agent => agent.name === 'Legal Counsel')).toBe(false);
    // "Applied" deliberately only tracks what Apply can actually satisfy
    // automatically (existing participants + AI-creatable hires) — the
    // human hire staying an unresolved blocker is surfaced separately via
    // blockedHires/readiness, not by holding the whole plan "unapplied".
    expect(isOliviaStaffingPlanApplied('room-1', plan)).toBe(true);
  });

  it('finds the latest Olivia plan and ignores other agents', () => {
    const plan = findLatestOliviaStaffingPlan([
      { authorType: 'agent', authorId: 'agent-emma', content: staffingResponse },
      { authorType: 'agent', authorId: 'agent-olivia', content: staffingResponse },
    ], 'agent-olivia');
    expect(plan?.teamName).toBe('Offline Sync Review');
  });

  it('creates a missing role and agent, builds the team, and adds it to the room', () => {
    const plan = parseOliviaStaffingPlan(staffingResponse)!;
    const result = applyOliviaStaffingPlan('room-1', plan);
    expect(result?.reusedAgentIds).toEqual(['agent-emma', 'agent-mike']);
    expect(result?.hiredAgentIds).toHaveLength(1);

    const state = useWorkspaceStore.getState();
    const role = state.roles.find(item => item.name === 'Mobile Sync Specialist');
    const hire = state.agents.find(item => item.name === 'Iris');
    const team = state.teams.find(item => item.name === 'Offline Sync Review');
    const room = state.rooms.find(item => item.id === 'room-1');

    expect(role).toBeTruthy();
    expect(hire?.roleId).toBe(role?.id);
    expect(team?.agentIds).toEqual(expect.arrayContaining(['agent-emma', 'agent-mike', hire!.id]));
    expect(room?.teamIds).toContain(team?.id);
    expect(room?.agentIds).toEqual(expect.arrayContaining(['agent-emma', 'agent-mike', hire!.id]));
    expect(isOliviaStaffingPlanApplied('room-1', plan)).toBe(true);
  });

  it('is idempotent when the same staffing plan is applied again', () => {
    const plan = parseOliviaStaffingPlan(staffingResponse)!;
    applyOliviaStaffingPlan('room-1', plan);
    const afterFirst = useWorkspaceStore.getState();
    const roleCount = afterFirst.roles.length;
    const agentCount = afterFirst.agents.length;
    const teamCount = afterFirst.teams.length;

    applyOliviaStaffingPlan('room-1', plan);
    const afterSecond = useWorkspaceStore.getState();

    expect(afterSecond.roles).toHaveLength(roleCount);
    expect(afterSecond.agents).toHaveLength(agentCount);
    expect(afterSecond.teams).toHaveLength(teamCount);
  });

  it('rejects content without a valid staffing block', () => {
    expect(parseOliviaStaffingPlan('No staffing JSON here.')).toBeNull();
    expect(parseOliviaStaffingPlan('VC_STAFFING_PLAN ```json {broken} ```')).toBeNull();
  });
});

describe('server-derived staffing readiness', () => {
  it('overrides a false self-reported TEAM_READY when a required human hire is unresolved', () => {
    const plan = parseOliviaStaffingPlan(staffingResponseFalseTeamReady)!;
    applyOliviaStaffingPlan('room-1', plan); // adds Emma; never auto-creates the human hire

    const readiness = deriveStaffingReadiness('room-1', plan);
    expect(readiness.modelReadiness).toBe('TEAM_READY');
    expect(readiness.effectiveReadiness).toBe('STAFFING_ACTION_REQUIRED');
    expect(readiness.blockers).toEqual([
      { type: 'human-staffing-required', role: 'Canadian Legal Counsel', hireType: 'human' },
    ]);
  });

  it('reports a required participant that never made it into the room as a blocker', () => {
    const plan = parseOliviaStaffingPlan(staffingResponse)!;
    // Deliberately not applied: Emma (required) is not yet a room member.
    const readiness = deriveStaffingReadiness('room-1', plan);
    expect(readiness.effectiveReadiness).toBe('STAFFING_ACTION_REQUIRED');
    expect(readiness.blockers).toEqual(expect.arrayContaining([
      { type: 'required-participant-missing', participantId: 'agent-emma', name: 'Emma' },
    ]));
    // Mike is optional, so his absence is not a blocker.
    expect(readiness.blockers.some(blocker => 'participantId' in blocker && blocker.participantId === 'agent-mike')).toBe(false);
  });

  it('reports TEAM_READY once every required participant and hire is actually resolved', () => {
    const plan = parseOliviaStaffingPlan(staffingResponse)!;
    applyOliviaStaffingPlan('room-1', plan);

    const readiness = deriveStaffingReadiness('room-1', plan);
    expect(readiness.effectiveReadiness).toBe('TEAM_READY');
    expect(readiness.blockers).toEqual([]);
  });

  it('reports INSUFFICIENT_CONTEXT only when the plan has nothing to act on at all', () => {
    const plan = parseOliviaStaffingPlan(emptyStaffingResponse)!;
    const readiness = deriveStaffingReadiness('room-1', plan);
    expect(readiness.effectiveReadiness).toBe('INSUFFICIENT_CONTEXT');
    expect(readiness.blockers).toEqual([]);

    // A plan with real content never reads as insufficient context, even if
    // Olivia's own readiness field said so and it's still unresolved.
    const humanPlan = parseOliviaStaffingPlan(staffingResponseWithHumanHire)!;
    expect(deriveStaffingReadiness('room-1', humanPlan).effectiveReadiness).not.toBe('INSUFFICIENT_CONTEXT');
  });
});
