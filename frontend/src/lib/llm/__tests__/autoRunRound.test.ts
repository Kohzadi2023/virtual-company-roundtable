import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultAgents, defaultRoles, defaultTeams, MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { autoRunRound, estimateRoundCostUsd, remainingTurns } from '@/lib/llm/autoRunRound';
import type { ApiRunResult } from '@/lib/llm/apiRun';
import { LlmError } from '@/lib/llm/types';
import { ensureMeetingRoom, loadMeetingOrchestration, setMeetingRound } from '@/lib/meetingOrchestration';
import { useWorkspaceStore } from '@/store/workspaceStore';

const ROOM = 'room-1';
const OLIVIA = MEETING_FACILITATOR_AGENT_ID;

const proposal = `Final proposal.\n\nVC_DECISION_PROPOSAL\n\`\`\`json\n{
  "title": "Launch decision",
  "outcome": "CONDITIONAL_GO",
  "details": "Proceed once conditions are met.",
  "checklist": [{ "item": "Privacy review", "status": "condition", "evidence": "Pending." }],
  "voteQuestion": "Do you support this decision proposal as written?"
}\n\`\`\``;

const staffingPlan = `Team assembled.\n\nVC_STAFFING_PLAN\n\`\`\`json\n{
  "teamName": "Launch Review Team",
  "teamDescription": "Minimum specialists.",
  "participants": [{ "agentId": "agent-emma", "priority": "required", "reason": "Architecture.", "expectedContribution": "Design." }],
  "hires": [],
  "readiness": "STAFFING_ACTION_REQUIRED",
  "rationale": "Emma is required."
}\n\`\`\``;

function fakeResult(text: string): ApiRunResult {
  return {
    model: 'gemini-3.8-flash',
    response: {
      text,
      finishReason: 'STOP',
      model: 'gemini-3.8-flash',
      usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 50, thoughtTokens: 0 },
    },
  };
}

/** Replies from a queue; each entry is the text or an error to throw. */
function scripted(replies: Array<string | LlmError>) {
  const prompts: string[] = [];
  const runPrompt = vi.fn(async (prompt: string): Promise<ApiRunResult> => {
    prompts.push(prompt);
    const next = replies.shift();
    if (next === undefined) throw new Error('script exhausted');
    if (next instanceof LlmError) throw next;
    return fakeResult(next);
  });
  return { runPrompt, prompts };
}

const room = () => useWorkspaceStore.getState().rooms.find(item => item.id === ROOM)!;
const meeting = () => loadMeetingOrchestration().rooms[ROOM]!;

function seed(agentIds: string[], roundIndex: number) {
  localStorage.clear();
  useWorkspaceStore.setState({
    rooms: [{
      id: ROOM,
      name: 'Launch Review',
      emoji: '🏢',
      projectId: 'project-general',
      agentIds,
      teamIds: [],
      individualAgentIds: agentIds,
      messages: [],
      createdAt: 1,
    }],
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
  ensureMeetingRoom(ROOM, agentIds);
  if (roundIndex > 0) setMeetingRound(ROOM, roundIndex);
}

describe('autoRunRound', () => {
  beforeEach(() => seed([OLIVIA, 'agent-emma', 'agent-mike'], 1));

  it('runs opening, every specialist and synthesis, then stops at round complete', async () => {
    const { runPrompt } = scripted(['Opening framing.', 'Emma view.', 'Mike critique.', 'Olivia synthesis.']);
    const progress: string[] = [];

    const result = await autoRunRound(ROOM, { runPrompt, onProgress: p => progress.push(p.agentName) });

    expect(result.reason).toBe('round-complete');
    expect(result.completedTurns).toBe(4);
    expect(room().messages.map(message => message.content)).toEqual(['Opening framing.', 'Emma view.', 'Mike critique.', 'Olivia synthesis.']);
    expect(meeting().roundStage).toBe('complete');
    expect(meeting().roundIndex).toBe(1);
    expect(progress).toEqual(['Olivia', 'Emma', 'Mike', 'Olivia']);
  });

  it('does nothing for a round that is already complete', async () => {
    const { runPrompt } = scripted(['a', 'b', 'c', 'd']);
    await autoRunRound(ROOM, { runPrompt });
    const again = scripted([]);
    const result = await autoRunRound(ROOM, { runPrompt: again.runPrompt });
    expect(result.reason).toBe('round-complete');
    expect(result.completedTurns).toBe(0);
    expect(again.runPrompt).not.toHaveBeenCalled();
  });

  it('keeps finished turns and stops with a readable error when a call fails', async () => {
    const { runPrompt } = scripted(['Opening framing.', new LlmError('rate-limit', 'slow', 429)]);

    const result = await autoRunRound(ROOM, { runPrompt });

    expect(result.reason).toBe('error');
    expect(result.completedTurns).toBe(1);
    expect(result.message).toContain('Emma');
    expect(result.message).toContain('1 earlier turn was kept');
    expect(room().messages).toHaveLength(1);
    expect(meeting().activeSpeakerId).toBe('agent-emma');
  });

  it('stops without calling the model when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { runPrompt } = scripted(['never used']);
    const result = await autoRunRound(ROOM, { runPrompt, signal: controller.signal });
    expect(result.reason).toBe('cancelled');
    expect(runPrompt).not.toHaveBeenCalled();
  });

  it('treats an aborted call as a quiet cancel and keeps earlier turns', async () => {
    const { runPrompt } = scripted(['Opening framing.', new LlmError('aborted', 'cancelled')]);
    const result = await autoRunRound(ROOM, { runPrompt });
    expect(result.reason).toBe('cancelled');
    expect(result.completedTurns).toBe(1);
  });

  it('does not add or advance on an answer identical to an earlier message', async () => {
    const { runPrompt } = scripted(['Same words.', 'Same words.']);
    const result = await autoRunRound(ROOM, { runPrompt });
    expect(result.reason).toBe('duplicate');
    expect(result.completedTurns).toBe(1);
    expect(room().messages).toHaveLength(1);
    expect(meeting().activeSpeakerId).toBe('agent-emma');
  });

  it('sends each speaker their own prompt', async () => {
    const { runPrompt, prompts } = scripted(['Opening framing.', 'Emma view.', 'Mike critique.', 'Olivia synthesis.']);
    await autoRunRound(ROOM, { runPrompt });
    expect(prompts[1]).toContain('Emma');
    expect(prompts[2]).toContain('Mike');
    expect(prompts[2]).toContain('Emma view.');
    // Olivia's synthesis must see her own opening: the API has no chat memory.
    expect(prompts[3]).toContain('Opening framing.');
    expect(prompts[3]).toContain('DISCUSSION SO FAR');
  });
});

describe('autoRunRound checkpoints and recovery', () => {
  it('retries once with the recovery prompt when the final-round proposal is missing', async () => {
    seed([OLIVIA, 'agent-emma'], 3);
    const { runPrompt, prompts } = scripted(['Prose only, no block.', proposal, 'Emma agrees.', 'Olivia wraps up.']);

    const result = await autoRunRound(ROOM, { runPrompt });

    expect(prompts[1]).toContain('<DECISION_PROPOSAL_RECOVERY_INSTRUCTION>');
    expect(prompts[0]).not.toContain('<DECISION_PROPOSAL_RECOVERY_INSTRUCTION>');
    expect(prompts[1]).toContain('Prose only, no block.');
    expect(result.reason).toBe('round-complete');
    expect(room().messages).toHaveLength(4);
  });

  it('gives up after one retry and leaves the meeting paused for the regenerate card', async () => {
    seed([OLIVIA, 'agent-emma'], 3);
    const { runPrompt } = scripted(['Prose only.', 'Still prose only.', 'must not be requested']);

    const result = await autoRunRound(ROOM, { runPrompt });

    expect(result.reason).toBe('checkpoint');
    expect(result.message).toContain('decision proposal');
    expect(runPrompt).toHaveBeenCalledTimes(2);
    expect(meeting().roundStage).toBe('opening');
  });

  it("pauses for the user to approve Olivia's staffing plan instead of looping", async () => {
    seed([OLIVIA], 0);
    const { runPrompt } = scripted([staffingPlan, 'must not be requested']);

    const result = await autoRunRound(ROOM, { runPrompt });

    expect(result.reason).toBe('checkpoint');
    expect(result.message).toContain('Invite Team');
    expect(runPrompt).toHaveBeenCalledTimes(1);
  });

  it('does not pay for a second opening when a staffing plan already exists', async () => {
    seed([OLIVIA], 0);
    await autoRunRound(ROOM, { runPrompt: scripted([staffingPlan]).runPrompt });
    const again = scripted(['must not be requested']);

    const result = await autoRunRound(ROOM, { runPrompt: again.runPrompt });

    expect(result.reason).toBe('checkpoint');
    expect(result.message).toContain('Invite Team');
    expect(again.runPrompt).not.toHaveBeenCalled();
  });
});

describe('forecasting', () => {
  it('counts the turns left in each stage', () => {
    seed([OLIVIA, 'agent-emma', 'agent-mike'], 1);
    expect(remainingTurns(meeting())).toBe(4);
    expect(remainingTurns({ ...meeting(), roundStage: 'specialists' })).toBe(3);
    expect(remainingTurns({ ...meeting(), roundStage: 'synthesis' })).toBe(1);
    expect(remainingTurns({ ...meeting(), roundStage: 'complete' })).toBe(0);
  });

  it('forecasts a higher cost for more turns and larger prompts', () => {
    const base = estimateRoundCostUsd('gemini-3.8-flash', 20_000, 4);
    expect(estimateRoundCostUsd('gemini-3.8-flash', 20_000, 8)).toBeGreaterThan(base);
    expect(estimateRoundCostUsd('gemini-3.8-flash', 80_000, 4)).toBeGreaterThan(base);
    expect(estimateRoundCostUsd('gemini-3.8-flash', 20_000, 0)).toBe(0);
  });
});
