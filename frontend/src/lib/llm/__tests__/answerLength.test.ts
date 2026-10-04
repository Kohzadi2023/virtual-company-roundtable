import { beforeEach, describe, expect, it } from 'vitest';
import { defaultAgents, defaultRoles, defaultTeams, MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { buildApiTurnPrompt, lengthBudgetInstruction } from '@/lib/llm/apiContext';
import { summarizeUsageByRoom } from '@/lib/llm/budget';
import type { UsageEntry } from '@/lib/llm/budget';
import { DEFAULT_LLM_SETTINGS, getLlmSettings, updateLlmSettings } from '@/lib/llm/llmSettings';
import { ensureMeetingRoom } from '@/lib/meetingOrchestration';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { Room } from '@/types/domain';

const OLIVIA = MEETING_FACILITATOR_AGENT_ID;

describe('lengthBudgetInstruction', () => {
  it('adds nothing for normal length', () => {
    expect(lengthBudgetInstruction('normal', false)).toBeNull();
  });

  it('gives smaller budgets for brief than concise, and the facilitator a little more room', () => {
    const concise = lengthBudgetInstruction('concise', false) ?? '';
    const brief = lengthBudgetInstruction('brief', false) ?? '';
    expect(concise).toContain('350 words');
    expect(brief).toContain('200 words');
    expect(lengthBudgetInstruction('concise', true)).toContain('400 words');
  });

  it('exempts the required machine-readable blocks so a budget cannot truncate them', () => {
    const text = lengthBudgetInstruction('brief', true) ?? '';
    for (const block of ['VC_STAFFING_PLAN', 'VC_DECISION_PROPOSAL', 'VC_DECISION_VOTE']) expect(text).toContain(block);
    expect(text).toContain('must still be complete');
  });
});

describe('buildApiTurnPrompt with an answer length', () => {
  let room: Room;

  beforeEach(() => {
    localStorage.clear();
    const agentIds = [OLIVIA, 'agent-emma'];
    room = {
      id: 'room-1',
      name: 'Review',
      emoji: '🏢',
      agentIds,
      messages: [{ id: 'm1', authorType: 'user', content: 'Brief', createdAt: 1 }],
      createdAt: 1,
    };
    useWorkspaceStore.setState({
      rooms: [room],
      activeRoomId: 'room-1',
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
    ensureMeetingRoom('room-1', agentIds);
  });

  const build = (answerLength?: 'normal' | 'concise' | 'brief') => {
    const state = useWorkspaceStore.getState();
    const agent = state.agents.find(item => item.id === 'agent-emma')!;
    const role = state.roles.find(item => item.id === agent.roleId)!;
    return buildApiTurnPrompt(room, agent, role, answerLength ? { answerLength } : {}).prompt;
  };

  it('leaves the prompt unchanged by default and appends the budget last when asked', () => {
    expect(build()).not.toContain('LENGTH BUDGET');
    expect(build('normal')).toBe(build());
    const concise = build('concise');
    expect(concise.trimEnd().endsWith('must still be complete and valid.')).toBe(true);
    expect(concise).toContain('350 words');
    expect(concise.startsWith(build())).toBe(true);
  });
});

describe('answer length setting', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to normal and persists a choice without disturbing other settings', () => {
    expect(getLlmSettings().answerLength).toBe(DEFAULT_LLM_SETTINGS.answerLength);
    expect(DEFAULT_LLM_SETTINGS.answerLength).toBe('normal');
    updateLlmSettings({ tokenSaver: true });
    updateLlmSettings({ answerLength: 'concise' });
    expect(getLlmSettings()).toMatchObject({ answerLength: 'concise', tokenSaver: true });
  });

  it('ignores an unknown stored value', () => {
    localStorage.setItem('virtual-company:llm-settings:v1', JSON.stringify({ schema: 2, answerLength: 'huge' }));
    expect(getLlmSettings().answerLength).toBe('normal');
  });
});

describe('summarizeUsageByRoom', () => {
  const entry = (roomId: string, costUsd: number, inputTokens: number, cached?: number): UsageEntry => ({
    at: 1,
    roomId,
    model: 'm',
    costUsd,
    inputTokens,
    outputTokens: 100,
    ...(cached === undefined ? {} : { cachedInputTokens: cached }),
  });

  it('totals per meeting, most expensive first, treating missing cache data as uncached', () => {
    const rows = summarizeUsageByRoom([entry('a', 0.1, 1000), entry('b', 0.5, 4000, 3000), entry('a', 0.1, 1000, 500), entry('b', 0.2, 2000)]);
    expect(rows.map(row => row.roomId)).toEqual(['b', 'a']);
    expect(rows[0]).toMatchObject({ calls: 2, inputTokens: 6000, cachedInputTokens: 3000, outputTokens: 200 });
    expect(rows[0]?.costUsd).toBeCloseTo(0.7, 6);
    expect(rows[1]).toMatchObject({ calls: 2, inputTokens: 2000, cachedInputTokens: 500 });
    expect(summarizeUsageByRoom([])).toEqual([]);
  });

  it('tracks thinking tokens and the time span of each meeting', () => {
    const rows = summarizeUsageByRoom([
      { ...entry('a', 0.1, 1000), at: 5_000, thoughtTokens: 40 },
      { ...entry('a', 0.1, 1000), at: 1_000 },
      { ...entry('a', 0.1, 1000), at: 9_000, thoughtTokens: 10 },
    ]);
    expect(rows[0]).toMatchObject({ thoughtTokens: 50, firstAt: 1_000, lastAt: 9_000 });
  });
});
