import { describe, expect, it } from 'vitest';
import { defaultRoomLanguages } from '@/lib/languages';
import { buildMeetingMinutes } from '@/lib/meetingMinutes';
import type { Room } from '@/types/domain';

function sampleRoom(languageCode = 'en'): Room {
  return {
    id: 'room-1',
    name: 'Strategy Room',
    emoji: '🏢',
    languageCode,
    agentIds: ['agent-1'],
    teamIds: [],
    individualAgentIds: ['agent-1'],
    messages: [
      { id: 'm1', authorType: 'user', content: 'We should validate the launch plan.\nDecision: Launch on Monday.', createdAt: 1 },
      { id: 'm2', authorType: 'agent', authorId: 'agent-1', authorNameSnapshot: 'Emma', roleNameSnapshot: 'Architect', content: 'The rollout should be staged.\nAction: Emma will prepare the checklist.', createdAt: 2 },
    ],
    createdAt: 1,
  };
}

describe('room languages and meeting minutes', () => {
  it('ships a useful multilingual default language set', () => {
    expect(defaultRoomLanguages.map(language => language.code)).toEqual(
      expect.arrayContaining(['en', 'fa', 'fr', 'es', 'ar', 'de', 'tr', 'it']),
    );
  });

  it('extracts only explicitly marked decisions and action items and records source metadata', () => {
    const minutes = buildMeetingMinutes(sampleRoom());
    expect(minutes).toContain('**Generated:**');
    expect(minutes).toContain('**Source Messages:** 2');
    expect(minutes).toContain('Launch on Monday.');
    expect(minutes).toContain('Emma will prepare the checklist.');
    expect(minutes).toContain('User: We should validate the launch plan.');
    expect(minutes).toContain('Emma: The rollout should be staged.');
  });

  it('uses localized headings for supported room languages', () => {
    const minutes = buildMeetingMinutes(sampleRoom('fa'));
    expect(minutes).toContain('# صورتجلسه');
    expect(minutes).toContain('**تعداد پیام‌های منبع:** 2');
    expect(minutes).toContain('**زبان:** فارسی');
  });
});
