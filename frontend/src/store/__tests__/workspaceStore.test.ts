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

  it('seeds fixed specialist agents and roles', () => {
    useWorkspaceStore.getState().seedDefaultCompany();
    const state = useWorkspaceStore.getState();
    expect(state.agents).toHaveLength(15);
    expect(state.roles).toHaveLength(15);
    expect(state.agents.map(agent => agent.name)).toEqual([
      'Emma', 'Mike', 'Bob', 'Ava', 'Tom', 'Alex', 'Sarah', 'Adrian',
      'David', 'Sophia', 'Leo', 'Nina', 'Oscar', 'Ella', 'Ryan',
    ]);
    const mike = state.agents.find(agent => agent.name === 'Mike')!;
    expect(state.roles.find(role => role.id === mike.roleId)?.name).toBe('Critic / Reviewer');
    expect(state.rooms[0]?.agentIds).toContain(mike.id);
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
