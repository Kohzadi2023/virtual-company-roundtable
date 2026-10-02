import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultAgents, defaultRoles, MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { runPromptViaApi } from '@/lib/llm/apiRun';
import { FULL_HISTORY_CHAR_LIMIT, SAVER_HISTORY_CHAR_LIMIT, selectApiContext } from '@/lib/llm/apiContext';
import { setApiKey } from '@/lib/llm/credentials';
import { resetThinkingLevelRejection } from '@/lib/llm/geminiProvider';
import {
  DEFAULT_LLM_SETTINGS,
  getLlmSettings,
  modelForAgent,
  setSelectedModel,
  updateLlmSettings,
} from '@/lib/llm/llmSettings';
import type { Message, Room } from '@/types/domain';

const OLIVIA = MEETING_FACILITATOR_AGENT_ID;

beforeEach(() => {
  window.localStorage.clear();
  resetThinkingLevelRejection();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('llm settings', () => {
  it('defaults to low thinking and full context', () => {
    expect(getLlmSettings()).toEqual(DEFAULT_LLM_SETTINGS);
    expect(DEFAULT_LLM_SETTINGS.thinking).toBe('low');
    expect(DEFAULT_LLM_SETTINGS.tokenSaver).toBe(false);
  });

  it('merges updates instead of overwriting other settings, and ignores unknown models', () => {
    updateLlmSettings({ specialistModel: 'gemini-3.5-flash-lite' });
    setSelectedModel('gemini-3.1-pro-preview');
    updateLlmSettings({ specialistModel: 'not-a-model' });
    const settings = getLlmSettings();
    expect(settings.model).toBe('gemini-3.1-pro-preview');
    expect(settings.specialistModel).toBeNull();
    updateLlmSettings({ tokenSaver: false });
    expect(getLlmSettings().tokenSaver).toBe(false);
    expect(getLlmSettings().model).toBe('gemini-3.1-pro-preview');
  });

  it('routes Olivia to the main model and specialists to the specialist model', () => {
    updateLlmSettings({ model: 'gemini-3.8-flash', specialistModel: 'gemini-3.5-flash-lite' });
    expect(modelForAgent(OLIVIA)).toBe('gemini-3.8-flash');
    expect(modelForAgent('agent-emma')).toBe('gemini-3.5-flash-lite');
    updateLlmSettings({ specialistModel: null });
    expect(modelForAgent('agent-emma')).toBe('gemini-3.8-flash');
  });

  it('ignores a tokenSaver value saved by an older version, because the user never chose it', () => {
    window.localStorage.setItem('virtual-company:llm-settings:v1', JSON.stringify({ model: 'gemini-3.1-pro-preview', specialistModel: null, thinking: 'low', tokenSaver: true }));
    expect(getLlmSettings().tokenSaver).toBe(false);
    expect(getLlmSettings().model).toBe('gemini-3.1-pro-preview');
    updateLlmSettings({ tokenSaver: true });
    expect(getLlmSettings().tokenSaver).toBe(true);
  });

  it('reads settings saved before the new fields existed', () => {
    window.localStorage.setItem('virtual-company:llm-settings:v1', JSON.stringify({ model: 'gemini-3.5-flash-lite' }));
    expect(getLlmSettings()).toEqual({ ...DEFAULT_LLM_SETTINGS, model: 'gemini-3.5-flash-lite' });
  });
});

function message(id: number, authorId: string, content: string): Message {
  return {
    id: `m${id}`,
    authorType: authorId === 'user' ? 'user' : 'agent',
    authorId,
    authorNameSnapshot: authorId === OLIVIA ? 'Olivia' : 'Emma',
    content,
    createdAt: id,
  };
}

function longMeeting(): Room {
  const bigBlock = (name: string) => `\n\n${name}\n\`\`\`json\n{"data":"${'z'.repeat(1500)}"}\n\`\`\``;
  const specialist = 'specialist analysis '.repeat(60);
  const messages: Message[] = [
    message(1, 'user', 'THE BRIEF'),
    message(2, OLIVIA, `Opening framing.${bigBlock('VC_STAFFING_PLAN')}`),
    ...Array.from({ length: 8 }, (_, index) => message(3 + index, 'agent-emma', `${specialist} early-${index}`)),
    message(11, OLIVIA, 'Round one synthesis: key points were X and Y.'),
    ...Array.from({ length: 8 }, (_, index) => message(12 + index, 'agent-emma', `${specialist} mid-${index}`)),
    message(20, OLIVIA, `Final proposal text.${bigBlock('VC_DECISION_PROPOSAL')}`),
    ...Array.from({ length: 4 }, (_, index) => message(21 + index, 'agent-emma', `${specialist} vote-${index}`)),
  ];
  return {
    id: 'r', name: 'Long', emoji: '🏢', agentIds: [OLIVIA, 'agent-emma'], messages, createdAt: 1,
  };
}

const chars = (messages: Message[]) => messages.reduce((sum, item) => sum + item.content.length, 0);

describe('token saver context', () => {
  it('compacts a mid-size meeting that normal mode still sends in full', () => {
    const room = longMeeting();
    const size = chars(room.messages);
    expect(size).toBeGreaterThan(SAVER_HISTORY_CHAR_LIMIT);
    expect(size).toBeLessThan(FULL_HISTORY_CHAR_LIMIT);

    expect(selectApiContext(room).compacted).toBe(false);
    const saver = selectApiContext(room, { tokenSaver: true });
    expect(saver.compacted).toBe(true);
    expect(chars(saver.messages)).toBeLessThan(size * 0.7);
  });

  it('keeps the brief, Olivia\'s summaries and the latest proposal, and drops bulky old blocks', () => {
    const { messages } = selectApiContext(longMeeting(), { tokenSaver: true });
    const text = messages.map(item => item.content).join('\n');

    expect(messages[0]?.content).toBe('THE BRIEF');
    expect(text).toContain('Opening framing.');
    expect(text).toContain('Round one synthesis: key points were X and Y.');
    expect(text).toContain('[structured block omitted from older context]');
    expect(text).not.toContain('VC_STAFFING_PLAN\n```json');
    // The decision proposal is what the vote is about: it must survive intact.
    expect(text).toContain(`VC_DECISION_PROPOSAL\n\`\`\`json\n{"data":"${'z'.repeat(1500)}"}`);
    expect(text).toContain('vote-3');
  });

  it('leaves short meetings untouched', () => {
    const room = longMeeting();
    const short = { ...room, messages: room.messages.slice(0, 6) };
    expect(selectApiContext(short, { tokenSaver: true }).compacted).toBe(false);
  });
});

describe('thinking effort and model routing on the wire', () => {
  const okFetch = () =>
    vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'ok' }] } }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
          }),
          { status: 200 },
        ),
      ),
    );
  const bodyOf = (fetchMock: ReturnType<typeof okFetch>, call = 0) =>
    JSON.parse((fetchMock.mock.calls[call] as [string, RequestInit])[1].body as string);

  it('sends low thinking by default and nothing when set to model default', async () => {
    setApiKey('gemini', 'KEY');
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    await runPromptViaApi('p', 'room-1');
    expect(bodyOf(fetchMock, 0).generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });

    updateLlmSettings({ thinking: 'default' });
    await runPromptViaApi('p', 'room-1');
    expect(bodyOf(fetchMock, 1).generationConfig.thinkingConfig).toBeUndefined();
  });

  it('uses the specialist model for specialists only', async () => {
    setApiKey('gemini', 'KEY');
    updateLlmSettings({ model: 'gemini-3.8-flash', specialistModel: 'gemini-3.5-flash-lite' });
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    await runPromptViaApi('p', 'room-1', undefined, 'agent-emma');
    await runPromptViaApi('p', 'room-1', undefined, OLIVIA);

    const urlOf = (call: number) => String((fetchMock.mock.calls[call] as [string, RequestInit])[0]);
    expect(urlOf(0)).toContain('gemini-3.5-flash-lite');
    expect(urlOf(1)).toContain('gemini-3.8-flash');
    expect(defaultAgents.some(agent => agent.id === 'agent-emma')).toBe(true);
    expect(defaultRoles.length).toBeGreaterThan(0);
  });

  it('drops a rejected thinking level, retries once, and stops sending it afterwards', async () => {
    setApiKey('gemini', 'KEY');
    let first = true;
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => {
      if (first) {
        first = false;
        return Promise.resolve(
          new Response(JSON.stringify({ error: { message: 'Unknown name "thinkingLevel": Cannot find field.' } }), { status: 400 }),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'ok' }] } }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
          }),
          { status: 200 },
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runPromptViaApi('p', 'room-1');
    expect(result.response.text).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string).generationConfig.thinkingConfig).toBeDefined();
    expect(JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string).generationConfig.thinkingConfig).toBeUndefined();

    await runPromptViaApi('p2', 'room-1');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse((fetchMock.mock.calls[2] as [string, RequestInit])[1].body as string).generationConfig.thinkingConfig).toBeUndefined();
  });

  it('does not swallow unrelated 400 errors', async () => {
    setApiKey('gemini', 'KEY');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: { message: 'Invalid API key format' } }), { status: 400 }))));
    await expect(runPromptViaApi('p', 'room-1')).rejects.toMatchObject({ kind: 'bad-request' });
  });
});
