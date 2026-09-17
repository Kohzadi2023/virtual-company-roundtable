import { beforeEach, describe, expect, it } from 'vitest';
import { agentContextKey } from '@/lib/id';
import { useWorkspaceStore } from '@/store/workspaceStore';

function reset(): void {
  useWorkspaceStore.setState({
    rooms: [],
    activeRoomId: null,
    roles: [],
    agents: [],
    agentContext: {},
    hydrated: true,
    syncState: 'idle',
  });
}

describe('workspaceStore virtual company model', () => {
  beforeEach(reset);

  it('seeds 15 fixed specialist employees with role, skills, prompt and avatar', () => {
    useWorkspaceStore.getState().seedDefaultCompany();
    const state = useWorkspaceStore.getState();

    expect(state.agents).toHaveLength(15);
    expect(state.roles).toHaveLength(15);
    expect(state.agents.map(agent => agent.name)).toEqual([
      'Emma', 'Mike', 'Bob', 'Ava', 'Tom', 'Alex', 'Sarah', 'Adrian',
      'David', 'Sophia', 'Leo', 'Nina', 'Oscar', 'Ella', 'Ryan',
    ]);

    for (const agent of state.agents) {
      const role = state.roles.find(item => item.id === agent.roleId);
      expect(role, `${agent.name} must have a role`).toBeDefined();
      expect(role?.name.length).toBeGreaterThan(0);
      expect(role?.skills.length).toBeGreaterThan(0);
      expect(role?.systemPrompt.length).toBeGreaterThan(20);
      expect(agent.avatarUrl, `${agent.name} must have an avatar`).toBeTruthy();
    }

    const expectedRoles: Record<string, string> = {
      Emma: 'Software Architect',
      Mike: 'Critic / Reviewer',
      Bob: 'Frontend Engineer',
      Ava: 'UI/UX Designer',
      Tom: 'Marketing & Sales',
      Alex: 'Researcher',
      Sarah: 'SEO Specialist',
      Adrian: 'Copy & Creative',
      David: 'DevOps / SRE',
      Sophia: 'Product Manager',
      Leo: 'Backend Engineer',
      Nina: 'QA Engineer',
      Oscar: 'Data Analyst',
      Ella: 'Customer Success',
      Ryan: 'Security Specialist',
    };

    for (const agent of state.agents) {
      const role = state.roles.find(item => item.id === agent.roleId);
      expect(role?.name).toBe(expectedRoles[agent.name]);
    }

    expect(state.rooms[0]?.agentIds).toEqual(expect.arrayContaining(state.agents.map(agent => agent.id)));
  });

  it('repairs stale persisted built-ins instead of keeping incomplete old definitions', () => {
    useWorkspaceStore.setState({
      roles: [{
        id: 'role-architect',
        name: 'Old Architect',
        description: '',
        skills: [],
        systemPrompt: '',
        builtIn: true,
        createdAt: 99,
      }],
      agents: [{
        id: 'agent-emma',
        name: 'Old Emma',
        roleId: 'role-architect',
        emoji: '?',
        color: '#000000',
        createdAt: 99,
      }],
      rooms: [{
        id: 'legacy-room',
        name: 'Company Roundtable',
        emoji: '🏢',
        agentIds: ['agent-emma'],
        messages: [],
        createdAt: 99,
      }],
      activeRoomId: 'legacy-room',
    });

    useWorkspaceStore.getState().seedDefaultCompany();
    const state = useWorkspaceStore.getState();
    const emma = state.agents.find(agent => agent.id === 'agent-emma')!;
    const architect = state.roles.find(role => role.id === 'role-architect')!;

    expect(emma.name).toBe('Emma');
    expect(emma.avatarUrl).toBeTruthy();
    expect(emma.emoji).toBe('🏗️');
    expect(architect.name).toBe('Software Architect');
    expect(architect.skills.length).toBeGreaterThan(0);
    expect(architect.systemPrompt.length).toBeGreaterThan(20);
    expect(state.agents).toHaveLength(15);
    expect(state.roles).toHaveLength(15);
    expect(state.rooms[0]?.agentIds).toHaveLength(15);
  });

  it('removes legacy duplicate built-ins and remaps room, message and cursor identity', () => {
    useWorkspaceStore.setState({
      roles: [{
        id: 'role-architect',
        name: 'Software Architect',
        description: 'legacy',
        skills: ['legacy'],
        systemPrompt: 'legacy prompt',
        builtIn: true,
        createdAt: 10,
      }],
      agents: [
        {
          id: 'legacy-emma-id',
          name: 'Emma',
          roleId: 'role-architect',
          emoji: 'E',
          color: '#999999',
          createdAt: 10,
        },
        {
          id: 'custom-nora',
          name: 'Nora',
          roleId: 'role-architect',
          emoji: 'N',
          color: '#111111',
          createdAt: 11,
        },
      ],
      rooms: [{
        id: 'legacy-room',
        name: 'Company Roundtable',
        emoji: '🏢',
        agentIds: ['legacy-emma-id', 'custom-nora'],
        messages: [{
          id: 'legacy-message',
          authorType: 'agent',
          authorId: 'legacy-emma-id',
          authorNameSnapshot: 'Emma',
          roleNameSnapshot: 'Software Architect',
          content: 'Legacy Emma response',
          createdAt: 20,
        }],
        createdAt: 10,
      }],
      activeRoomId: 'legacy-room',
      agentContext: {
        'legacy-room:legacy-emma-id': {
          lastCopiedMessageId: 'legacy-message',
          lastCopiedAt: 20,
          copiedAt: 20,
        },
      },
    });

    useWorkspaceStore.getState().seedDefaultCompany();
    const state = useWorkspaceStore.getState();

    expect(state.agents.filter(agent => agent.name === 'Emma')).toHaveLength(1);
    expect(state.agents.find(agent => agent.name === 'Emma')?.id).toBe('agent-emma');
    expect(state.agents.find(agent => agent.id === 'custom-nora')).toBeDefined();
    expect(state.rooms[0]?.agentIds).not.toContain('legacy-emma-id');
    expect(state.rooms[0]?.agentIds).toContain('agent-emma');
    expect(state.rooms[0]?.messages[0]).toMatchObject({ authorId: 'agent-emma', authorNameSnapshot: 'Emma' });
    expect(state.agentContext['legacy-room:legacy-emma-id']).toBeUndefined();
    expect(state.agentContext[agentContextKey('legacy-room', 'agent-emma')]?.lastCopiedMessageId).toBe('legacy-message');
  });

  it('stores User and Agent messages in one shared timeline', () => {
    useWorkspaceStore.getState().seedDefaultCompany();
    const state = useWorkspaceStore.getState();
    const roomId = state.rooms[0]!.id;
    const mike = state.agents.find(agent => agent.name === 'Mike')!;

    useWorkspaceStore.getState().addUserMessage(roomId, 'Review this plan.');
    useWorkspaceStore.getState().addAgentMessage(roomId, mike.id, 'The main risk is state drift.');

    const messages = useWorkspaceStore.getState().rooms[0]!.messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ authorType: 'user', content: 'Review this plan.' });
    expect(messages[1]).toMatchObject({
      authorType: 'agent',
      authorId: mike.id,
      authorNameSnapshot: 'Mike',
      roleNameSnapshot: 'Critic / Reviewer',
    });
  });

  it('keeps copy cursors independent per room and agent', () => {
    useWorkspaceStore.getState().seedDefaultCompany();
    const state = useWorkspaceStore.getState();
    const roomId = state.rooms[0]!.id;
    const mike = state.agents.find(agent => agent.name === 'Mike')!;
    const bob = state.agents.find(agent => agent.name === 'Bob')!;

    const messageId = useWorkspaceStore.getState().addUserMessage(roomId, 'New company question.');
    useWorkspaceStore.getState().markAgentContextCopied(roomId, mike.id);

    const current = useWorkspaceStore.getState();
    expect(current.agentContext[agentContextKey(roomId, mike.id)]?.lastCopiedMessageId).toBe(messageId);
    expect(current.agentContext[agentContextKey(roomId, bob.id)]).toBeUndefined();
  });

  it('creates custom roles and assigns an immutable role reference at agent creation', () => {
    const roleId = useWorkspaceStore.getState().addRole({
      name: 'Security Engineer',
      description: 'Security specialist',
      skills: ['Threat Modeling'],
      systemPrompt: 'Review security risks.',
    });
    expect(roleId).not.toBeNull();
    const agentId = useWorkspaceStore.getState().addAgent({
      name: 'Nora',
      roleId: roleId!,
      emoji: '🛡️',
      color: '#000000',
    });
    expect(useWorkspaceStore.getState().agents.find(agent => agent.id === agentId)?.roleId).toBe(roleId);
  });
});
