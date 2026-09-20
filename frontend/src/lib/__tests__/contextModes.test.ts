import { describe, expect, it } from 'vitest';
import { estimatePromptSize, messagesForContextMode } from '@/lib/contextModes';
import type { AgentContextState, Message, Room } from '@/types/domain';

function message(id: string, authorId: string | undefined, pinned = false): Message {
  return {
    id,
    authorType: authorId ? 'agent' : 'user',
    ...(authorId ? { authorId, authorNameSnapshot: authorId } : {}),
    content: `message ${id}`,
    createdAt: Number(id.replace(/\D/g, '')) || 1,
    ...(pinned ? { pinned: true } : {}),
  } as Message;
}

const room = {
  id: 'room-a',
  name: 'Room A',
  emoji: '🏢',
  agentIds: ['agent-emma', 'agent-mike'],
  messages: [
    message('m1', undefined, true),
    message('m2', 'agent-emma'),
    message('m3', 'agent-mike'),
    message('m4', undefined),
  ],
  createdAt: 1,
} as Room;

describe('context copy modes', () => {
  it('excludes the selected agent own messages from full context', () => {
    const result = messagesForContextMode(room, 'agent-emma', undefined, 'full');
    expect(result.map(item => item.id)).toEqual(['m1', 'm3', 'm4']);
  });

  it('uses only unseen messages in continue mode', () => {
    const cursor = { lastCopiedMessageId: 'm3', lastCopiedAt: 3 } as AgentContextState;
    const result = messagesForContextMode(room, 'agent-emma', cursor, 'continue');
    expect(result.map(item => item.id)).toEqual(['m4']);
  });

  it('keeps pinned and recent messages in compact mode and estimates prompt size', () => {
    const result = messagesForContextMode(room, 'agent-emma', undefined, 'compact');
    expect(result.some(item => item.id === 'm1')).toBe(true);
    const size = estimatePromptSize('one two three four');
    expect(size.words).toBe(4);
    expect(size.approxTokens).toBeGreaterThan(0);
  });
});
