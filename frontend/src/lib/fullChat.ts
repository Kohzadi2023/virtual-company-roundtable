import type { Room } from '@/types/domain';

export function buildFullChatText(room: Room): string {
  return room.messages.map(message => {
    const author = message.authorType === 'user'
      ? 'User'
      : `${message.authorNameSnapshot ?? 'Agent'}${message.roleNameSnapshot ? ` · ${message.roleNameSnapshot}` : ''}`;
    const timestamp = new Date(message.createdAt).toISOString();
    return `${author} (${timestamp}):\n${message.content}`;
  }).join('\n\n---\n\n');
}
