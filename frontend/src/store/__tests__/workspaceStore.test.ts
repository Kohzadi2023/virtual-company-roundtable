import { beforeEach, describe, expect, it } from 'vitest';
import { agentContextKey } from '@/lib/id';
import { useWorkspaceStore } from '@/store/workspaceStore';

function reset(): void {
  useWorkspaceStore.setState({
    rooms: [],
    activeRoomId: null,
    roles: [],
    agents: [],
    teams: [],
    agentContext: {},
    hydrated: true,
    syncState: 'idle',
  });
}

describe('workspaceStore virtual company model', () => {
  beforeEach(reset);

  it('seeds the expanded specialist directory and default teams without auto-staffing the room', () => {
    useWorkspaceStore.getState().seedDefaultCompany();
    const state = useWorkspaceStore.getState();

    expect(state.agents).toHaveLength(23);
    expect(state.roles).toHaveLength(23);
    expect(state.teams).toHaveLength(8);
    expect(state.agents.map(agent => agent.name)).toEqual([
      'Emma', 'Mike', 'Bob', 'Ava', 'Tom', 'Alex', 'Sarah', 'Adrian',
      'David', 'Sophia', 'Leo', 'Nina', 'Oscar', 'Ella', 'Ryan', 'Laura',
      'Daniel', 'Grace', 'Maya', 'Ethan', 'Noah', 'Olivia', 'Victor',
    ]);

    for (const agent of state.agents) {
      const role = state.roles.find(item => item.id === agent.roleId);
      expect(role, `${agent.name} must have a role`).toBeDefined();
      expect(role?.skills.length).toBeGreaterThan(0);
      expect(role?.systemPrompt.length).toBeGreaterThan(20);
      expect(agent.avatarUrl, `${agent.name} must have an avatar`).toBeTruthy();
    }

    expect(state.teams.map(team => team.name)).toEqual(expect.arrayContaining([
      'Product & Engineering',
      'Sales & Growth',
      'Production & Operations',
      'Legal & Finance',
      'Health & Wellbeing',
      'Education & Immigration',
    ]));
    expect(state.rooms[0]?.agentIds).toEqual([]);
  });

  it('repairs stale persisted built-ins without adding the full company to an existing room', () => {
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
      teams: [],
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
    expect(architect.name).toBe('Software Architect');
    expect(architect.skills.length).toBeGreaterThan(0);
    expect(state.agents).toHaveLength(23);
    expect(state.teams).toHaveLength(8);
    expect(state.rooms[0]?.agentIds).toEqual(['agent-emma']);
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
        { id: 'legacy-emma-id', name: 'Emma', roleId: 'role-architect', emoji: 'E', color: '#999999', createdAt: 10 },
        { id: 'custom-nora', name: 'Nora', roleId: 'role-architect', emoji: 'N', color: '#111111', createdAt: 11 },
      ],
      teams: [],
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
        'legacy-room:legacy-emma-id': { lastCopiedMessageId: 'legacy-message', lastCopiedAt: 20, copiedAt: 20 },
      },
    });

    useWorkspaceStore.getState().seedDefaultCompany();
    const state = useWorkspaceStore.getState();

    expect(state.agents.filter(agent => agent.name === 'Emma')).toHaveLength(1);
    expect(state.agents.find(agent => agent.name === 'Emma')?.id).toBe('agent-emma');
    expect(state.agents.find(agent => agent.id === 'custom-nora')).toBeDefined();
    expect(state.rooms[0]?.agentIds).toEqual(expect.arrayContaining(['agent-emma', 'custom-nora']));
    expect(state.rooms[0]?.messages[0]).toMatchObject({ authorId: 'agent-emma', authorNameSnapshot: 'Emma' });
    expect(state.agentContext['legacy-room:legacy-emma-id']).toBeUndefined();
    expect(state.agentContext[agentContextKey('legacy-room', 'agent-emma')]?.lastCopiedMessageId).toBe('legacy-message');
  });

  it('creates rooms empty unless explicit members are supplied', () => {
    useWorkspaceStore.getState().seedDefaultCompany();
    const emptyRoomId = useWorkspaceStore.getState().createRoom('Empty planning room');
    expect(useWorkspaceStore.getState().rooms.find(room => room.id === emptyRoomId)?.agentIds).toEqual([]);

    const emma = useWorkspaceStore.getState().agents.find(agent => agent.name === 'Emma')!;
    const staffedRoomId = useWorkspaceStore.getState().createRoom('Architecture room', '🏗️', [emma.id]);
    expect(useWorkspaceStore.getState().rooms.find(room => room.id === staffedRoomId)?.agentIds).toEqual([emma.id]);
  });

  it('creates custom teams and adds a whole team to a room', () => {
    useWorkspaceStore.getState().seedDefaultCompany();
    const state = useWorkspaceStore.getState();
    const emma = state.agents.find(agent => agent.name === 'Emma')!;
    const mike = state.agents.find(agent => agent.name === 'Mike')!;
    const teamId = useWorkspaceStore.getState().addTeam({
      name: 'Architecture Review Board',
      description: 'Architecture and critical review',
      emoji: '🧠',
      agentIds: [emma.id, mike.id],
    });
    expect(teamId).not.toBeNull();

    const roomId = useWorkspaceStore.getState().createRoom('Review Room');
    useWorkspaceStore.getState().addTeamToRoom(roomId, teamId!);
    expect(useWorkspaceStore.getState().rooms.find(room => room.id === roomId)?.agentIds)
      .toEqual(expect.arrayContaining([emma.id, mike.id]));
  });

  it('stores User and Agent messages in one shared timeline', () => {
    useWorkspaceStore.getState().seedDefaultCompany();
    const state = useWorkspaceStore.getState();
    const roomId = state.rooms[0]!.id;
    const mike = state.agents.find(agent => agent.name === 'Mike')!;
    useWorkspaceStore.getState().toggleAgentInRoom(roomId, mike.id);

    useWorkspaceStore.getState().addUserMessage(roomId, 'Review this plan.');
    useWorkspaceStore.getState().addAgentMessage(roomId, mike.id, 'The main risk is state drift.');

    const messages = useWorkspaceStore.getState().rooms[0]!.messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ authorType: 'user', content: 'Review this plan.' });
    expect(messages[1]).toMatchObject({ authorType: 'agent', authorId: mike.id, authorNameSnapshot: 'Mike' });
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

  it('creates custom roles and employees without auto-adding them to the room', () => {
    useWorkspaceStore.getState().seedDefaultCompany();
    const currentRoomId = useWorkspaceStore.getState().activeRoomId!;
    const roleId = useWorkspaceStore.getState().addRole({
      name: 'Patent Specialist',
      description: 'Patent specialist',
      skills: ['Patent Review'],
      systemPrompt: 'Review patent-related issues and risks.',
    });
    const agentId = useWorkspaceStore.getState().addAgent({
      name: 'Nora',
      roleId: roleId!,
      emoji: '📜',
      color: '#000000',
    });
    expect(useWorkspaceStore.getState().agents.find(agent => agent.id === agentId)?.roleId).toBe(roleId);
    expect(useWorkspaceStore.getState().rooms.find(room => room.id === currentRoomId)?.agentIds).not.toContain(agentId);
  });
});
