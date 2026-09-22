import type { Room } from '@/types/domain';

export function roomsForProject(rooms: Room[], projectId: string): Room[] {
  if (!projectId) return [];
  return rooms.filter(room => room.projectId === projectId);
}

export function roomsOutsideProject(rooms: Room[], projectId: string): Room[] {
  if (!projectId) return rooms;
  return rooms.filter(room => room.projectId !== projectId);
}
