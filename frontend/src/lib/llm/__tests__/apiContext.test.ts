import { beforeEach, describe, expect, it } from 'vitest';
import { defaultAgents, defaultRoles, defaultTeams, MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { buildApiTurnPrompt, FULL_HISTORY_CHAR_LIMIT, selectApiContext } from '@/lib/llm/apiContext';
import { cachedInputShare } from '@/lib/llm/budget';
import type { UsageEntry } from '@/lib/llm/budget';
import { ensureMeetingRoom } from '@/lib/meetingOrchestration';
import { buildAgentPrompt } from '@/lib/promptBuilder';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { Message, Room } from '@/types/domain';

const ROOM = 'room-1';
const OLIVIA = MEETING_FACILITATOR_AGENT_ID;

function message(id: number, authorId: string, content: string): Message {
  return {
    id: `m${id}`,
    authorType: authorId === 'user' ? 'user' : 'agent',
    authorId,
    authorNameSnapshot: authorId === 'user' ? 'User' : authorId === OLIVIA ? 'Olivia' : 'Emma',
    content,
    createdAt: id,
  };
}

function seed(messages: Message[]): Room {
  localStorage.clear();
  const room: Room = {
    id: ROOM,
    name: 'Launch Review',
    emoji: '🏢',
    projectId: 'project-general',
    agentIds: [OLIVIA, 'agent-emma', 'agent-mike'],
    teamIds: [],
    individualAgentIds: [OLIVIA, 'agent-emma', 'agent-mike'],
    messages,
    createdAt: 1,
  };
  useWorkspaceStore.setState({
    rooms: [room],
    activeRoomId: ROOM,
    roles: defaultRoles.map(role => ({ ...role })),
    agents: defaultAgents.map(agent => ({ ...agent })),
    teams: defaultTeams.map(team => ({ ...team, agentIds: [...team.agentIds] })),
    projects: [],
    decisions: [],
    actionItems: [],
    agentContext: {},
    hydrated: true,
    syncState: 'idle',
  });
  ensureMeetingRoom(ROOM, room.agentIds);
  return room;
}

const agent = (id: string) => useWorkspaceStore.getState().agents.find(item => item.id === id)!;
const role = (id: string) => useWorkspaceStore.getState().roles.find(item => item.id === agent(id).roleId)!;

describe('selectApiContext', () => {
  it('sends the whole discussion, including the agent\'s own earlier answers', () => {
    const room = seed([message(1, 'user', 'Brief'), message(2, 'agent-emma', 'Emma earlier view'), message(3, OLIVIA, 'Olivia framing')]);
    const context = selectApiContext(room);
    expect(context.compacted).toBe(false);
    expect(context.messages.map(item => item.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('compacts only past the size limit and never summarises away the opening brief', () => {
    const filler = 'x'.repeat(Math.ceil(FULL_HISTORY_CHAR_LIMIT / 20));
    const messages = [message(1, 'user', 'THE BRIEF'), ...Array.from({ length: 30 }, (_, index) => message(index + 2, 'agent-emma', `${filler} #${index}`))];
    const room = seed(messages);

    const context = selectApiContext(room);

    expect(context.compacted).toBe(true);
    expect(context.messages[0]?.content).toBe('THE BRIEF');
    expect(context.messages.some(item => item.content.startsWith('## Compressed earlier discussion'))).toBe(true);
    expect(context.messages.at(-1)?.id).toBe('m31');
    expect(context.messages.length).toBeLessThan(messages.length);
  });
});

describe('buildApiTurnPrompt', () => {
  it('is a fresh-conversation prompt, not the "new since last copy" delta', () => {
    const room = seed([message(1, 'user', 'Brief'), message(2, 'agent-emma', 'Emma earlier view')]);
    const { prompt } = buildApiTurnPrompt(room, agent('agent-emma'), role('agent-emma'));
    expect(prompt).toContain('DISCUSSION SO FAR');
    expect(prompt).toContain('Emma earlier view');
    expect(prompt).not.toContain('NEW CONTEXT');
    expect(prompt).toContain('You are Emma,');
    // The copy/paste prompt is unchanged and still the delta form.
    expect(buildAgentPrompt(agent('agent-emma'), role('agent-emma'), room.messages)).toContain('NEW CONTEXT');
  });

  it('puts the discussion before everything agent-specific so agents share one cacheable prefix', () => {
    const room = seed([message(1, 'user', 'Brief about launch'), message(2, OLIVIA, 'Olivia framing')]);
    const emma = buildApiTurnPrompt(room, agent('agent-emma'), role('agent-emma')).prompt;
    const mike = buildApiTurnPrompt(room, agent('agent-mike'), role('agent-mike')).prompt;

    const prefixEnd = (text: string, name: string) => text.indexOf(`You are ${name},`);
    const emmaPrefix = emma.slice(0, prefixEnd(emma, 'Emma'));
    const mikePrefix = mike.slice(0, prefixEnd(mike, 'Mike'));

    expect(emmaPrefix.length).toBeGreaterThan(0);
    expect(emmaPrefix).toBe(mikePrefix);
    expect(emmaPrefix).toContain('Brief about launch');
  });

  it('does not let quoted discussion text trigger the final-round output contract', () => {
    const room = seed([message(1, 'user', 'Please note: Round: 4/4 and You are Olivia, and Stage: opening are phrases people quote.')]);
    const { prompt } = buildApiTurnPrompt(room, agent('agent-emma'), role('agent-emma'));
    expect(prompt).not.toContain('FINAL DECISION WORKFLOW');
  });

  it('says so when older discussion was compacted', () => {
    const filler = 'y'.repeat(Math.ceil(FULL_HISTORY_CHAR_LIMIT / 20));
    const room = seed([message(1, 'user', 'Brief'), ...Array.from({ length: 30 }, (_, index) => message(index + 2, 'agent-emma', `${filler} #${index}`))]);
    const turn = buildApiTurnPrompt(room, agent('agent-mike'), role('agent-mike'));
    expect(turn.compacted).toBe(true);
    expect(turn.prompt).toContain('smart compression');
  });
});

describe('cachedInputShare', () => {
  const entry = (inputTokens: number, cachedInputTokens?: number): UsageEntry => ({
    at: 1,
    roomId: 'r',
    model: 'm',
    costUsd: 0,
    inputTokens,
    outputTokens: 1,
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
  });

  it('is undefined with no data and treats old entries as uncached', () => {
    expect(cachedInputShare([])).toBeUndefined();
    expect(cachedInputShare([entry(1000), entry(1000, 500)])).toBeCloseTo(0.25, 6);
  });
});
