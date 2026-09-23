import { defaultRoles, defaultTeams } from '@/lib/defaultCompany';
import { agentContextKey } from '@/lib/id';
import {
  setLocalStorageWithQuotaRecovery,
  stripExtensionsForLocalSnapshot,
} from '@/lib/localStorageQuota';
import {
  restoreWorkspaceExtensions,
  withWorkspaceExtensions,
  WORKSPACE_EXTENSION_EVENTS,
} from '@/lib/workspaceExtensions';
import type { Agent, AgentContextState, RoleDefinition, Room, StorageSnapshot } from '@/types/domain';
import { useWorkspaceStore } from '@/store/workspaceStore';

const KEY = 'ai-team-chat:snapshot:v4';
const LEGACY_V3_KEY = 'ai-team-chat:snapshot:v3';
const LEGACY_V2_KEY = 'ai-team-chat:snapshot:v2';
const VERSION = 4 as const;
let unsubscribe: (() => void) | null = null;
let extensionListener: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const API_KEY = import.meta.env.VITE_API_KEY?.trim();
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL?.trim() ?? '').replace(/\/+$/, '');

type SnapshotV3 = Omit<StorageSnapshot, 'version' | 'teams'> & { version: 3 };

type LegacyCharacter = {
  id: string;
  name: string;
  role: string;
  emoji: string;
  color: string;
  systemPrompt?: string;
  createdAt: number;
};

type LegacyMessage = {
  id: string;
  authorType: 'user' | 'character';
  authorId?: string;
  content: string;
  createdAt: number;
};

type LegacyRoom = {
  id: string;
  name: string;
  emoji: string;
  characterIds: string[];
  messages: LegacyMessage[];
  createdAt: number;
};

type LegacySnapshot = {
  version: 2;
  rooms: LegacyRoom[];
  characters: LegacyCharacter[];
  activeRoomId: string | null;
  savedAt: number;
};

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { ...extra, ...(API_KEY ? { 'X-API-Key': API_KEY } : {}) };
}

function snapshotFromState(): StorageSnapshot {
  const state = useWorkspaceStore.getState();
  return withWorkspaceExtensions({
    version: VERSION,
    rooms: state.rooms,
    roles: state.roles,
    agents: state.agents,
    teams: state.teams,
    projects: state.projects,
    decisions: state.decisions,
    actionItems: state.actionItems,
    agentContext: state.agentContext,
    activeRoomId: state.activeRoomId,
    savedAt: Date.now(),
  });
}

function legacyRoleId(role: string): string {
  const map: Record<string, string> = {
    architect: 'role-architect',
    critic: 'role-critic',
    senior: 'role-frontend',
    ui: 'role-uiux',
  };
  return map[role] ?? `legacy-role-${role || 'custom'}`;
}

function migrateV3(snapshot: SnapshotV3): StorageSnapshot {
  return { ...snapshot, version: 4, teams: defaultTeams, projects: [], decisions: [], actionItems: [] };
}

function migrateV2(snapshot: LegacySnapshot): StorageSnapshot {
  const extraRoles = new Map<string, RoleDefinition>();
  for (const character of snapshot.characters) {
    const roleId = legacyRoleId(character.role);
    if (defaultRoles.some(role => role.id === roleId) || extraRoles.has(roleId)) continue;
    extraRoles.set(roleId, {
      id: roleId,
      name: character.role === 'senior' ? 'Senior Engineer' : character.role === 'manager' ? 'Manager' : character.role || 'Custom Specialist',
      description: 'Migrated specialist role from the previous workspace format.',
      skills: [],
      systemPrompt: character.systemPrompt?.trim() || 'Give a concise professional opinion based on your specialty.',
      builtIn: false,
      createdAt: character.createdAt,
    });
  }

  const roles = [...defaultRoles, ...extraRoles.values()];
  const legacySeedNames: Record<string, { name: string; emoji: string }> = {
    'architect:معمار': { name: 'Emma', emoji: '🏗️' },
    'critic:منتقد': { name: 'Mike', emoji: '🔍' },
    'senior:ارشد': { name: 'Bob', emoji: '💻' },
  };
  const agents: Agent[] = snapshot.characters.map(character => {
    const seedIdentity = legacySeedNames[`${character.role}:${character.name}`];
    return {
      id: character.id,
      name: seedIdentity?.name ?? character.name,
      roleId: legacyRoleId(character.role),
      emoji: seedIdentity?.emoji ?? character.emoji,
      color: character.color,
      createdAt: character.createdAt,
    };
  });

  const roleMap = new Map(roles.map(role => [role.id, role]));
  const agentMap = new Map(agents.map(agent => [agent.id, agent]));
  const rooms: Room[] = snapshot.rooms.map(room => ({
    id: room.id,
    name: room.name,
    emoji: room.emoji,
    agentIds: room.characterIds.filter(id => agentMap.has(id)),
    messages: room.messages.map(message => {
      if (message.authorType === 'user') {
        return { id: message.id, authorType: 'user' as const, content: message.content, createdAt: message.createdAt };
      }
      const agent = message.authorId ? agentMap.get(message.authorId) : undefined;
      const role = agent ? roleMap.get(agent.roleId) : undefined;
      return {
        id: message.id,
        authorType: 'agent' as const,
        ...(message.authorId ? { authorId: message.authorId } : {}),
        authorNameSnapshot: agent?.name ?? 'Agent',
        roleNameSnapshot: role?.name ?? 'Specialist',
        content: message.content,
        createdAt: message.createdAt,
      };
    }),
    createdAt: room.createdAt,
  }));

  const agentContext: Record<string, AgentContextState> = {};
  for (const room of rooms) {
    for (const agentId of room.agentIds) {
      const lastOwnMessage = [...room.messages].reverse().find(
        message => message.authorType === 'agent' && message.authorId === agentId,
      );
      if (lastOwnMessage) {
        agentContext[agentContextKey(room.id, agentId)] = {
          lastCopiedMessageId: lastOwnMessage.id,
          lastCopiedAt: lastOwnMessage.createdAt,
          copiedAt: lastOwnMessage.createdAt,
        };
      }
    }
  }

  return {
    version: 4,
    rooms,
    roles,
    agents,
    teams: defaultTeams,
    projects: [],
    decisions: [],
    actionItems: [],
    agentContext,
    activeRoomId: snapshot.activeRoomId,
    savedAt: snapshot.savedAt,
  };
}

function parseSnapshot(value: unknown): StorageSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const version = (value as { version?: unknown }).version;
  if (version === 4) return value as StorageSnapshot;
  if (version === 3) return migrateV3(value as SnapshotV3);
  if (version === 2) return migrateV2(value as LegacySnapshot);
  return null;
}

function loadLocal(): StorageSnapshot | null {
  for (const key of [KEY, LEGACY_V3_KEY, LEGACY_V2_KEY]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = parseSnapshot(JSON.parse(raw));
      if (parsed) return parsed;
    } catch {
      // Continue to the next local source.
    }
  }
  return null;
}

function saveLocal(snapshot: StorageSnapshot): void {
  const localSnapshot = stripExtensionsForLocalSnapshot(snapshot);
  const result = setLocalStorageWithQuotaRecovery(KEY, JSON.stringify(localSnapshot));
  if (!result.ok) {
    throw result.error instanceof Error ? result.error : new Error('Local snapshot write failed.');
  }
}

async function loadRemote(): Promise<StorageSnapshot | null> {
  const response = await fetch(apiUrl('/api/snapshot'), { headers: apiHeaders() });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Remote load failed: ${response.status}`);
  return parseSnapshot(await response.json());
}

async function saveRemote(snapshot: StorageSnapshot): Promise<void> {
  const response = await fetch(apiUrl('/api/snapshot'), {
    method: 'PUT',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(snapshot),
  });
  if (!response.ok) throw new Error(`Remote save failed: ${response.status}`);
}

export async function bootstrapPersistence(): Promise<void> {
  const local = loadLocal();
  let remote: StorageSnapshot | null = null;
  let remoteAvailable = true;
  try {
    remote = await loadRemote();
  } catch {
    remoteAvailable = false;
  }

  const chosen = remote && (!local || remote.savedAt > local.savedAt) ? remote : local;
  if (chosen?.extensions) restoreWorkspaceExtensions(chosen.extensions);
  useWorkspaceStore.getState().hydrate(chosen);

  if (chosen) {
    try {
      // Extension stores already have dedicated localStorage keys. Keep the
      // local canonical snapshot compact; remote persistence still receives
      // the complete extension-inclusive snapshot.
      saveLocal(chosen);
    } catch {
      useWorkspaceStore.getState().setSyncState('error');
      return;
    }
  }
  useWorkspaceStore.getState().setSyncState(remoteAvailable ? 'idle' : 'offline');
}

async function persistNow(): Promise<void> {
  const snapshot = snapshotFromState();
  let localSaved = true;
  try {
    saveLocal(snapshot);
  } catch {
    localSaved = false;
    useWorkspaceStore.getState().setSyncState('error');
  }

  useWorkspaceStore.getState().setSyncState('saving');
  try {
    await saveRemote(snapshot);
    useWorkspaceStore.getState().setSyncState('saved');
  } catch {
    useWorkspaceStore.getState().setSyncState(localSaved ? 'offline' : 'error');
  }
}

function schedulePersist(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void persistNow(), 350);
}

export function startPersistence(): void {
  if (unsubscribe) return;
  unsubscribe = useWorkspaceStore.subscribe((state, previous) => {
    const dataChanged = state.rooms !== previous.rooms
      || state.roles !== previous.roles
      || state.agents !== previous.agents
      || state.teams !== previous.teams
      || state.projects !== previous.projects
      || state.decisions !== previous.decisions
      || state.actionItems !== previous.actionItems
      || state.agentContext !== previous.agentContext
      || state.activeRoomId !== previous.activeRoomId;
    if (!state.hydrated || !dataChanged) return;
    schedulePersist();
  });

  extensionListener = () => {
    if (!useWorkspaceStore.getState().hydrated) return;
    schedulePersist();
  };
  for (const eventName of WORKSPACE_EXTENSION_EVENTS) {
    window.addEventListener(eventName, extensionListener);
  }
}

export function stopPersistence(): void {
  unsubscribe?.();
  unsubscribe = null;
  if (extensionListener) {
    for (const eventName of WORKSPACE_EXTENSION_EVENTS) {
      window.removeEventListener(eventName, extensionListener);
    }
  }
  extensionListener = null;
  if (timer) clearTimeout(timer);
  timer = null;
}
