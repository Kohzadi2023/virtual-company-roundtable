import { create } from 'zustand';
import { agentContextKey, newId } from '@/lib/id';
import { defaultAgents, defaultRoles, defaultTeams } from '@/lib/defaultCompany';
import { latestRoomMessage } from '@/lib/contextDelta';
import type { Agent, RoleDefinition, Room, StorageSnapshot, TeamDefinition } from '@/types/domain';

function agentSignature(agent: Pick<Agent, 'name' | 'roleId'>): string {
  return `${agent.name.trim().toLocaleLowerCase()}::${agent.roleId}`;
}

function remapAgentContext(
  context: StorageSnapshot['agentContext'],
  aliases: Map<string, string>,
): StorageSnapshot['agentContext'] {
  if (aliases.size === 0) return context;

  const next: StorageSnapshot['agentContext'] = {};
  for (const [key, value] of Object.entries(context)) {
    let targetKey = key;
    for (const [legacyId, canonicalId] of aliases) {
      const suffix = `:${legacyId}`;
      if (!key.endsWith(suffix)) continue;
      targetKey = `${key.slice(0, -suffix.length)}:${canonicalId}`;
      break;
    }

    const existing = next[targetKey];
    const existingTime = existing?.copiedAt ?? existing?.lastCopiedAt ?? 0;
    const candidateTime = value.copiedAt ?? value.lastCopiedAt ?? 0;
    if (!existing || candidateTime >= existingTime) next[targetKey] = value;
  }
  return next;
}

export interface WorkspaceState {
  rooms: Room[];
  activeRoomId: string | null;
  roles: RoleDefinition[];
  agents: Agent[];
  teams: TeamDefinition[];
  agentContext: StorageSnapshot['agentContext'];
  hydrated: boolean;
  syncState: 'idle' | 'saving' | 'saved' | 'offline' | 'error';

  hydrate: (snapshot: StorageSnapshot | null) => void;
  seedDefaultCompany: () => void;
  setSyncState: (syncState: WorkspaceState['syncState']) => void;
  createRoom: (name: string, emoji?: string, agentIds?: string[]) => string;
  setActiveRoom: (roomId: string) => void;
  addRole: (input: Omit<RoleDefinition, 'id' | 'builtIn' | 'createdAt'>) => string | null;
  addAgent: (input: Omit<Agent, 'id' | 'createdAt'>) => string | null;
  removeAgent: (agentId: string) => void;
  addTeam: (input: Omit<TeamDefinition, 'id' | 'builtIn' | 'createdAt'>) => string | null;
  removeTeam: (teamId: string) => void;
  addTeamToRoom: (roomId: string, teamId: string) => void;
  toggleAgentInRoom: (roomId: string, agentId: string) => void;
  addUserMessage: (roomId: string, content: string) => string | null;
  addAgentMessage: (roomId: string, agentId: string, content: string) => string | null;
  deleteMessage: (roomId: string, messageId: string) => void;
  markAgentContextCopied: (roomId: string, agentId: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  rooms: [],
  activeRoomId: null,
  roles: [],
  agents: [],
  teams: [],
  agentContext: {},
  hydrated: false,
  syncState: 'idle',

  hydrate: (snapshot) => set(() => {
    if (!snapshot) return { hydrated: true };
    const roomIds = new Set(snapshot.rooms.map(room => room.id));
    const activeRoomId = snapshot.activeRoomId && roomIds.has(snapshot.activeRoomId)
      ? snapshot.activeRoomId
      : snapshot.rooms[0]?.id ?? null;
    return {
      rooms: snapshot.rooms,
      roles: snapshot.roles,
      agents: snapshot.agents,
      teams: snapshot.teams,
      agentContext: snapshot.agentContext,
      activeRoomId,
      hydrated: true,
    };
  }),

  seedDefaultCompany: () => set(state => {
    const persistedRoleById = new Map(state.roles.map(role => [role.id, role]));
    const canonicalRoleIds = new Set(defaultRoles.map(role => role.id));
    const roles: RoleDefinition[] = [
      ...defaultRoles.map(builtIn => {
        const existing = persistedRoleById.get(builtIn.id);
        return { ...existing, ...builtIn, createdAt: existing?.createdAt ?? builtIn.createdAt };
      }),
      ...state.roles.filter(role => !canonicalRoleIds.has(role.id)),
    ];

    const canonicalBySignature = new Map(defaultAgents.map(agent => [agentSignature(agent), agent]));
    const canonicalIds = new Set(defaultAgents.map(agent => agent.id));
    const aliases = new Map<string, string>();
    const customAgents = state.agents.filter(agent => {
      if (canonicalIds.has(agent.id)) return false;
      const canonical = canonicalBySignature.get(agentSignature(agent));
      if (!canonical) return true;
      aliases.set(agent.id, canonical.id);
      return false;
    });

    const persistedAgentById = new Map(state.agents.map(agent => [agent.id, agent]));
    const agents: Agent[] = [
      ...defaultAgents.map(builtIn => {
        const existing = persistedAgentById.get(builtIn.id);
        return { ...existing, ...builtIn, createdAt: existing?.createdAt ?? builtIn.createdAt };
      }),
      ...customAgents,
    ];

    const agentById = new Map(agents.map(agent => [agent.id, agent]));
    const roleById = new Map(roles.map(role => [role.id, role]));
    const canonicalAgentId = (id: string): string => aliases.get(id) ?? id;

    const canonicalTeamIds = new Set(defaultTeams.map(team => team.id));
    const persistedTeamById = new Map(state.teams.map(team => [team.id, team]));
    const teams: TeamDefinition[] = [
      ...defaultTeams.map(builtIn => {
        const existing = persistedTeamById.get(builtIn.id);
        return {
          ...existing,
          ...builtIn,
          agentIds: builtIn.agentIds.filter(id => agentById.has(id)),
          createdAt: existing?.createdAt ?? builtIn.createdAt,
        };
      }),
      ...state.teams
        .filter(team => !canonicalTeamIds.has(team.id))
        .map(team => ({
          ...team,
          agentIds: Array.from(new Set(team.agentIds.map(canonicalAgentId).filter(id => agentById.has(id)))),
        })),
    ];

    if (state.rooms.length === 0) {
      const roomId = newId();
      return {
        roles,
        agents,
        teams,
        agentContext: remapAgentContext(state.agentContext, aliases),
        rooms: [{
          id: roomId,
          name: 'Company Roundtable',
          emoji: '🏢',
          agentIds: [],
          messages: [],
          createdAt: Date.now(),
        }],
        activeRoomId: roomId,
      };
    }

    const rooms: Room[] = state.rooms.map(room => {
      const ids = new Set(room.agentIds.map(canonicalAgentId).filter(id => agentById.has(id)));
      const messages = room.messages.map(message => {
        if (message.authorType !== 'agent' || !message.authorId) return message;
        const authorId = canonicalAgentId(message.authorId);
        if (authorId === message.authorId) return message;
        const agent = agentById.get(authorId);
        const role = agent ? roleById.get(agent.roleId) : undefined;
        return {
          ...message,
          authorId,
          ...(agent?.name ? { authorNameSnapshot: agent.name } : {}),
          ...(role?.name ? { roleNameSnapshot: role.name } : {}),
        };
      });
      return { ...room, agentIds: [...ids], messages };
    });

    return {
      roles,
      agents,
      teams,
      rooms,
      agentContext: remapAgentContext(state.agentContext, aliases),
    };
  }),

  setSyncState: (syncState) => set({ syncState }),

  createRoom: (name, emoji = '🏢', agentIds = []) => {
    const id = newId();
    const state = get();
    const validIds = Array.from(new Set(agentIds.filter(agentId => state.agents.some(agent => agent.id === agentId))));
    const room: Room = {
      id,
      name: name.trim() || 'New Room',
      emoji,
      agentIds: validIds,
      messages: [],
      createdAt: Date.now(),
    };
    set(current => ({ rooms: [...current.rooms, room], activeRoomId: id }));
    return id;
  },

  setActiveRoom: (roomId) => set(state => (
    state.rooms.some(room => room.id === roomId) ? { activeRoomId: roomId } : {}
  )),

  addRole: (input) => {
    const name = input.name.trim();
    if (!name) return null;
    const state = get();
    if (state.roles.some(role => role.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return null;
    const id = newId();
    const role: RoleDefinition = {
      ...input,
      id,
      name,
      description: input.description.trim(),
      skills: input.skills.map(skill => skill.trim()).filter(Boolean),
      systemPrompt: input.systemPrompt.trim(),
      builtIn: false,
      createdAt: Date.now(),
    };
    set(current => ({ roles: [...current.roles, role] }));
    return id;
  },

  addAgent: (input) => {
    const name = input.name.trim();
    if (!name) return null;
    const state = get();
    if (!state.roles.some(role => role.id === input.roleId)) return null;
    const id = newId();
    const agent: Agent = { ...input, id, name, createdAt: Date.now() };
    set(current => ({ agents: [...current.agents, agent] }));
    return id;
  },

  removeAgent: (agentId) => set(state => ({
    agents: state.agents.filter(agent => agent.id !== agentId),
    teams: state.teams.map(team => ({ ...team, agentIds: team.agentIds.filter(id => id !== agentId) })),
    rooms: state.rooms.map(room => ({ ...room, agentIds: room.agentIds.filter(id => id !== agentId) })),
    agentContext: Object.fromEntries(
      Object.entries(state.agentContext).filter(([key]) => !key.endsWith(`:${agentId}`)),
    ),
  })),

  addTeam: (input) => {
    const name = input.name.trim();
    if (!name) return null;
    const state = get();
    if (state.teams.some(team => team.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return null;
    const validIds = Array.from(new Set(input.agentIds.filter(id => state.agents.some(agent => agent.id === id))));
    const id = newId();
    const team: TeamDefinition = {
      ...input,
      id,
      name,
      description: input.description.trim(),
      emoji: input.emoji.trim() || '👥',
      agentIds: validIds,
      builtIn: false,
      createdAt: Date.now(),
    };
    set(current => ({ teams: [...current.teams, team] }));
    return id;
  },

  removeTeam: (teamId) => set(state => ({
    teams: state.teams.filter(team => team.id !== teamId || team.builtIn),
  })),

  addTeamToRoom: (roomId, teamId) => set(state => {
    const team = state.teams.find(item => item.id === teamId);
    if (!team) return {};
    return {
      rooms: state.rooms.map(room => room.id === roomId
        ? { ...room, agentIds: Array.from(new Set([...room.agentIds, ...team.agentIds])) }
        : room),
    };
  }),

  toggleAgentInRoom: (roomId, agentId) => set(state => {
    if (!state.agents.some(agent => agent.id === agentId)) return {};
    return {
      rooms: state.rooms.map(room => {
        if (room.id !== roomId) return room;
        const isPresent = room.agentIds.includes(agentId);
        return { ...room, agentIds: isPresent ? room.agentIds.filter(id => id !== agentId) : [...room.agentIds, agentId] };
      }),
    };
  }),

  addUserMessage: (roomId, content) => {
    const trimmed = content.trim();
    if (!trimmed) return null;
    const id = newId();
    set(state => ({
      rooms: state.rooms.map(room => room.id === roomId
        ? { ...room, messages: [...room.messages, { id, authorType: 'user' as const, content: trimmed, createdAt: Date.now() }] }
        : room),
    }));
    return id;
  },

  addAgentMessage: (roomId, agentId, content) => {
    const trimmed = content.trim();
    if (!trimmed) return null;
    const state = get();
    const room = state.rooms.find(item => item.id === roomId);
    const agent = state.agents.find(item => item.id === agentId);
    const role = agent ? state.roles.find(item => item.id === agent.roleId) : undefined;
    if (!room || !agent || !role || !room.agentIds.includes(agentId)) return null;

    const id = newId();
    set(current => ({
      rooms: current.rooms.map(item => item.id === roomId
        ? {
            ...item,
            messages: [...item.messages, {
              id,
              authorType: 'agent' as const,
              authorId: agent.id,
              authorNameSnapshot: agent.name,
              roleNameSnapshot: role.name,
              content: trimmed,
              createdAt: Date.now(),
            }],
          }
        : item),
    }));
    return id;
  },

  deleteMessage: (roomId, messageId) => set(state => ({
    rooms: state.rooms.map(room => room.id === roomId
      ? { ...room, messages: room.messages.filter(message => message.id !== messageId) }
      : room),
  })),

  markAgentContextCopied: (roomId, agentId) => set(state => {
    const room = state.rooms.find(item => item.id === roomId);
    if (!room) return {};
    const latest = latestRoomMessage(room);
    if (!latest) return {};
    const key = agentContextKey(roomId, agentId);
    return {
      agentContext: {
        ...state.agentContext,
        [key]: { lastCopiedMessageId: latest.id, lastCopiedAt: latest.createdAt, copiedAt: Date.now() },
      },
    };
  }),
}));
