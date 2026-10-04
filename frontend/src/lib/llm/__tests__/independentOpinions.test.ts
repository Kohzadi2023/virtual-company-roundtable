import { beforeEach, describe, expect, it } from 'vitest';
import { defaultAgents, defaultRoles, MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { apiContextOptions, buildApiTurnPrompt, hideOtherSpecialists, independentTurnKind } from '@/lib/llm/apiContext';
import { DEFAULT_LLM_SETTINGS, getLlmSettings, resetSettingsMemory, updateLlmSettings } from '@/lib/llm/llmSettings';
import { ensureMeetingRoom, loadMeetingOrchestration, saveMeetingOrchestration, type RoundStage } from '@/lib/meetingOrchestration';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { Agent, Message, Room } from '@/types/domain';

const ROOM = 'room-1';
const OLIVIA = MEETING_FACILITATOR_AGENT_ID;
const agentIds = [OLIVIA, 'agent-emma', 'agent-mike'];

const proposalBlock = `Final proposal.\n\nVC_DECISION_PROPOSAL\n\`\`\`json\n${JSON.stringify({
  title: 'Launch decision',
  outcome: 'CONDITIONAL_GO',
  details: 'Proceed once conditions are met.',
  checklist: [{ item: 'Privacy review', status: 'condition', evidence: 'Pending.' }],
  voteQuestion: 'Support?',
})}\n\`\`\``;

const agent = (id: string): Agent => defaultAgents.find(item => item.id === id)!;
const role = (id: string) => defaultRoles.find(item => item.id === agent(id).roleId)!;

function say(id: string, authorId: string | undefined, content: string): Message {
  return authorId
    ? { id, authorType: 'agent', authorId, authorNameSnapshot: authorId.replace('agent-', ''), content, createdAt: Number(id.replace(/\D/g, '')) || 1 }
    : { id, authorType: 'user', content, createdAt: Number(id.replace(/\D/g, '')) || 1 };
}

function seed(messages: Message[], roundIndex: number, stage: RoundStage): Room {
  localStorage.clear();
  resetSettingsMemory();
  const room: Room = {
    id: ROOM, name: 'Launch Review', emoji: '🏢', projectId: 'project-general', agentIds,
    teamIds: [], individualAgentIds: agentIds, messages, createdAt: 1,
  };
  useWorkspaceStore.setState({
    rooms: [room], activeRoomId: ROOM, roles: defaultRoles.map(item => ({ ...item })), agents: defaultAgents.map(item => ({ ...item })),
    teams: [], projects: [], decisions: [], actionItems: [], agentContext: {}, hydrated: true, syncState: 'idle',
  });
  ensureMeetingRoom(ROOM, agentIds);
  const state = loadMeetingOrchestration();
  state.rooms[ROOM] = { ...state.rooms[ROOM]!, roundIndex, roundStage: stage };
  saveMeetingOrchestration(state);
  return room;
}

const ON = { independentOpinions: true };

describe('independent first opinions', () => {
  const messages = [
    say('m1', undefined, 'BRIEF_MARK evaluate the pilot'),
    say('m2', OLIVIA, 'OLIVIA_OPENING_MARK framing'),
    say('m3', 'agent-mike', 'MIKE_ANSWER_MARK my opinion'),
  ];

  it('hides other specialists\' answers but keeps the brief and Olivia\'s framing', () => {
    const room = seed(messages, 0, 'specialists');
    const turn = buildApiTurnPrompt(room, agent('agent-emma'), role('agent-emma'), ON);
    expect(turn.independent).toBe('opinions');
    expect(turn.prompt).toContain('BRIEF_MARK');
    expect(turn.prompt).toContain('OLIVIA_OPENING_MARK');
    expect(turn.prompt).not.toContain('MIKE_ANSWER_MARK');
    expect(turn.prompt).toContain('INDEPENDENT OPINION:');
  });

  it('gives specialists who have not answered yet the same shared prefix, so the provider cache still applies', () => {
    // Emma has already answered; Mike and Sarah are still to speak. Neither
    // may see Emma's answer, and both must be sent byte-identical shared text.
    const room = seed([...messages.slice(0, 2), say('m3', 'agent-emma', 'EMMA_ANSWER_MARK')], 0, 'specialists');
    const sharedPart = (id: string) => {
      const prompt = buildApiTurnPrompt(room, agent(id), role(id), ON).prompt;
      expect(prompt).not.toContain('EMMA_ANSWER_MARK');
      return prompt.slice(0, prompt.indexOf(`You are ${agent(id).name}`));
    };
    const mike = sharedPart('agent-mike');
    expect(mike.length).toBeGreaterThan(100);
    expect(sharedPart('agent-sarah')).toBe(mike);
  });

  it('lets a specialist keep their own earlier messages', () => {
    const room = seed([...messages, say('m4', 'agent-emma', 'EMMA_EARLIER_MARK')], 0, 'specialists');
    expect(buildApiTurnPrompt(room, agent('agent-emma'), role('agent-emma'), ON).prompt).toContain('EMMA_EARLIER_MARK');
  });

  it('leaves the critique round fully visible, with no note', () => {
    const room = seed(messages, 1, 'specialists');
    const turn = buildApiTurnPrompt(room, agent('agent-emma'), role('agent-emma'), ON);
    expect(turn.independent).toBeNull();
    expect(turn.prompt).toContain('MIKE_ANSWER_MARK');
    expect(turn.prompt).not.toContain('INDEPENDENT');
  });

  it('never applies to Olivia or outside the specialist stage', () => {
    const room = seed(messages, 0, 'specialists');
    expect(buildApiTurnPrompt(room, agent(OLIVIA), role(OLIVIA), ON).prompt).toContain('MIKE_ANSWER_MARK');
    for (const stage of ['opening', 'synthesis', 'complete'] as const) {
      const other = seed(messages, 0, stage);
      expect(independentTurnKind(other, agent('agent-emma'))).toBeNull();
    }
  });

  it('is off unless requested, so existing callers behave as before', () => {
    const room = seed(messages, 0, 'specialists');
    expect(buildApiTurnPrompt(room, agent('agent-emma'), role('agent-emma')).prompt).toContain('MIKE_ANSWER_MARK');
    expect(buildApiTurnPrompt(room, agent('agent-emma'), role('agent-emma'), { independentOpinions: false }).prompt).toContain('MIKE_ANSWER_MARK');
  });
});

describe('independent final votes', () => {
  const messages = [
    say('m1', undefined, 'BRIEF_MARK evaluate the pilot'),
    say('m2', 'agent-mike', 'MIKE_CRITIQUE_MARK earlier critique'),
    say('m3', OLIVIA, proposalBlock),
    say('m4', 'agent-mike', 'MIKE_VOTE_MARK VC_DECISION_VOTE agree'),
    say('m5', 'agent-emma', 'EMMA_OWN_VOTE_MARK'),
  ];

  it('shows the proposal and earlier rounds but not other specialists\' replies to it', () => {
    const room = seed(messages, 3, 'specialists');
    const turn = buildApiTurnPrompt(room, agent('agent-emma'), role('agent-emma'), ON);
    expect(turn.independent).toBe('vote');
    expect(turn.prompt).toContain('VC_DECISION_PROPOSAL');
    expect(turn.prompt).toContain('MIKE_CRITIQUE_MARK');
    expect(turn.prompt).not.toContain('MIKE_VOTE_MARK');
    expect(turn.prompt).toContain('EMMA_OWN_VOTE_MARK');
    expect(turn.prompt).toContain('INDEPENDENT VOTE:');
  });

  it('changes nothing when there is no proposal yet', () => {
    const room = seed(messages.filter(message => message.id !== 'm3'), 3, 'specialists');
    expect(hideOtherSpecialists(room, agent('agent-emma'), 'vote').messages).toHaveLength(4);
  });

  it('does not apply in the revision round before the last', () => {
    const room = seed(messages, 2, 'specialists');
    expect(independentTurnKind(room, agent('agent-emma'))).toBeNull();
  });
});

describe('independence setting', () => {
  it('defaults to on and survives a stored value from before the setting existed', () => {
    resetSettingsMemory();
    localStorage.clear();
    expect(getLlmSettings().independentOpinions).toBe(true);
    localStorage.setItem('virtual-company:llm-settings:v1', JSON.stringify({ model: DEFAULT_LLM_SETTINGS.model, schema: 2 }));
    expect(getLlmSettings().independentOpinions).toBe(true);
  });

  it('can be turned off and is carried into the API prompt options', () => {
    resetSettingsMemory();
    localStorage.clear();
    expect(apiContextOptions().independentOpinions).toBe(true);
    updateLlmSettings({ independentOpinions: false });
    expect(getLlmSettings().independentOpinions).toBe(false);
    expect(apiContextOptions().independentOpinions).toBe(false);
  });
});
