import { sharedAgentBehavior } from '@/lib/defaultCompany';
import type { Agent, Message, RoleDefinition } from '@/types/domain';

function formatMessage(message: Message): string {
  const author = message.authorType === 'user'
    ? 'User'
    : `${message.authorNameSnapshot ?? 'Agent'}${message.roleNameSnapshot ? ` · ${message.roleNameSnapshot}` : ''}`;
  return `${author}:\n${message.content}`;
}

export function buildAgentPrompt(agent: Agent, role: RoleDefinition, messages: Message[]): string {
  const context = messages.map(formatMessage).join('\n\n');
  return [
    `You are ${agent.name}, the company's ${role.name}.`,
    `Your fixed specialties: ${role.skills.join(', ')}.`,
    role.systemPrompt,
    sharedAgentBehavior,
    '',
    'NEW CONTEXT — these are only the messages you have not seen yet:',
    context || '(No new context)',
    '',
    'Respond with your professional contribution only.',
  ].join('\n');
}
