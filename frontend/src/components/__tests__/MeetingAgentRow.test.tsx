import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MeetingAgentRow, type MeetingAgentRowData } from '@/components/MeetingAgentRow';

const baseData: MeetingAgentRowData = {
  agent: {
    id: 'agent-emma',
    name: 'Emma',
    roleId: 'role-architect',
    emoji: '🏗️',
    color: '#2563EB',
    createdAt: 1,
  },
  role: {
    id: 'role-architect',
    name: 'Software Architect',
    description: 'Owns system architecture.',
    skills: ['System Design'],
    systemPrompt: 'Act as architect.',
    builtIn: true,
    createdAt: 1,
  },
  status: 'waiting',
  active: false,
  facilitator: false,
};

const callbacks = {
  onActivate: vi.fn(),
  onToggleSkip: vi.fn(),
  onSaveChat: vi.fn(),
  onOpenChat: vi.fn(),
};

describe('MeetingAgentRow', () => {
  it('renders agent identity, meeting status and actionable empty chat state in one row', () => {
    const html = renderToStaticMarkup(<MeetingAgentRow data={baseData} {...callbacks} />);

    expect(html).toContain('Emma');
    expect(html).toContain('Software Architect');
    expect(html).toContain('waiting');
    expect(html).toContain('Skip');
    expect(html).toContain('+ Add Chat Link');
    expect(html).not.toContain('No external chat saved');
    expect(html).not.toContain('Remove');
  });

  it('renders provider, open, edit and remove actions when a chat link exists', () => {
    const data: MeetingAgentRowData = {
      ...baseData,
      status: 'responded',
      provider: 'ChatGPT',
      chatUrl: 'https://chatgpt.com/c/example',
    };
    const html = renderToStaticMarkup(<MeetingAgentRow data={data} {...callbacks} />);

    expect(html).toContain('responded');
    expect(html).toContain('ChatGPT');
    expect(html).toContain('Open / Focus');
    expect(html).toContain('Edit');
    expect(html).toContain('Remove');
  });
});
