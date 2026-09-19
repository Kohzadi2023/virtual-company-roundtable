import { create } from 'zustand';
import { agentContextKey, newId } from '@/lib/id';
import { defaultAgents, defaultRoles, defaultTeams } from '@/lib/defaultCompany';
import { latestRoomMessage } from '@/lib/contextDelta';
import type {
  ActionItem,
  Agent,
  DecisionRecord,
  ProjectDefinition,
  RoleDefinition,
  Room,
  StorageSnapshot,
  TeamDefinition,
} from '@/types/domain';

export const DEFAULT_PROJECT_ID = 'project-general';

function createGeneralProject(): ProjectDefinition {
  return {
    id: DEFAULT_PROJECT_ID,
    name: 'General',
    description: 'Default workspace for rooms that are not assigned to a specific project.',
    emoji: '📁',
    createdAt: Date.now(),
  };
}

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

function effectiveAgentIds(
  individualAgentIds: string[],
  teamIds: string[],
  teams: TeamDefinition[],
  validAgentIds: Set<string>,
): string[] {
  const result = new Set(individualAgentIds.filter(id => validAgentIds.has(id)));
  const teamById = new Map(teams.map(team => [team.id, team]));
  for (const teamId of teamIds) {
    const team = teamById.get(teamId);
    if (!team) continue;
    for (const agentId of team.agentIds) {
      if (validAgentIds.has(agentId)) result.add(agentId);
    }
  }
  return [...result];
}

function inferLegacyTeamIds(agentIds: string[], teams: TeamDefinition[]): string[] {
  const present = new Set(agentIds);
  return teams
    .filter(team => team.agentIds.length > 0 && team.agentIds.every(id => present.has(id)))
    .map(team => team.id);
}

function normalizeRoomMembership(
  room: Room,
  teams: TeamDefinition[],
  validAgentIds: Set<string>,
  canonicalAgentId: (id: string) => string = id => id,
): Room {
  const remappedCurrent = Array.from(new Set(
    room.agentIds.map(canonicalAgentId).filter(id => validAgentIds.has(id)),
  ));

  const validTeamIds = new Set(teams.map(team => team.id));
  const teamIds = Array.from(new Set(
    (room.teamIds ?? inferLegacyTeamIds(remappedCurrent, teams)).filter(id => validTeamIds.has(id)),
  ));

  const teamById = new Map(teams.map(team => [team.id, team]));
  const suppliedByTeam = new Set<string>();
  for (const teamId of teamIds) {
    for (const agentId of teamById.get(teamId)?.agentIds ?? []) suppliedByTeam.add(agentId);
  }

  const individualAgentIds = Array.from(new Set(
    (room.individualAgentIds ?? remappedCurrent.filter(id => !suppliedByTeam.has(id)))
      .map(canonicalAgentId)
      .filter(id => validAgentIds.has(id)),
  ));

  return {
    ...room,
    teamIds,
    individualAgentIds,
    agentIds: effectiveAgentIds(individualAgentIds, teamIds, teams, validAgentIds),
  };
}

export interface WorkspaceState {
  rooms: Room[];
  activeRoomId: string | null;
  roles: RoleDefinition[];
  agents: Agent[];
  teams: TeamDefinition[];
  projects: ProjectDefinition[];
  decisions: DecisionRecord[];
  actionItems: ActionItem[];
  agentContext: StorageSnapshot['agentContext'];
  hydrated: boolean;
  syncState: 'idle' | 'saving' | 'saved' | 'offline' | 'error';

  hydrate: (snapshot: StorageSnapshot | null) => void;
  seedDefaultCompany: () => void;
  setSyncState: (syncState: WorkspaceState['syncState']) => void;
  createRoom: (name: string, emoji?: string, individualAgentIds?: string[], teamIds?: string[], projectId?: string) => string;
  setActiveRoom: (roomId: string) => void;
  createProject: (name: string, emoji?: string, description?: string) => string | null;
  setRoomProject: (roomId: string, projectId: string) => void;
  addDecision: (input: Omit<DecisionRecord, 'id' | 'createdAt' | 'updatedAt'>) => string | null;
  updateDecision: (decisionId: string, patch: Partial<Omit<DecisionRecord, 'id' | 'projectId' | 'createdAt'>>) => void;
  deleteDecision: (decisionId: string) => void;
  addActionItem: (input: Omit<ActionItem, 'id' | 'createdAt' | 'updatedAt'>) => string | null;
  updateActionItem: (actionItemId: string, patch: Partial<Omit<ActionItem, 'id' | 'projectId' | 'createdAt'>>) => void;
  deleteActionItem: (actionItemId: string) => void;
  addRole: (input: Omit<RoleDefinition, 'id' | 'builtIn' | 'createdAt'>) => string | null;
  addAgent: (input: Omit<Agent, 'id' | 'createdAt'>) => string | null;
  removeAgent: (agentId: string) => void;
  addTeam: (input: Omit<TeamDefinition, 'id' | 'builtIn' | 'createdAt'>) => string | null;
  removeTeam: (teamId: string) => void;
  addTeamToRoom: (roomId: string, teamId: string) => void;
  removeTeamFromRoom: (roomId: string, teamId: string) => void;
  toggleTeamInRoom: (roomId: string, teamId: string) => void;
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
  projects: [],
  decisions: [],
  actionItems: [],
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
      projects: snapshot.projects ?? [],
      decisions: snapshot.decisions ?? [],
      actionItems: snapshot.actionItems ?? [],
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
    const validAgentIds = new Set(agents.map(agent => agent.id));
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

    const existingGeneral = state.projects.find(project => project.id === DEFAULT_PROJECT_ID);
    const projects = state.projects.length > 0
      ? (existingGeneral ? state.projects : [createGeneralProject(), ...state.projects])
      : [createGeneralProject()];
    const validProjectIds = new Set(projects.map(project => project.id));

    if (state.rooms.length === 0) {
      const roomId = newId();
      return {
        roles,
        agents,
        teams,
        projects,
        decisions: state.decisions,
        actionItems: state.actionItems,
        agentContext: remapAgentContext(state.agentContext, aliases),
        rooms: [{
          id: roomId,
          name: 'Company Roundtable',
          emoji: '🏢',
          projectId: DEFAULT_PROJECT_ID,
          agentIds: [],
          teamIds: [],
          individualAgentIds: [],
          messages: [],
          createdAt: Date.now(),
        }],
        activeRoomId: roomId,
      };
    }

    const rooms: Room[] = state.rooms.map(room => {
      const normalized = normalizeRoomMembership(room, teams, validAgentIds, canonicalAgentId);
      const messages = normalized.messages.map(message => {
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
      return {
        ...normalized,
        projectId: normalized.projectId && validProjectIds.has(normalized.projectId)
          ? normalized.projectId
          : DEFAULT_PROJECT_ID,
        messages,
      };
    });

    const validRoomIds = new Set(rooms.map(room => room.id));
    const decisions = state.decisions.map(decision => ({
      ...decision,
      projectId: validProjectIds.has(decision.projectId) ? decision.projectId : DEFAULT_PROJECT_ID,
      ...(decision.roomId && !validRoomIds.has(decision.roomId) ? { roomId: undefined } : {}),
    }));
    const actionItems = state.actionItems.map(actionItem => ({
      ...actionItem,
      projectId: validProjectIds.has(actionItem.projectId) ? actionItem.projectId : DEFAULT_PROJECT_ID,
      ...(actionItem.roomId && !validRoomIds.has(actionItem.roomId) ? { roomId: undefined } : {}),
    }));

    return {
      roles,
      agents,
      teams,
      projects,
      decisions,
      actionItems,
      rooms,
      agentContext: remapAgentContext(state.agentContext, aliases),
    };
  }),

  setSyncState: (syncState) => set({ syncState }),

  createRoom: (name, emoji = '🏢', individualAgentIds = [], teamIds = [], projectId) => {
    const id = newId();
    const state = get();
    const validAgentIds = new Set(state.agents.map(agent => agent.id));
    const validTeamIds = new Set(state.teams.map(team => team.id));
    const validProjectIds = new Set(state.projects.map(project => project.id));
    const activeProjectId = state.rooms.find(room => room.id === state.activeRoomId)?.projectId;
    const resolvedProjectId = projectId && validProjectIds.has(projectId)
      ? projectId
      : activeProjectId && validProjectIds.has(activeProjectId)
        ? activeProjectId
        : state.projects[0]?.id ?? DEFAULT_PROJECT_ID;
    const individuals = Array.from(new Set(individualAgentIds.filter(agentId => validAgentIds.has(agentId))));
    const selectedTeams = Array.from(new Set(teamIds.filter(teamId => validTeamIds.has(teamId))));
    const room: Room = {
      id,
      name: name.trim() || 'New Room',
      emoji,
      projectId: resolvedProjectId,
      agentIds: effectiveAgentIds(individuals, selectedTeams, state.teams, validAgentIds),
      teamIds: selectedTeams,
      individualAgentIds: individuals,
      messages: [],
      createdAt: Date.now(),
    };
    set(current => ({ rooms: [...current.rooms, room], activeRoomId: id }));
    return id;
  },

  setActiveRoom: (roomId) => set(state => (
    state.rooms.some(room => room.id === roomId) ? { activeRoomId: roomId } : {}
  )),

  createProject: (name, emoji = '📁', description = '') => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const state = get();
    if (state.projects.some(project => project.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) return null;
    const id = newId();
    const project: ProjectDefinition = {
      id,
      name: trimmed,
      emoji: emoji.trim() || '📁',
      description: description.trim(),
      createdAt: Date.now(),
    };
    set(current => ({ projects: [...current.projects, project] }));
    return id;
  },

  setRoomProject: (roomId, projectId) => set(state => {
    if (!state.projects.some(project => project.id === projectId)) return {};
    return {
      rooms: state.rooms.map(room => room.id === roomId ? { ...room, projectId } : room),
    };
  }),

  addDecision: (input) => {
    const title = input.title.trim();
    if (!title) return null;
    const state = get();
    if (!state.projects.some(project => project.id === input.projectId)) return null;
    const id = newId();
    const now = Date.now();
    const decision: DecisionRecord = {
      ...input,
      id,
      title,
      details: input.details.trim(),
      evidence: input.evidence?.trim() || undefined,
      roomId: input.roomId && state.rooms.some(room => room.id === input.roomId) ? input.roomId : undefined,
      createdAt: now,
      updatedAt: now,
    };
    set(current => ({ decisions: [decision, ...current.decisions] }));
    return id;
  },

  updateDecision: (decisionId, patch) => set(state => ({
    decisions: state.decisions.map(decision => {
      if (decision.id !== decisionId) return decision;
      const nextTitle = patch.title === undefined ? decision.title : patch.title.trim();
      if (!nextTitle) return decision;
      return {
        ...decision,
        ...patch,
        title: nextTitle,
        ...(patch.details !== undefined ? { details: patch.details.trim() } : {}),
        ...(patch.evidence !== undefined ? { evidence: patch.evidence.trim() || undefined } : {}),
        updatedAt: Date.now(),
      };
    }),
  })),

  deleteDecision: (decisionId) => set(state => ({
    decisions: state.decisions.filter(decision => decision.id !== decisionId),
  })),

  addActionItem: (input) => {
    const title = input.title.trim();
    if (!title) return null;
    const state = get();
    if (!state.projects.some(project => project.id === input.projectId)) return null;
    const id = newId();
    const now = Date.now();
    const actionItem: ActionItem = {
      ...input,
      id,
      title,
      owner: input.owner?.trim() || undefined,
      deadline: input.deadline?.trim() || undefined,
      evidence: input.evidence?.trim() || undefined,
      roomId: input.roomId && state.rooms.some(room => room.id === input.roomId) ? input.roomId : undefined,
      createdAt: now,
      updatedAt: now,
    };
    set(current => ({ actionItems: [actionItem, ...current.actionItems] }));
    return id;
  },

  updateActionItem: (actionItemId, patch) => set(state => ({
    actionItems: state.actionItems.map(actionItem => {
      if (actionItem.id !== actionItemId) return actionItem;
      const nextTitle = patch.title === undefined ? actionItem.title : patch.title.trim();
      if (!nextTitle) return actionItem;
      return {
        ...actionItem,
        ...patch,
        title: nextTitle,
        ...(patch.owner !== undefined ? { owner: patch.owner.trim() || undefined } : {}),
        ...(patch.deadline !== undefined ? { deadline: patch.deadline.trim() || undefined } : {}),
        ...(patch.evidence !== undefined ? { evidence: patch.evidence.trim() || undefined } : {}),
        updatedAt: Date.now(),
      };
    }),
  })),

  deleteActionItem: (actionItemId) => set(state => ({
    actionItems: state.actionItems.filter(actionItem => actionItem.id !== actionItemId),
  })),

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

  removeAgent: (agentId) => set(state => {
    const agents = state.agents.filter(agent => agent.id !== agentId);
    const validAgentIds = new Set(agents.map(agent => agent.id));
    const teams = state.teams.map(team => ({ ...team, agentIds: team.agentIds.filter(id => id !== agentId) }));
    const rooms = state.rooms.map(room => {
      const teamIds = room.teamIds ?? [];
      const individualAgentIds = (room.individualAgentIds ?? room.agentIds).filter(id => id !== agentId);
      return {
        ...room,
        teamIds,
        individualAgentIds,
        agentIds: effectiveAgentIds(individualAgentIds, teamIds, teams, validAgentIds),
      };
    });
    return {
      agents,
      teams,
      rooms,
      agentContext: Object.fromEntries(
        Object.entries(state.agentContext).filter(([key]) => !key.endsWith(`:${agentId}`)),
      ),
    };
  }),

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

  removeTeam: (teamId) => set(state => {
    const target = state.teams.find(team => team.id === teamId);
    if (!target || target.builtIn) return {};
    const teams = state.teams.filter(team => team.id !== teamId);
    const validAgentIds = new Set(state.agents.map(agent => agent.id));
    const rooms = state.rooms.map(room => {
      const selectedTeams = (room.teamIds ?? []).filter(id => id !== teamId);
      const individuals = room.individualAgentIds ?? room.agentIds;
      return {
        ...room,
        teamIds: selectedTeams,
        individualAgentIds: individuals,
        agentIds: effectiveAgentIds(individuals, selectedTeams, teams, validAgentIds),
      };
    });
    return { teams, rooms };
  }),

  addTeamToRoom: (roomId, teamId) => set(state => {
    const team = state.teams.find(item => item.id === teamId);
    if (!team) return {};
    const validAgentIds = new Set(state.agents.map(agent => agent.id));
    return {
      rooms: state.rooms.map(room => {
        if (room.id !== roomId) return room;
        const current = normalizeRoomMembership(room, state.teams, validAgentIds);
        const teamIds = Array.from(new Set([...(current.teamIds ?? []), teamId]));
        const individuals = current.individualAgentIds ?? [];
        return {
          ...current,
          teamIds,
          agentIds: effectiveAgentIds(individuals, teamIds, state.teams, validAgentIds),
        };
      }),
    };
  }),

  removeTeamFromRoom: (roomId, teamId) => set(state => {
    if (!state.teams.some(team => team.id === teamId)) return {};
    const validAgentIds = new Set(state.agents.map(agent => agent.id));
    return {
      rooms: state.rooms.map(room => {
        if (room.id !== roomId) return room;
        const current = normalizeRoomMembership(room, state.teams, validAgentIds);
        const teamIds = (current.teamIds ?? []).filter(id => id !== teamId);
        const individuals = current.individualAgentIds ?? [];
        return {
          ...current,
          teamIds,
          agentIds: effectiveAgentIds(individuals, teamIds, state.teams, validAgentIds),
        };
      }),
    };
  }),

  toggleTeamInRoom: (roomId, teamId) => {
    const state = get();
    const room = state.rooms.find(item => item.id === roomId);
    if (!room) return;
    const selected = room.teamIds?.includes(teamId) ?? false;
    if (selected) state.removeTeamFromRoom(roomId, teamId);
    else state.addTeamToRoom(roomId, teamId);
  },

  toggleAgentInRoom: (roomId, agentId) => set(state => {
    if (!state.agents.some(agent => agent.id === agentId)) return {};
    const validAgentIds = new Set(state.agents.map(agent => agent.id));
    return {
      rooms: state.rooms.map(room => {
        if (room.id !== roomId) return room;
        const current = normalizeRoomMembership(room, state.teams, validAgentIds);
        const individuals = new Set(current.individualAgentIds ?? []);
        if (individuals.has(agentId)) individuals.delete(agentId);
        else individuals.add(agentId);
        const individualAgentIds = [...individuals];
        const teamIds = current.teamIds ?? [];
        return {
          ...current,
          individualAgentIds,
          agentIds: effectiveAgentIds(individualAgentIds, teamIds, state.teams, validAgentIds),
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
