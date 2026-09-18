import { describe, expect, it } from 'vitest';
import { buildMeetingMinutesPrompt } from '@/lib/meetingMinutesPrompt';
import type { Room } from '@/types/domain';

function sampleRoom(): Room {
  return {
    id: 'room-1',
    name: 'Product Review',
    emoji: '🏢',
    languageCode: 'fa',
    agentIds: ['agent-emma'],
    teamIds: [],
    individualAgentIds: ['agent-emma'],
    messages: [
      {
        id: 'm1',
        authorType: 'user',
        content: 'یک سیستم نظرسنجی تحت وب لازم داریم.',
        createdAt: 1,
      },
      {
        id: 'm2',
        authorType: 'agent',
        authorId: 'agent-emma',
        authorNameSnapshot: 'Emma',
        roleNameSnapshot: 'Software Architect',
        content: 'A key architectural concern is burst response ingestion.',
        createdAt: 2,
      },
    ],
    createdAt: 1,
  };
}

describe('manual meeting-minutes AI prompt', () => {
  it('includes room language, complete transcript, evidence IDs, and anti-hallucination rules', () => {
    const prompt = buildMeetingMinutesPrompt(sampleRoom());

    expect(prompt).toContain('Persian (فارسی)');
    expect(prompt).toContain('[M01]');
    expect(prompt).toContain('[M02]');
    expect(prompt).toContain('یک سیستم نظرسنجی تحت وب لازم داریم.');
    expect(prompt).toContain('A key architectural concern is burst response ingestion.');
    expect(prompt).toContain('Do not invent decisions, owners, deadlines');
    expect(prompt).toContain('Suggestions are NOT decisions');
    expect(prompt).toContain('Never infer it');
    expect(prompt).toContain('## Executive Summary');
    expect(prompt).toContain('## Action Items');
    expect(prompt).toContain('## Evidence Index');
    expect(prompt).toContain('Return ONLY the final Markdown document');
    expect(prompt).toContain('Translate all headings');
  });
});
