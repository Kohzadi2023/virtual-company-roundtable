import { describe, expect, it } from 'vitest';
import { unseenMessagesForAgent } from '@/lib/contextDelta';
import type { AgentContextState, Message, Room } from '@/types/domain';

const messages: Message[] = [
  { id: '1', authorType: 'user', content: 'User 1', createdAt: 1 },
  { id: '2', authorType: 'agent', authorId: 'emma', authorNameSnapshot: 'Emma', content: 'Emma 1', createdAt: 2 },
  { id: '3', authorType: 'agent', authorId: 'bob', authorNameSnapshot: 'Bob', content: 'Bob 1', createdAt: 3 },
  { id: '4', authorType: 'agent', authorId: 'mike', authorNameSnapshot: 'Mike', content: 'Mike 1', createdAt: 4 },
  { id: '5', authorType: 'agent', authorId: 'emma', authorNameSnapshot: 'Emma', content: 'Emma 2', createdAt: 5 },
  { id: '6', authorType: 'agent', authorId: 'bob', authorNameSnapshot: 'Bob', content: 'Bob 2', createdAt: 6 },
];

const room: Room = { id: 'room', name: 'Room', emoji: '🏢', agentIds: ['emma', 'bob', 'mike'], messages, createdAt: 1 };

describe('per-agent delta context', () => {
  it('copies only messages after Mike last saw the room', () => {
    const cursor: AgentContextState = { lastCopiedMessageId: '4', lastCopiedAt: 4, copiedAt: 4 };
    expect(unseenMessagesForAgent(room, 'mike', cursor).map(message => message.id)).toEqual(['5', '6']);
  });

  it('never re-copies the selected agent own messages', () => {
    const cursor: AgentContextState = { lastCopiedMessageId: '3', lastCopiedAt: 3, copiedAt: 3 };
    expect(unseenMessagesForAgent(room, 'mike', cursor).map(message => message.id)).toEqual(['5', '6']);
  });

  it('first copy includes all existing messages except the agent own prior contributions', () => {
    expect(unseenMessagesForAgent(room, 'mike', undefined).map(message => message.id)).toEqual(['1', '2', '3', '5', '6']);
  });

  it('falls back to timestamp if the cursor message was deleted', () => {
    const cursor: AgentContextState = { lastCopiedMessageId: 'deleted', lastCopiedAt: 4, copiedAt: 4 };
    expect(unseenMessagesForAgent(room, 'mike', cursor).map(message => message.id)).toEqual(['5', '6']);
  });
});
