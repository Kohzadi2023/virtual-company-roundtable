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

describe('meeting minutes content quality', () => {
  const proposal = `Revised proposal\n\nVC_DECISION_PROPOSAL\n\`\`\`json\n{"title":"Canada launch","outcome":"NO_GO","details":"Hold launch until Phase Zero closes.","checklist":[{"item":"Phase Zero","status":"blocker"}],"voteQuestion":"Support?"}\n\`\`\``;

  function verdictRoom(): Room {
    return {
      id: 'room-v',
      name: 'Launch readiness',
      emoji: '🚀',
      languageCode: 'en',
      agentIds: ['agent-olivia', 'agent-emma', 'agent-grace'],
      messages: [
        { id: 'o1', authorType: 'agent', authorId: 'agent-olivia', authorNameSnapshot: 'Olivia', content: 'VC_MEETING_BRIEF\n```json\n{"objective":"x"}\n```\nOpening the round on launch readiness.', createdAt: 1 },
        { id: 'e1', authorType: 'agent', authorId: 'agent-emma', authorNameSnapshot: 'Emma', content: '**Emma · Architect — Final view**\n* **Production Launch: NO-GO**\n* Pilot: DEFER / BLOCKED :chatgpt-content-reference{index="0"}', createdAt: 2 },
        { id: 'g1', authorType: 'agent', authorId: 'agent-grace', authorNameSnapshot: 'Grace', content: 'From the CPA view I agree.\n- Production Launch: **NO-GO**', createdAt: 3 },
        { id: 'g2', authorType: 'agent', authorId: 'agent-grace', authorNameSnapshot: 'Grace', content: 'From the CPA view I agree.\n- Production Launch: **NO-GO**', createdAt: 4 },
        { id: 'o2', authorType: 'agent', authorId: 'agent-olivia', authorNameSnapshot: 'Olivia', content: proposal, createdAt: 5 },
      ],
      votes: [{ id: 'vc-decision-vote:o2', question: 'Support?', votes: { 'agent-emma': 'agree', 'agent-grace': 'concern' }, createdAt: 6 }],
      createdAt: 1,
    };
  }

  it('records the voted decision proposal and the verdicts participants stated', () => {
    const minutes = buildMeetingMinutes(verdictRoom(), [
      { id: 'd1', projectId: 'p', roomId: 'room-v', title: 'Canada launch', details: '', evidence: 'VC_DECISION_PROPOSAL:o2', status: 'proposed', createdAt: 1, updatedAt: 1 },
    ]);
    const decisions = minutes.split('## Explicit Decisions')[1]!.split('## Stated Verdicts')[0]!;
    expect(decisions).toContain('[NO GO]');
    expect(decisions).toContain('Canada launch — Hold launch until Phase Zero closes.');
    expect(decisions).toContain('Status: proposed');
    expect(decisions).toContain('Vote: agree 1 · concern 1');
    expect(minutes).toContain('- Production Launch: **NO-GO** — Emma, Grace (2)');
    expect(minutes).toContain('- Pilot: **DEFER / BLOCKED** — Emma (1)');
  });

  it('drops duplicate messages, workflow blocks, banners and citation markup from highlights', () => {
    const minutes = buildMeetingMinutes(verdictRoom());
    expect(minutes.match(/- Grace: /g)).toHaveLength(1);
    expect(minutes).toContain('- Olivia: Opening the round on launch readiness.');
    expect(minutes).not.toContain('VC_MEETING_BRIEF');
    expect(minutes).not.toContain('chatgpt-content-reference');
    expect(minutes).toContain('- Emma: Production Launch: NO-GO');
  });
});
