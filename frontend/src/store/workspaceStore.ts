import { create } from 'zustand';
import { agentContextKey, newId } from '@/lib/id';
import { defaultAgents, defaultRoles } from '@/lib/defaultCompany';
import { latestRoomMessage } from '@/lib/contextDelta';
import type { Agent, RoleDefinition, Room, StorageSnapshot } from '@/types/domain';

export interface WorkspaceState {
  rooms: Room[];
  activeRoomId: string | null;
  roles: RoleDefinition[];
  agents: Agent[];
  agentContext: StorageSnapshot['agentContext'];
  hydrated: boolean;
  syncState: 'idle' | 'saving' | 'saved' | 'offline' | 'error';

  hydrate: (snapshot: StorageSnapshot | null) => void;
  seedDefaultCompany: () => void;
  setSyncState: (syncState: WorkspaceState['syncState']) => void;
  createRoom: (name: string, emoji?: string) => string;
  setActiveRoom: (roomId: string) => void;
  addRole: (input: Omit<RoleDefinition, 'id' | 'builtIn' | 'createdAt'>) => string | null;
  addAgent: (input: Omit<Agent, 'id' | 'createdAt'>) => string | null;
  removeAgent: (agentId: string) => void;
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
      agentContext: snapshot.agentContext,
      activeRoomId,
      hydrated: true,
    };
  }),

  /**
   * Reconcile the persisted workspace with the canonical built-in company.
   *
   * Built-in roles/employees are fixed product definitions. Older snapshots may
   * contain the same IDs with stale/missing role metadata, prompts or avatars.
   * Therefore built-ins are UPSERTED from the canonical definitions on every
   * startup, while custom roles/employees (different IDs) are preserved.
   */
  seedDefaultCompany: () => set(state => {
    const roleById = new Map(state.roles.map(role => [role.id, role]));
    for (const builtIn of defaultRoles) {
      const existing = roleById.get(builtIn.id);
      roleById.set(builtIn.id, {
        ...existing,
        ...builtIn,
        createdAt: existing?.createdAt ?? builtIn.createdAt,
      });
    }

    const agentById = new Map(state.agents.map(agent => [agent.id, agent]));
    for (const builtIn of defaultAgents) {
      const existing = agentById.get(builtIn.id);
      agentById.set(builtIn.id, {
        ...existing,
        ...builtIn,
        createdAt: existing?.createdAt ?? builtIn.createdAt,
      });
    }

    const roles = [...roleById.values()];
    const agents = [...agentById.values()];

    if (state.rooms.length === 0) {
      const roomId = newId();
      return {
        roles,
        agents,
        rooms: [{
          id: roomId,
          name: 'Company Roundtable',
          emoji: '🏢',
          agentIds: defaultAgents.map(agent => agent.id),
          messages: [],
          createdAt: Date.now(),
        }],
        activeRoomId: roomId,
      };
    }

    // Ensure the primary company room always contains the canonical workforce.
    // Other rooms keep their manually curated membership unchanged.
    const defaultIds = new Set(defaultAgents.map(agent => agent.id));
    const rooms = state.rooms.map((room, index) => {
      if (index !== 0 && room.name !== 'Company Roundtable') return room;
      const ids = new Set(room.agentIds);
      for (const id of defaultIds) ids.add(id);
      return { ...room, agentIds: [...ids] };
    });

    return { roles, agents, rooms };
  }),

  setSyncState: (syncState) => set({ syncState }),

  createRoom: (name, emoji = '🏢') => {
    const id = newId();
    const state = get();
    const room: Room = {
      id,
      name: name.trim() || 'New Room',
      emoji,
      agentIds: state.agents.map(agent => agent.id),
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
    set(current => ({
      agents: [...current.agents, agent],
      rooms: current.rooms.map(room =>
        room.id === current.activeRoomId && !room.agentIds.includes(id)
          ? { ...room, agentIds: [...room.agentIds, id] }
          : room,
      ),
    }));
    return id;
  },

  removeAgent: (agentId) => set(state => ({
    agents: state.agents.filter(agent => agent.id !== agentId),
    rooms: state.rooms.map(room => ({ ...room, agentIds: room.agentIds.filter(id => id !== agentId) })),
    agentContext: Object.fromEntries(
      Object.entries(state.agentContext).filter(([key]) => !key.endsWith(`:${agentId}`)),
    ),
  })),

  toggleAgentInRoom: (roomId, agentId) => set(state => {
    if (!state.agents.some(agent => agent.id === agentId)) return {};
    return {
      rooms: state.rooms.map(room => {
        if (room.id !== roomId) return room;
        const isPresent = room.agentIds.includes(agentId);
        return {
          ...room,
          agentIds: isPresent ? room.agentIds.filter(id => id !== agentId) : [...room.agentIds, agentId],
        };
      }),
    };
  }),

  addUserMessage: (roomId, content) => {
    const trimmed = content.trim();
    if (!trimmed) return null;
    const id = newId();
    set(state => ({
      rooms: state.rooms.map(room => room.id === roomId
        ? {
            ...room,
            messages: [...room.messages, {
              id,
              authorType: 'user' as const,
              content: trimmed,
              createdAt: Date.now(),
            }],
          }
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
        [key]: {
          lastCopiedMessageId: latest.id,
          lastCopiedAt: latest.createdAt,
          copiedAt: Date.now(),
        },
      },
    };
  }),
}));
