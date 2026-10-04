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

describe('agent memory from other meetings and projects', () => {
  const agent = defaultAgents.find(item => item.id === 'agent-emma')!;
  const role = defaultRoles.find(item => item.id === agent.roleId)!;

  function setup(activeRoomId: string) {
    const baseRoom = { emoji: '🏗️', companyId: 'company-default', languageCode: 'en', agentIds: [agent.id], messages: [], createdAt: 1 };
    useWorkspaceStore.setState({
      agents: defaultAgents,
      roles: defaultRoles,
      projects: [
        { id: 'project-voice', name: 'Voice Platform', description: '', emoji: '📞', createdAt: 1 },
        { id: 'project-b', name: 'Project B', description: '', emoji: '📁', createdAt: 1 },
      ],
      rooms: [
        { ...baseRoom, id: 'room-voice', name: 'Voice launch', projectId: 'project-voice' },
        { ...baseRoom, id: 'room-adhoc', name: 'Funding chat' },
        { ...baseRoom, id: 'room-b', name: 'Feasibility review', projectId: 'project-b' },
        { ...baseRoom, id: 'room-b2', name: 'Feasibility follow-up', projectId: 'project-b' },
        { ...baseRoom, id: 'room-adhoc2', name: 'Another chat' },
      ],
      activeRoomId,
    });
  }

  const base = { agentId: agent.id, companyId: 'company-default', status: 'active' as const, importance: 'high' as const };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('does not inject project-less facts captured in another project room', () => {
    setup('room-b');
    addAgentMemory({ ...base, category: 'decision', title: 'Telephony webhooks', content: 'CRM webhooks and toll fraud controls for the SIP trunk.', sourceRoomId: 'room-voice' });
    addAgentMemory({ ...base, category: 'fact', title: 'Grant accounting', content: 'Canadian innovation funding changes the accounting treatment.', sourceRoomId: 'room-adhoc' });
    addAgentMemory({ ...base, category: 'decision', title: 'Same project fact', content: 'Project B ships quarterly.', sourceRoomId: 'room-b2' });

    const prompt = buildAgentPrompt(agent, role, []);

    expect(prompt).not.toContain('toll fraud');
    expect(prompt).not.toContain('innovation funding');
    expect(prompt).toContain('Project B ships quarterly.');
    expect(prompt).toContain('2 of your saved memories were captured in other meetings or projects');
  });

  it('keeps other-meeting professional practice but labels it as carried over', () => {
    setup('room-b');
    addAgentMemory({ ...base, category: 'lesson', title: 'Review habit', content: 'Ask for the failure mode before approving a design.', sourceRoomId: 'room-voice' });

    const prompt = buildAgentPrompt(agent, role, []);

    expect(prompt).toContain('CARRIED-OVER PRACTICE FROM OTHER MEETINGS OR PROJECTS');
    expect(prompt).toContain('From another meeting/project');
    expect(prompt).toContain('Ask for the failure mode before approving a design.');
    expect(prompt).not.toContain('PERSISTENT AGENT MEMORY');
  });

  it('treats a different project-less room as another meeting', () => {
    setup('room-adhoc2');
    addAgentMemory({ ...base, category: 'risk', title: 'Fraud risk', content: 'Toll fraud on the SIP trunk.', sourceRoomId: 'room-adhoc' });
    addAgentMemory({ ...base, category: 'risk', title: 'Own room risk', content: 'Vendor lock-in with the hosting provider.', sourceRoomId: 'room-adhoc2' });

    const prompt = buildAgentPrompt(agent, role, []);

    expect(prompt).not.toContain('Toll fraud');
    expect(prompt).toContain('Vendor lock-in');
  });

  it('keeps memories the user deliberately saved as company-wide, or that have no source room', () => {
    setup('room-b');
    addAgentMemory({ ...base, category: 'constraint', title: 'House rule', content: 'Every estimate states its confidence interval.', sourceRoomId: 'room-voice', crossProject: true });
    addAgentMemory({ ...base, category: 'constraint', title: 'Manual rule', content: 'Cite sources for market-size figures.' });

    const prompt = buildAgentPrompt(agent, role, []);

    expect(prompt).toContain('Every estimate states its confidence interval.');
    expect(prompt).toContain('Cite sources for market-size figures.');
    expect(prompt).not.toContain('deliberately not included here');
  });

  it('withholds memories whose source room no longer exists', () => {
    setup('room-b');
    addAgentMemory({ ...base, category: 'fact', title: 'Orphan', content: 'Fact from a deleted meeting.', sourceRoomId: 'room-deleted' });

    expect(buildAgentPrompt(agent, role, [])).not.toContain('Fact from a deleted meeting.');
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
    // Combines scope + deliverables + description, deduped — not just one field.
    expect(prompt).toContain('Responsibilities: Architecture direction and integration boundaries.; Owns system structure and architectural trade-offs.');
    expect(prompt).toContain('Boundaries: Does not own detailed implementation.');
    expect(prompt).toContain('Teams: Product & Engineering');
    // Emma's line ends right after the workload clause (no "ALREADY IN ROOM" —
    // that only applies to Olivia herself, who is in room-a).
    expect(prompt).toContain('activeRoomCount: 1 (Payment Redesign)\n');
    expect(prompt).toContain('WORKLOAD SIGNAL');
    expect(prompt).toContain('Do NOT interpret it as: availability, ownership, authority, or a current task assignment.');
    expect(prompt).toContain('Match each required capability against AVAILABLE_ORGANIZATION_ROSTER');
    expect(prompt).toContain('do NOT invent an agent for it');
    // The XML sections keep data (roster, participants) separate from
    // instructions (staffing rules) instead of one mixed block.
    expect(prompt).toContain('<AVAILABLE_ORGANIZATION_ROSTER>');
    expect(prompt).toContain('<MEETING_STAFFING_RULES>');
    expect(prompt).toContain('<CURRENT_PARTICIPANTS>');
    expect(prompt).toContain('- agent-olivia: Olivia — Operations Manager & Meeting Facilitator');
  });

  it('builds the facilitation/staffing section even when nothing has called ensureMeetingRoom yet', () => {
    // Regression test: this section used to read loadMeetingOrchestration()
    // and silently return [] if no meeting state existed for the room yet —
    // a passive dependency on some other component (MeetingOrchestrationBar)
    // having already called ensureMeetingRoom as a side effect of rendering.
    // Deliberately skip that call here to prove buildAgentPrompt no longer
    // needs it to have run first.
    const olivia = defaultAgents.find(item => item.id === MEETING_FACILITATOR_AGENT_ID)!;
    const oliviaRole = defaultRoles.find(item => item.id === olivia.roleId)!;

    useWorkspaceStore.setState({
      agents: [olivia],
      roles: [oliviaRole],
      teams: [],
      projects: [{ id: 'project-a', name: 'Project A', description: '', emoji: '📁', createdAt: 1 }],
      decisions: [],
      actionItems: [],
      rooms: [{
        id: 'room-fresh',
        name: 'Brand New Room',
        emoji: '🏢',
        companyId: 'company-default',
        projectId: 'project-a',
        languageCode: 'en',
        agentIds: [olivia.id],
        teamIds: [],
        individualAgentIds: [olivia.id],
        messages: [],
        createdAt: 1,
      }],
      activeRoomId: 'room-fresh',
    });

    const prompt = buildAgentPrompt(olivia, oliviaRole, []);

    expect(prompt).toContain('<MEETING_CONTEXT>');
    expect(prompt).toContain('<MEETING_STAFFING_RULES>');
    expect(prompt).toContain('YOU ARE CURRENTLY THE ONLY PARTICIPANT IN THIS MEETING.');
  });
});
