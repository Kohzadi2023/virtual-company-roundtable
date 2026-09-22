import { beforeEach, describe, expect, it } from 'vitest';
import { defaultAgents, defaultRoles, MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { addSharedMemory } from '@/lib/memoryV2';
import { ensureMeetingRoom } from '@/lib/meetingOrchestration';
import { buildAgentPrompt, buildExternalChatTitleHint } from '@/lib/promptBuilder';
import { addAgentMemory } from '@/lib/workspaceSuite';
import { useWorkspaceStore } from '@/store/workspaceStore';

describe('external chat title hint', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('uses only the selected agent name as the requested chat title', () => {
    const hint = buildExternalChatTitleHint({ name: 'Emma' });

    expect(hint[0]).toBe('CHAT TITLE: Emma');
    expect(hint[1]).toContain('use exactly "Emma" as the conversation title');
    expect(hint[1]).toContain('Do not add the role, room name, project name, or task');
  });

  it('injects company, project and agent memory without leaking another project or company', () => {
    const agent = defaultAgents.find(item => item.id === 'agent-emma')!;
    const role = defaultRoles.find(item => item.id === agent.roleId)!;
    useWorkspaceStore.setState({
      agents: defaultAgents,
      roles: defaultRoles,
      projects: [{ id: 'project-a', name: 'Project A', description: '', emoji: '📁', createdAt: 1 }],
      rooms: [{
        id: 'room-a',
        name: 'Architecture',
        emoji: '🏗️',
        companyId: 'company-default',
        projectId: 'project-a',
        languageCode: 'en',
        agentIds: [agent.id],
        messages: [],
        createdAt: 1,
      }],
      activeRoomId: 'room-a',
    });

    addSharedMemory({
      scope: 'company',
      companyId: 'company-default',
      category: 'constraint',
      title: 'Company security principle',
      content: 'Security controls should default to least privilege.',
      status: 'active',
      importance: 'high',
    });
    addSharedMemory({
      scope: 'project',
      companyId: 'company-default',
      projectId: 'project-a',
      category: 'decision',
      title: 'Project persistence',
      content: 'Project A uses SQLite for local persistence.',
      status: 'active',
      importance: 'high',
    });
    addSharedMemory({
      scope: 'project',
      companyId: 'company-default',
      projectId: 'project-b',
      category: 'decision',
      title: 'Other project shared secret',
      content: 'Project B uses a different persistence system.',
      status: 'active',
      importance: 'high',
    });
    addAgentMemory({
      agentId: agent.id,
      companyId: 'company-default',
      category: 'constraint',
      title: 'Manual AI policy',
      content: 'Keep the external AI workflow manual.',
      status: 'active',
      importance: 'high',
    });
    addAgentMemory({
      agentId: agent.id,
      companyId: 'company-default',
      projectId: 'project-a',
      category: 'decision',
      title: 'Desktop shell',
      content: 'Use Tauri 2.',
      status: 'active',
      importance: 'medium',
    });
    addAgentMemory({
      agentId: agent.id,
      companyId: 'company-default',
      projectId: 'project-b',
      category: 'decision',
      title: 'Other project secret',
      content: 'Do not leak this into Project A.',
      status: 'active',
      importance: 'high',
    });
    addAgentMemory({
      agentId: agent.id,
      companyId: 'company-other',
      category: 'constraint',
      title: 'Other company secret',
      content: 'This belongs to a different company workspace.',
      status: 'active',
      importance: 'high',
    });

    const prompt = buildAgentPrompt(agent, role, []);
    expect(prompt).toContain('COMPANY MEMORY');
    expect(prompt).toContain('PROJECT MEMORY');
    expect(prompt).toContain('PERSISTENT AGENT MEMORY');
    expect(prompt).toContain('Company security principle');
    expect(prompt).toContain('Project persistence');
    expect(prompt).toContain('Manual AI policy');
    expect(prompt).toContain('Desktop shell');
    expect(prompt).not.toContain('Other project shared secret');
    expect(prompt).not.toContain('Other project secret');
    expect(prompt).not.toContain('Other company secret');
  });
});

describe('Olivia staffing roster injection', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('gives Olivia real per-agent context, not just names, and an honest workload proxy', () => {
    const olivia = defaultAgents.find(item => item.id === MEETING_FACILITATOR_AGENT_ID)!;
    const oliviaRole = defaultRoles.find(item => item.id === olivia.roleId)!;
    const emma = { id: 'agent-emma', name: 'Emma', roleId: 'role-architect', emoji: '🏗️', color: '#6366F1', createdAt: 1 };
    const architectRole = {
      id: 'role-architect',
      name: 'Software Architect',
      description: 'Owns system structure and architectural trade-offs.',
      skills: ['System Design', 'Scalability'],
      scope: 'Architecture direction and integration boundaries.',
      limitations: ['Does not own detailed implementation.'],
      systemPrompt: 'Act as architect.',
      builtIn: true,
      createdAt: 1,
    };

    useWorkspaceStore.setState({
      agents: [olivia, emma],
      roles: [oliviaRole, architectRole],
      teams: [{ id: 'team-eng', name: 'Product & Engineering', description: '', emoji: '🧩', agentIds: ['agent-emma'], builtIn: true, createdAt: 1 }],
      projects: [{ id: 'project-a', name: 'Project A', description: '', emoji: '📁', createdAt: 1 }],
      decisions: [],
      actionItems: [],
      rooms: [
        {
          id: 'room-a',
          name: 'New Meeting',
          emoji: '🏢',
          companyId: 'company-default',
          projectId: 'project-a',
          languageCode: 'en',
          agentIds: [olivia.id],
          teamIds: [],
          individualAgentIds: [olivia.id],
          messages: [],
          createdAt: 1,
        },
        {
          id: 'room-b',
          name: 'Payment Redesign',
          emoji: '💳',
          companyId: 'company-default',
          projectId: 'project-a',
          agentIds: ['agent-emma'],
          messages: [],
          createdAt: 1,
        },
      ],
      activeRoomId: 'room-a',
    });
    ensureMeetingRoom('room-a', [olivia.id]);

    const prompt = buildAgentPrompt(olivia, oliviaRole, []);

    expect(prompt).toContain('agent-emma: Emma — Software Architect');
    expect(prompt).toContain('Responsibilities: Architecture direction and integration boundaries.');
    expect(prompt).toContain('Boundaries: Does not own detailed implementation.');
    expect(prompt).toContain('Team: Product & Engineering');
    // Emma's line ends right after the workload clause (no "ALREADY IN ROOM" —
    // that only applies to Olivia herself, who is in room-a).
    expect(prompt).toContain('Active in 1 other room (Payment Redesign)\n');
    expect(prompt).toContain('Match each required capability against this roster');
    expect(prompt).toContain('do NOT invent an agent for it');
  });
});
