import { describe, expect, it } from 'vitest';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { deriveRoomMetadataAutofillPatch } from '@/lib/roomMetadataAutofill';
import type { MeetingRoomState } from '@/lib/meetingOrchestration';
import type { ProjectDefinition, Room } from '@/types/domain';

function room(overrides: Partial<Room> = {}): Room {
  return {
    id: 'room-1',
    name: 'Genesisco Canada Launch',
    emoji: '🏢',
    projectId: 'project-1',
    agentIds: [MEETING_FACILITATOR_AGENT_ID, 'sophia'],
    messages: [
      {
        id: 'm1',
        authorType: 'user',
        content: 'Assess whether Genesisco is ready to launch for Canadian accounting firms. See https://example.com/readiness.',
        tags: ['launch'],
        createdAt: 1,
      },
    ],
    createdAt: 1,
    ...overrides,
  };
}

const project: ProjectDefinition = {
  id: 'project-1',
  name: 'Genesisco',
  description: 'Canadian launch readiness project for accounting firms.',
  emoji: '🚀',
  tags: ['canada', 'accounting'],
  createdAt: 1,
};

const meeting: MeetingRoomState = {
  roomId: 'room-1',
  phase: 'collect',
  rounds: ['Initial opinions', 'Critique', 'Revised proposals', 'Final decision'],
  roundIndex: 0,
  roundStage: 'opening',
  speakerOrder: [MEETING_FACILITATOR_AGENT_ID, 'sophia'],
  speakerStatus: { [MEETING_FACILITATOR_AGENT_ID]: 'waiting', sophia: 'waiting' },
  objective: 'Assess Genesisco readiness for Canadian production launch.',
  expectedOutcome: 'A clear go / no-go / conditional launch decision.',
  decisionQuestion: 'Is Genesisco ready for production launch in Canada?',
  activeSpeakerId: MEETING_FACILITATOR_AGENT_ID,
  updatedAt: 1,
};

describe('deriveRoomMetadataAutofillPatch', () => {
  it('fills empty knowledge, tags and agenda from structured meeting/project data', () => {
    const patch = deriveRoomMetadataAutofillPatch({
      room: room(),
      project,
      meeting,
      decisions: [],
    });

    expect(patch?.knowledge?.objective).toBe(meeting.objective);
    expect(patch?.knowledge?.background).toContain(project.description);
    expect(patch?.knowledge?.requirements).toContain('Expected outcome:');
    expect(patch?.knowledge?.requirements).toContain(meeting.decisionQuestion);
    expect(patch?.knowledge?.links).toBe('https://example.com/readiness');
    expect(patch?.tags).toEqual(['canada', 'accounting', 'launch', 'meeting']);
    expect(patch?.agenda).toEqual(meeting.rounds);
  });

  it('preserves user-authored metadata instead of overwriting it', () => {
    const patch = deriveRoomMetadataAutofillPatch({
      room: room({
        knowledge: {
          objective: 'Manual objective',
          background: 'Manual background',
          constraints: 'Manual constraints',
          requirements: 'Manual requirements',
          links: 'https://manual.example',
        },
        tags: ['manual-tag'],
        agenda: ['Manual agenda'],
      }),
      project,
      meeting,
      decisions: [],
    });

    expect(patch).toBeNull();
  });

  it('uses the latest structured final-decision checklist to fill empty constraints', () => {
    const proposalMessage = {
      id: 'proposal-1',
      authorType: 'agent' as const,
      authorId: MEETING_FACILITATOR_AGENT_ID,
      content: `VC_DECISION_PROPOSAL\n\`\`\`json\n${JSON.stringify({
        title: 'Canada launch decision',
        outcome: 'NO_GO',
        details: 'Production launch remains blocked.',
        checklist: [
          { item: 'Complete Phase Zero', status: 'blocker', evidence: 'Not completed' },
          { item: 'Confirm legal review', status: 'condition', evidence: 'Counsel approval required' },
          { item: 'Meeting scope agreed', status: 'satisfied', evidence: 'Agreed' },
        ],
        voteQuestion: 'Support this proposal?',
      })}\n\`\`\``,
      createdAt: 2,
    };

    const patch = deriveRoomMetadataAutofillPatch({
      room: room({ messages: [...room().messages, proposalMessage] }),
      project,
      meeting,
      decisions: [],
    });

    expect(patch?.knowledge?.constraints).toContain('[BLOCKER] Complete Phase Zero');
    expect(patch?.knowledge?.constraints).toContain('[CONDITION] Confirm legal review');
    expect(patch?.knowledge?.constraints).not.toContain('Meeting scope agreed');
    expect(patch?.tags).toContain('decision-no-go');
  });
});
