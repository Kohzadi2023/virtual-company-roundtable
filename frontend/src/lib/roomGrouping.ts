import type { ProjectDefinition, Room } from '@/types/domain';

export interface RoomTreeEntry {
  room: Room;
  /** Rooms branched (directly or transitively) from this one, via Room.branchOfRoomId -- e.g. a decision follow-up room, or a message branch. Flattened to one level: a branch-of-a-branch is listed here too, not nested further. */
  children: Room[];
}

export interface ProjectRoomGroup {
  project: ProjectDefinition;
  /** Top-level rooms (no branch parent within this project) with their descendants attached. */
  rooms: RoomTreeEntry[];
  /** Every room in the project, top-level and nested -- for a count badge that shouldn't undercount follow-ups. */
  roomCount: number;
}

/**
 * Walks Room.branchOfRoomId up to the topmost ancestor that is still in this
 * project's room list, so a room branched from a room branched from a room
 * still nests under the original rather than forming its own chain. Stops at
 * the first parent missing from the project (deleted, or moved to a
 * different project) or already visited (a cycle, which should never happen
 * but must not hang).
 */
function rootAncestorId(room: Room, byId: Map<string, Room>): string {
  const visited = new Set<string>([room.id]);
  let current = room;
  while (current.branchOfRoomId) {
    const parent = byId.get(current.branchOfRoomId);
    if (!parent || visited.has(parent.id)) break;
    visited.add(parent.id);
    current = parent;
  }
  return current.id;
}

/**
 * Groups rooms under their project, in project order, and nests each room
 * branched from another (a decision's follow-up meeting, a message branch)
 * under its topmost ancestor instead of listing it as a flat sibling. A room
 * whose projectId doesn't match any known project (stale data, or the field
 * left unset) falls back to defaultProjectId instead of being dropped.
 */
export function groupRoomsByProject(
  rooms: readonly Room[],
  projects: readonly ProjectDefinition[],
  defaultProjectId: string,
): ProjectRoomGroup[] {
  const byProject = new Map<string, Room[]>(projects.map(project => [project.id, []]));
  for (const room of rooms) {
    const projectId = room.projectId && byProject.has(room.projectId) ? room.projectId : defaultProjectId;
    byProject.get(projectId)?.push(room);
  }

  return projects.map(project => {
    const projectRooms = byProject.get(project.id) ?? [];
    const byId = new Map(projectRooms.map(room => [room.id, room]));

    const childrenByRootId = new Map<string, Room[]>();
    const topLevelIds = new Set<string>();
    for (const room of projectRooms) {
      const rootId = rootAncestorId(room, byId);
      topLevelIds.add(rootId);
      if (rootId === room.id) continue;
      const siblings = childrenByRootId.get(rootId) ?? [];
      siblings.push(room);
      childrenByRootId.set(rootId, siblings);
    }

    const treeRooms: RoomTreeEntry[] = projectRooms
      .filter(room => topLevelIds.has(room.id))
      .map(room => ({ room, children: childrenByRootId.get(room.id) ?? [] }));

    return { project, rooms: treeRooms, roomCount: projectRooms.length };
  });
}
