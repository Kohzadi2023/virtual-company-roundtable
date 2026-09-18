import { DEFAULT_ROOM_LANGUAGE } from '@/lib/languages';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function setRoomLanguage(roomId: string, languageCode: string): void {
  useWorkspaceStore.setState(state => ({
    rooms: state.rooms.map(room => room.id === roomId
      ? { ...room, languageCode: languageCode || DEFAULT_ROOM_LANGUAGE }
      : room),
  }));
}

export function deleteRoom(roomId: string): void {
  useWorkspaceStore.setState(state => {
    const index = state.rooms.findIndex(room => room.id === roomId);
    if (index < 0) return state;

    const rooms = state.rooms.filter(room => room.id !== roomId);
    const fallback = rooms[Math.min(index, Math.max(rooms.length - 1, 0))] ?? rooms[0] ?? null;
    const activeRoomId = state.activeRoomId === roomId
      ? fallback?.id ?? null
      : state.activeRoomId;
    const agentContext = Object.fromEntries(
      Object.entries(state.agentContext).filter(([key]) => !key.startsWith(`${roomId}:`)),
    );

    return { rooms, activeRoomId, agentContext };
  });
}
