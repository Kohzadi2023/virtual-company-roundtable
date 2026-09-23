import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { loadMeetingOrchestration } from '@/lib/meetingOrchestration';
import {
  deriveStaffingReadiness,
  findLatestOliviaStaffingPlan,
  isOliviaStaffingPlanApplied,
} from '@/lib/meetingStaffing';
import { useWorkspaceStore } from '@/store/workspaceStore';

const APP_VERSION = import.meta.env.VITE_APP_VERSION?.trim() || '2.8.0';
const STORAGE_PREFIXES = ['virtual-company:', 'ai-team-chat:'];

function safeHostname(value: string): string | undefined {
  try {
    return new URL(value).hostname || undefined;
  } catch {
    return undefined;
  }
}

function storageDiagnostics(): Array<{ key: string; characters: number; estimatedUtf16Bytes: number }> {
  if (typeof localStorage === 'undefined') return [];
  const rows: Array<{ key: string; characters: number; estimatedUtf16Bytes: number }> = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !STORAGE_PREFIXES.some(prefix => key.startsWith(prefix))) continue;
      const value = localStorage.getItem(key) ?? '';
      rows.push({ key, characters: value.length, estimatedUtf16Bytes: value.length * 2 });
    }
  } catch {
    return [{ key: '(storage diagnostics unavailable)', characters: 0, estimatedUtf16Bytes: 0 }];
  }
  return rows.sort((left, right) => right.characters - left.characters);
}

function sanitizeFilenamePart(value: string): string {
  const clean = value.trim().toLocaleLowerCase().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '');
  return clean.slice(0, 48) || 'room';
}

export interface DebugSnapshotFile {
  filename: string;
  text: string;
}

export function buildDebugSnapshot(roomId?: string): DebugSnapshotFile {
  const workspace = useWorkspaceStore.getState();
  const activeRoomId = roomId ?? workspace.activeRoomId ?? undefined;
  const room = activeRoomId ? workspace.rooms.find(item => item.id === activeRoomId) : undefined;
  const orchestration = loadMeetingOrchestration();
  const meeting = room ? orchestration.rooms[room.id] : undefined;
  const staffingPlan = room
    ? findLatestOliviaStaffingPlan(room.messages, MEETING_FACILITATOR_AGENT_ID)
    : null;
  const latestOliviaMessage = room
    ? [...room.messages].reverse().find(message => message.authorType === 'agent' && message.authorId === MEETING_FACILITATOR_AGENT_ID)
    : undefined;
  const readiness = room && staffingPlan ? deriveStaffingReadiness(room.id, staffingPlan) : null;
  const roleById = new Map(workspace.roles.map(role => [role.id, role]));
  const capturedAt = new Date();

  const snapshot = {
    schema: 'virtual-company-debug-snapshot/v1',
    capturedAt: capturedAt.toISOString(),
    runtime: {
      appVersion: APP_VERSION,
      mode: import.meta.env.MODE,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      location: typeof window !== 'undefined' ? window.location.origin : undefined,
    },
    workspace: {
      hydrated: workspace.hydrated,
      syncState: workspace.syncState,
      activeRoomId: workspace.activeRoomId,
      counts: {
        rooms: workspace.rooms.length,
        agents: workspace.agents.length,
        roles: workspace.roles.length,
        teams: workspace.teams.length,
        projects: workspace.projects.length,
        decisions: workspace.decisions.length,
        actionItems: workspace.actionItems.length,
      },
      rooms: workspace.rooms.map(item => ({
        id: item.id,
        name: item.name,
        projectId: item.projectId,
        companyId: item.companyId,
        languageCode: item.languageCode,
        agentIds: item.agentIds,
        teamIds: item.teamIds ?? [],
        individualAgentIds: item.individualAgentIds ?? [],
        messageCount: item.messages.length,
        createdAt: item.createdAt,
      })),
      agents: workspace.agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        roleId: agent.roleId,
        roleName: roleById.get(agent.roleId)?.name,
      })),
      teams: workspace.teams.map(team => ({
        id: team.id,
        name: team.name,
        agentIds: team.agentIds,
        builtIn: team.builtIn,
      })),
    },
    activeRoom: room ? {
      id: room.id,
      name: room.name,
      projectId: room.projectId,
      companyId: room.companyId,
      languageCode: room.languageCode,
      agentIds: room.agentIds,
      teamIds: room.teamIds ?? [],
      individualAgentIds: room.individualAgentIds ?? [],
      agenda: room.agenda ?? [],
      knowledge: room.knowledge,
      attachments: (room.attachments ?? []).map(attachment => ({
        id: attachment.id,
        name: attachment.name,
        mediaType: attachment.mediaType,
        size: attachment.size,
        addedAt: attachment.addedAt,
      })),
      messages: room.messages.map(message => ({
        id: message.id,
        authorType: message.authorType,
        authorId: message.authorId,
        authorNameSnapshot: message.authorNameSnapshot,
        roleNameSnapshot: message.roleNameSnapshot,
        createdAt: message.createdAt,
        content: message.content,
      })),
    } : null,
    meetingOrchestration: meeting ?? null,
    staffing: {
      latestOliviaMessageId: latestOliviaMessage?.id ?? null,
      latestOliviaMessageContainsStaffingMarker: Boolean(latestOliviaMessage?.content.includes('VC_STAFFING_PLAN')),
      planParsed: Boolean(staffingPlan),
      plan: staffingPlan,
      applied: room && staffingPlan ? isOliviaStaffingPlanApplied(room.id, staffingPlan) : false,
      readiness,
    },
    linkedAgentChats: Object.values(orchestration.chats).map(chat => ({
      agentId: chat.agentId,
      provider: chat.provider,
      hostname: safeHostname(chat.url),
      updatedAt: chat.updatedAt,
    })),
    roomScopedRecords: room ? {
      decisions: workspace.decisions.filter(item => item.roomId === room.id),
      actionItems: workspace.actionItems.filter(item => item.roomId === room.id),
      agentContext: Object.fromEntries(
        Object.entries(workspace.agentContext).filter(([key]) => key.includes(room.id)),
      ),
    } : null,
    storage: {
      note: 'Only Virtual Company key names and sizes are exported. Raw storage values are intentionally omitted.',
      keys: storageDiagnostics(),
    },
  };

  const timestamp = capturedAt.toISOString().replace(/[:.]/g, '-');
  const roomPart = sanitizeFilenamePart(room?.name ?? room?.id ?? 'no-active-room');
  const text = [
    'Virtual Company — Debug Snapshot',
    'Contains active-room message text for debugging. Unknown/raw localStorage values and linked-chat URLs are not exported.',
    '',
    JSON.stringify(snapshot, null, 2),
    '',
  ].join('\n');

  return {
    filename: `virtual-company-debug-${roomPart}-${timestamp}.txt`,
    text,
  };
}

export function downloadDebugSnapshot(roomId?: string): DebugSnapshotFile {
  const file = buildDebugSnapshot(roomId);
  const blob = new Blob([file.text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return file;
}
