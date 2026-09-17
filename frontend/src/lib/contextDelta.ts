import type { AgentContextState, Message, Room } from '@/types/domain';

export function messagesAfterCursor(room: Room, cursor: AgentContextState | undefined): Message[] {
  if (!cursor?.lastCopiedMessageId && cursor?.lastCopiedAt == null) return room.messages;

  if (cursor.lastCopiedMessageId) {
    const index = room.messages.findIndex(message => message.id === cursor.lastCopiedMessageId);
    if (index >= 0) return room.messages.slice(index + 1);
  }

  const cutoff = cursor.lastCopiedAt ?? -1;
  return room.messages.filter(message => message.createdAt > cutoff);
}

export function unseenMessagesForAgent(
  room: Room,
  agentId: string,
  cursor: AgentContextState | undefined,
): Message[] {
  return messagesAfterCursor(room, cursor).filter(
    message => !(message.authorType === 'agent' && message.authorId === agentId),
  );
}

export function latestRoomMessage(room: Room): Message | null {
  return room.messages.at(-1) ?? null;
}
