import type { ProjectDefinition, Room } from '@/types/domain';

export interface ProjectRoomGroup {
  project: ProjectDefinition;
  rooms: Room[];
}

/**
 * Groups rooms under their project, in project order. A room whose
 * projectId doesn't match any known project (stale data, or the field left
 * unset) falls back to defaultProjectId instead of being dropped.
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
  return projects.map(project => ({ project, rooms: byProject.get(project.id) ?? [] }));
}
