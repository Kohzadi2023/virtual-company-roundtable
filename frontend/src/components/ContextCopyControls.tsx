import { useEffect, useMemo, useRef, useState } from 'react';
import { copyText } from '@/lib/clipboard';
import {
  CONTEXT_MODES,
  decoratePromptForContextMode,
  estimatePromptSize,
  messagesForContextMode,
  preferredContextModeForMeetingTurn,
  type ContextCopyMode,
} from '@/lib/contextModes';
import { isValidExternalChatUrl, normalizeExternalChatUrl } from '@/lib/externalChatLink';
import { openOrFocusExternalChat } from '@/lib/externalChatWindow';
import {
  getExternalAgentChat,
  loadMeetingOrchestration,
  MEETING_ORCHESTRATION_EVENT,
  setExternalAgentChat,
} from '@/lib/meetingOrchestration';
import { buildApiTurnPrompt } from '@/lib/llm/apiContext';
import { describeLlmError, formatUsd, isCancelled, runPromptViaApi } from '@/lib/llm/apiRun';
import { loadBudgetState, meetingSpendUsd } from '@/lib/llm/budget';
import { hasApiKey } from '@/lib/llm/credentials';
import { LLM_CHANGE_EVENT, getLlmSettings } from '@/lib/llm/llmSettings';
import { estimateCostUsd } from '@/lib/llm/pricing';
import { buildAgentPrompt } from '@/lib/promptBuilder';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { Agent, AgentContextState, RoleDefinition, Room } from '@/types/domain';

interface ContextCopyControlsProps {
  room: Room;
  agent: Agent;
  role: RoleDefinition;
  cursor?: AgentContextState | undefined;
  onNotify: (text: string, tone?: 'success' | 'error') => void;
  /** Receives the API's answer (and its estimated cost) so the panel can add it to the room. */
  onApiResponse?: ((agentId: string, text: string, costUsd: number) => void) | undefined;
}

function canOpen(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function messageLabel(content: string): string {
  const clean = content.replace(/\s+/g, ' ').trim();
  return clean.length > 88 ? `${clean.slice(0, 85)}…` : clean;
}

export function ContextCopyControls({ room, agent, role, cursor, onNotify, onApiResponse }: ContextCopyControlsProps) {
  const markAgentContextCopied = useWorkspaceStore(state => state.markAgentContextCopied);
  const [, setMeetingRevision] = useState(0);
  const meeting = loadMeetingOrchestration().rooms[room.id];
  const preferredMode = preferredContextModeForMeetingTurn(
    agent.id,
    meeting?.activeSpeakerId,
    meeting?.roundStage,
  );
  const [, setLlmRevision] = useState(0);
  const [apiRunning, setApiRunning] = useState(false);
  const apiAbort = useRef<AbortController | null>(null);
  const [mode, setMode] = useState<ContextCopyMode>(preferredMode);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  // The only other place to link an agent's external chat is the separate
  // Meeting Orchestration modal. Someone who pastes a response here without
  // having set that link first had no way to add it without leaving this
  // panel, so offer the same save flow inline.
  const [linkDraftOpen, setLinkDraftOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState('');

  const messages = useMemo(() => messagesForContextMode(room, agent.id, cursor, mode), [agent.id, cursor, mode, room]);
  const selectedMessages = useMemo(() => messages.filter(message => !excludedIds.includes(message.id)), [excludedIds, messages]);
  const prompt = useMemo(() => decoratePromptForContextMode(buildAgentPrompt(agent, role, selectedMessages), mode), [agent, mode, role, selectedMessages]);
  const size = useMemo(() => estimatePromptSize(prompt), [prompt]);
  const externalChat = getExternalAgentChat(agent.id);
  const externalChatUrl = canOpen(externalChat?.url) ? externalChat.url : null;
  // buildAgentPrompt() always injects a round-aware section for whichever
  // agent this is -- oliviaMeetingSection() for the facilitator,
  // specialistMeetingSection() for everyone else -- regardless of whether
  // any messages are new. So the prompt is never actually empty even at
  // 0/0 messages; blocking Copy purely on the message-delta count left an
  // agent unreachable right when a new round opened with no fresh messages
  // yet (reported live for Olivia, but the same unconditional-section
  // pattern now applies to every agent).
  const disabled = false;
  const apiAvailable = hasApiKey('gemini') && onApiResponse !== undefined;
  const meetingApiSpend = apiAvailable ? meetingSpendUsd(loadBudgetState().entries, room.id) : 0;
  const large = size.approxTokens >= 8000;
  const veryLarge = size.approxTokens >= 16000;

  useEffect(() => {
    const refresh = () => setMeetingRevision(value => value + 1);
    window.addEventListener(MEETING_ORCHESTRATION_EVENT, refresh);
    return () => window.removeEventListener(MEETING_ORCHESTRATION_EVENT, refresh);
  }, [room.id]);

  useEffect(() => {
    const refresh = () => setLlmRevision(value => value + 1);
    window.addEventListener(LLM_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(LLM_CHANGE_EVENT, refresh);
  }, []);

  // A reply that arrives after the user switched agent or room would land in the
  // wrong response box, so leaving cancels the in-flight request.
  useEffect(() => () => apiRunCancel(), [agent.id, room.id]);

  useEffect(() => {
    setMode(preferredMode);
    setPreviewOpen(false);
  }, [agent.id, preferredMode, room.id]);

  useEffect(() => setExcludedIds([]), [agent.id, mode, room.id]);

  useEffect(() => {
    setLinkDraftOpen(false);
    setLinkDraft('');
    setLinkError('');
  }, [agent.id, room.id]);

  const saveLink = async () => {
    const normalized = normalizeExternalChatUrl(linkDraft);
    if (!isValidExternalChatUrl(normalized)) {
      setLinkError('Enter a valid conversation URL.');
      return;
    }
    setLinkError('');
    setLinkSaving(true);
    setExternalAgentChat(agent.id, normalized);
    setLinkSaving(false);
    setLinkDraftOpen(false);
    setLinkDraft('');
    onNotify(`Chat link saved for ${agent.name}.`);
  };

  const apiRunCancel = () => {
    apiAbort.current?.abort();
    apiAbort.current = null;
  };

  const runViaApi = async () => {
    if (apiAbort.current) return;
    const controller = new AbortController();
    apiAbort.current = controller;
    setApiRunning(true);
    try {
      // A stateless call has no chat memory behind it, so it gets the full
      // discussion rather than the copy/paste "new since last copy" prompt.
      const apiPrompt = buildApiTurnPrompt(room, agent, role, { tokenSaver: getLlmSettings().tokenSaver, answerLength: getLlmSettings().answerLength }).prompt;
      const { response, model } = await runPromptViaApi(apiPrompt, room.id, controller.signal, agent.id);
      const cost = estimateCostUsd(model, response.usage);
      markAgentContextCopied(room.id, agent.id);
      onApiResponse?.(agent.id, response.text, cost);
    } catch (error) {
      if (!isCancelled(error)) onNotify(describeLlmError(error), 'error');
    } finally {
      if (apiAbort.current === controller) apiAbort.current = null;
      if (apiAbort.current === null) setApiRunning(false);
    }
  };

  const copy = async () => {
    if (disabled) return;
    try {
      await copyText(prompt);
      markAgentContextCopied(room.id, agent.id);
      onNotify(`${CONTEXT_MODES.find(item => item.value === mode)?.label ?? 'Context'} copied for ${agent.name}.`);
    } catch {
      onNotify('Could not copy to clipboard.', 'error');
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <select value={mode} onChange={event => setMode(event.target.value as ContextCopyMode)} className="w-auto min-w-[150px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700" aria-label="Context mode">
          {CONTEXT_MODES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <div
          className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold leading-4 ${veryLarge ? 'border-rose-200 bg-rose-50 text-rose-700' : large ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
          title={`${CONTEXT_MODES.find(item => item.value === mode)?.description ?? ''}${large ? (veryLarge ? ' Very large context: use Smart Compact or remove messages in Preview.' : ' Large context: Preview lets you remove unnecessary messages.') : ''}`}
        >
          {selectedMessages.length}/{messages.length} messages · ~{size.approxTokens.toLocaleString()} tokens{large ? (veryLarge ? ' · very large' : ' · large') : ''}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setPreviewOpen(true)} disabled={disabled} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Preview / Select</button>
          <button type="button" onClick={copy} disabled={disabled} className="rounded-lg border border-blue-500 bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-600 hover:bg-blue-100 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400">⧉ Copy</button>
        </div>
        {apiAvailable ? (
          <div className="flex items-center gap-2">
            {apiRunning ? (
              <button type="button" onClick={apiRunCancel} className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-[12px] font-bold text-slate-600 hover:bg-slate-100">Running via API… Cancel</button>
            ) : (
              <button type="button" onClick={() => void runViaApi()} title="Sends the full room discussion (not just new messages), because the API keeps no chat memory" className="rounded-lg border border-violet-400 bg-white px-3 py-1.5 text-[12px] font-bold text-violet-700 hover:bg-violet-50">⚡ Run via API</button>
            )}
            <div className="text-[12px] text-slate-500" title="Estimated API spend in this meeting">API spend {formatUsd(meetingApiSpend)}</div>
          </div>
        ) : null}
        {externalChat && externalChatUrl ? (
          <button type="button" onClick={() => openOrFocusExternalChat(agent.id, externalChatUrl)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 hover:bg-slate-50">Open / Focus {externalChat.provider} Chat ↗</button>
        ) : linkDraftOpen ? (
          <div className="basis-full space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <input
              autoFocus
              value={linkDraft}
              onChange={event => setLinkDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') void saveLink();
                if (event.key === 'Escape') { setLinkDraftOpen(false); setLinkDraft(''); setLinkError(''); }
              }}
              disabled={linkSaving}
              placeholder="chatgpt.com/c/..."
              aria-label={`External chat URL for ${agent.name}`}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
            />
            {linkError ? <div className="text-[12px] font-medium text-red-600">{linkError}</div> : null}
            <div className="flex gap-1.5">
              <button type="button" onClick={() => void saveLink()} disabled={linkSaving} className="flex-1 rounded-md bg-blue-600 px-2 py-1.5 text-[12px] font-bold text-white hover:bg-blue-700 disabled:opacity-50">{linkSaving ? 'Saving…' : 'Save'}</button>
              <button type="button" onClick={() => { setLinkDraftOpen(false); setLinkDraft(''); setLinkError(''); }} disabled={linkSaving} className="rounded-md px-2 py-1.5 text-[12px] font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setLinkDraftOpen(true)} className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-1.5 text-[12px] font-semibold text-slate-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">+ Add {agent.name}’s Chat Link</button>
        )}
      </div>

      {previewOpen ? (
        <div className="fixed inset-0 z-[140] grid place-items-center bg-slate-950/50 p-5" onMouseDown={event => { if (event.target === event.currentTarget) setPreviewOpen(false); }}>
          <section className="flex h-[84vh] w-[min(1180px,96vw)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Context preview">
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div><h2 className="text-base font-bold text-slate-900">Context Preview · {agent.name}</h2><p className="mt-0.5 text-xs text-slate-500">{CONTEXT_MODES.find(item => item.value === mode)?.label} · {selectedMessages.length}/{messages.length} messages · {size.words.toLocaleString()} words · ~{size.approxTokens.toLocaleString()} tokens</p></div>
              <button type="button" onClick={() => setPreviewOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">✕</button>
            </header>
            <div className="grid min-h-0 flex-1 grid-cols-[340px_1fr] divide-x divide-slate-200">
              <aside className="min-h-0 overflow-y-auto bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between"><span className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Include messages</span><div className="flex gap-1"><button type="button" onClick={() => setExcludedIds([])} className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px]">All</button><button type="button" onClick={() => setExcludedIds(messages.map(message => message.id))} className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px]">None</button></div></div>
                <div className="space-y-1.5">{messages.map(message => { const included = !excludedIds.includes(message.id); return <label key={message.id} className={`flex cursor-pointer gap-2 rounded-lg border p-2 ${included ? 'border-blue-100 bg-white' : 'border-slate-200 bg-slate-100 opacity-60'}`}><input type="checkbox" checked={included} onChange={() => setExcludedIds(current => included ? [...current, message.id] : current.filter(id => id !== message.id))} /><span className="min-w-0"><span className="block text-[12px] font-bold uppercase text-slate-500">{message.authorNameSnapshot ?? (message.authorType === 'user' ? 'User' : 'Agent')}</span><span className="block text-[12px] leading-4 text-slate-600">{messageLabel(message.content)}</span></span></label>; })}</div>
              </aside>
              <pre className="min-h-0 overflow-auto whitespace-pre-wrap px-5 py-4 text-xs leading-5 text-slate-700">{prompt}</pre>
            </div>
            <footer className="flex items-center justify-between gap-2 border-t border-slate-200 px-5 py-3"><span className={`text-[12px] font-semibold ${large ? 'text-amber-600' : 'text-slate-500'}`}>{large ? 'Consider removing low-value history or switching to Smart Compact.' : 'The preview is exactly what will be copied.'}</span><div className="flex gap-2"><button type="button" onClick={() => setPreviewOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600">Close</button><button type="button" disabled={selectedMessages.length === 0} onClick={async () => { await copy(); setPreviewOpen(false); }} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40">⧉ Copy Selected Context</button></div></footer>
          </section>
        </div>
      ) : null}
    </>
  );
}