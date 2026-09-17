import { nanoid } from 'nanoid';

export const newId = (): string => nanoid(12);
export const agentContextKey = (roomId: string, agentId: string): string => `${roomId}:${agentId}`;
