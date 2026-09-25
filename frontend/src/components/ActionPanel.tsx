import { useEffect, useMemo, useRef, useState } from 'react';
import { ContextCopyControls } from '@/components/ContextCopyControls';
import { Toast, type ToastMessage } from '@/components/Toast';
import { readText } from '@/lib/clipboard';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import {
  agentIdForExtensionChatUrl,
  EXTENSION_RESPONSE_EVENT,
  type ExtensionResponseEvent,
} from '@/lib/extensionBridge';
import { agentContextKey } from '@/lib/id';
import { getExternalAgentChat, loadMeetingOrchestration, MEETING_ORCHESTRATION_EVENT } from '@/lib/meetingOrchestration';
import { advanceAfterAgentResponse } from '@/lib/meetingResponseFlow';
import { useWorkspaceStore } from '@/store/workspaceStore';

function useAutoResize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(Math.max(element.scrollHeight, 56), 220)}px`;
  }, [value]);
  return ref;
}

function ToolButton({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="grid h-8 min-w-8 place-items-center rounded-md px-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
    >
      {label}
    </button>
  );
}

export function ActionPanel({ roomId }: { roomId: string }) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const agents = useWorkspaceStore(state => state.agents);
  const roles = useWorkspaceStore(state => state.roles);
  const agentContext = useWorkspaceStore(state => state.agentContext);
  const addAgentMessage = useWorkspaceStore(state => state.addAgentMessage);
  const addUserMessage = useWorkspaceStore(state => state.addUserMessage);

  const roomAgents = useMemo(() => {
    if (!room) return [];
    const allowed = new Set(room.agentIds);
    return agents
      .filter(agent => allowed.has(agent.id))
      .sort((left, right) => {
        if (left.id === MEETING_FACILITATOR_AGENT_ID) return -1;
        if (right.id === MEETING_FACILITATOR_AGENT_ID) return 1;
        return 0;
      });
  }, [agents, room]);

  const [tab, setTab] = useState<'user' | 'agent'>('user');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [userMessage, setUserMessage] = useState('');
  const [agentResponse, setAgentResponse] = useState('');
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const userRef = useAutoResize(userMessage);
  const agentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (roomAgents.some(agent => agent.id === selectedAgentId)) return;
    setSelectedAgentId(roomAgents[0]?.id ?? '');
  }, [roomAgents, selectedAgentId]);

  useEffect(() => {
    const syncActiveSpeaker = () => {
      const activeSpeakerId = loadMeetingOrchestration().rooms[roomId]?.activeSpeakerId;
      if (activeSpeakerId && roomAgents.some(agent => agent.id === activeSpeakerId)) setSelectedAgentId(activeSpeakerId);
    };
    syncActiveSpeaker();
    window.addEventListener(MEETING_ORCHESTRATION_EVENT, syncActiveSpeaker);
    return () => window.removeEventListener(MEETING_ORCHESTRATION_EVENT, syncActiveSpeaker);
  }, [roomAgents, roomId]);

  useEffect(() => setAgentResponse(''), [selectedAgentId, roomId]);

  useEffect(() => {
    const handleExtensionResponse = (event: Event) => {
      const detail = (event as ExtensionResponseEvent).detail;
      const content = detail?.content?.trim();
      if (!content) return;
      const agentId = agentIdForExtensionChatUrl(detail.chatUrl);
      const agent = agentId ? roomAgents.find(item => item.id === agentId) : undefined;
      if (!agent) return;

      if (agent.id !== selectedAgentId) {
        setToast({ id: Date.now(), text: `Captured a response for ${agent.name}, but they aren't selected. Switch the response selector to ${agent.name} to review it.`, tone: 'info' });
        return;
      }

      setTab('agent');
      setAgentResponse(content);
      const chat = getExternalAgentChat(agent.id);
      setToast({ id: Date.now(), text: `${agent.name}'s response captured automatically from ${chat?.provider ?? 'the linked chat'}. Review it before adding.` });
    };

    window.addEventListener(EXTENSION_RESPONSE_EVENT, handleExtensionResponse);
    return () => window.removeEventListener(EXTENSION_RESPONSE_EVENT, handleExtensionResponse);
  }, [roomAgents, selectedAgentId]);

  const selectedAgent = roomAgents.find(agent => agent.id === selectedAgentId);
  const selectedRole = selectedAgent ? roles.find(role => role.id === selectedAgent.roleId) : undefined;
  const selectedIsFacilitator = selectedAgent?.id === MEETING_FACILITATOR_AGENT_ID;
  const cursor = room && selectedAgent ? agentContext[agentContextKey(room.id, selectedAgent.id)] : undefined;

  if (!room) return null;

  const notify = (text: string, tone: ToastMessage['tone'] = 'success') => {
    setToast({ id: Date.now(), text, tone });
  };

  const sendUser = () => {
    if (!userMessage.trim()) return;
    if (addUserMessage(room.id, userMessage)) {
      setUserMessage('');
      notify('User message added to the discussion.');
    }
  };

  const submitAgent = () => {
    if (!selectedAgent || !agentResponse.trim()) return;
    if (addAgentMessage(room.id, selectedAgent.id, agentResponse)) {
      setAgentResponse('');
      const advance = advanceAfterAgentResponse(room.id, selectedAgent.id);

      if (advance.advanced) {
        const nextSpeaker = loadMeetingOrchestration().rooms[room.id]?.activeSpeakerId;
        if (nextSpeaker && room.agentIds.includes(nextSpeaker)) setSelectedAgentId(nextSpeaker);
        notify(`${selectedAgent.name}'s response added and speaking queue advanced.`);
        return;
      }

      if (advance.reason === 'staffing-plan-missing') {
        notify("Olivia's response was saved, but no valid staffing plan was detected. The meeting is paused in staffing.", 'info');
        return;
      }
      if (advance.reason === 'staffing-plan-pending-approval') {
        notify("Olivia's staffing plan is ready. Review it above and click Invite Team before the meeting continues.", 'info');
        return;
      }
      if (advance.reason === 'staffing-not-ready') {
        const blockerCount = advance.readiness?.blockers.length ?? 0;
        notify(`Olivia's response was saved, but ${blockerCount || 'required'} staffing blocker${blockerCount === 1 ? '' : 's'} remain. The meeting is paused.`, 'info');
        return;
      }
      notify('The response was saved, but the meeting room could not be advanced.', 'error');
    }
  };

  const pasteAgentResponse = async () => {
    if (!selectedAgent) return;

    try {
      const clipboardText = await readText();
      if (!clipboardText) {
        notify('Clipboard is empty.', 'error');
        return;
      }
      if (clipboardText.trim() === agentResponse.trim()) return;

      const element = agentRef.current;
      const hasFocusedTextarea = element && document.activeElement === element;
      const start = hasFocusedTextarea ? element.selectionStart : agentResponse.length;
      const end = hasFocusedTextarea ? element.selectionEnd : agentResponse.length;
      const needsSeparator = !hasFocusedTextarea && agentResponse.length > 0 && !agentResponse.endsWith('\n');
      const insertion = `${needsSeparator ? '\n\n' : ''}${clipboardText}`;
      const next = `${agentResponse.slice(0, start)}${insertion}${agentResponse.slice(end)}`;
      const caret = start + insertion.length;

      setAgentResponse(next);
      requestAnimationFrame(() => {
        if (!element) return;
        element.focus();
        element.setSelectionRange(caret, caret);
      });
      notify(`Clipboard pasted into ${selectedAgent.name}'s response. Review it before adding.`);
    } catch {
      notify('Could not read clipboard. Use Ctrl+V instead.', 'error');
    }
  };

  const formatUser = (before: string, after = before) => {
    const element = userRef.current;
    if (!element) return;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = userMessage.slice(start, end);
    const next = `${userMessage.slice(0, start)}${before}${selected || 'text'}${after}${userMessage.slice(end)}`;
    setUserMessage(next);
    requestAnimationFrame(() => element.focus());
  };

  return (
    <section className="shrink-0 bg-[#f8fafc] px-4 pb-3" aria-label="Discussion actions">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
          <label htmlFor="message-mode" className="sr-only">Message type</label>
          <select
            id="message-mode"
            value={tab}
            onChange={event => setTab(event.target.value as 'user' | 'agent')}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          >
            <option value="user">👤 User Message</option>
            <option value="agent">🤖 Agent Response</option>
          </select>

          {tab === 'agent' ? (
            <>
              <label htmlFor="agent-select" className="sr-only">Agent response source</label>
              <select
                id="agent-select"
                value={selectedAgentId}
                onChange={event => setSelectedAgentId(event.target.value)}
                disabled={roomAgents.length === 0}
                className="min-w-0 max-w-[360px] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 disabled:opacity-50"
              >
                {roomAgents.map(agent => {
                  const role = roles.find(item => item.id === agent.roleId);
                  const facilitator = agent.id === MEETING_FACILITATOR_AGENT_ID;
                  return <option key={agent.id} value={agent.id}>{facilitator ? '★ ' : ''}{agent.name} · {facilitator ? 'Meeting Facilitator' : role?.name ?? 'Specialist'}</option>;
                })}
              </select>
              {selectedAgent ? (
                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${selectedIsFacilitator ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-600'}`}>
                  {selectedIsFacilitator ? 'FACILITATOR' : selectedRole?.name ?? 'SPECIALIST'}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-[11px] text-slate-400">Send a new message as User</span>
          )}
        </div>

        {tab === 'user' ? (
          <div className="flex flex-col items-stretch gap-2 p-2 sm:flex-row" role="tabpanel">
            <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100">
              <textarea
                key="user-message"
                id="user-message"
                ref={userRef}
                dir="auto"
                value={userMessage}
                onChange={event => setUserMessage(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    sendUser();
                  }
                }}
                placeholder="Type your message here..."
                className="block w-full resize-none overflow-y-auto border-0 bg-transparent px-3 py-2.5 text-start text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
              <div className="flex items-center gap-1.5 border-t border-slate-100 px-2 py-1">
                <ToolButton label="B" title="Bold" onClick={() => formatUser('**')} />
                <ToolButton label="I" title="Italic" onClick={() => formatUser('_')} />
                <ToolButton label="</>" title="Inline code" onClick={() => formatUser('`')} />
                <ToolButton label="❝" title="Quote" onClick={() => setUserMessage(value => `${value}${value ? '\n' : ''}> `)} />
                <span className="mx-1 h-4 w-px bg-slate-200" />
                <ToolButton label="☷" title="List" onClick={() => setUserMessage(value => `${value}${value ? '\n' : ''}- `)} />
                <ToolButton label="🔗" title="Link" onClick={() => formatUser('[', '](https://)')} />
                <ToolButton label="☺" title="Emoji" onClick={() => setUserMessage(value => `${value} 🙂`)} />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:w-36 sm:flex-col sm:justify-end">
              <button type="button" onClick={sendUser} disabled={!userMessage.trim()} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">✈ Send</button>
              <span className="hidden text-center text-[10px] text-slate-400 sm:block">Ctrl + Enter</span>
            </div>
          </div>
        ) : (
          <div className="p-2" role="tabpanel">
            {roomAgents.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">No specialists are in this room.</div>
            ) : (
              <div className="grid gap-2 xl:grid-cols-[1fr_220px]">
                <textarea
                  key="agent-response"
                  id="agent-response"
                  ref={agentRef}
                  dir="auto"
                  value={agentResponse}
                  onChange={event => setAgentResponse(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      submitAgent();
                    }
                  }}
                  placeholder={`Paste ${selectedAgent?.name ?? 'Agent'}'s response here...`}
                  className="h-[180px] w-full resize-none overflow-y-auto rounded-lg border border-slate-300 bg-white p-3 text-start text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 xl:h-full"
                />

                <div className="flex flex-col justify-center gap-2">
                  {selectedAgent && selectedRole ? <ContextCopyControls room={room} agent={selectedAgent} role={selectedRole} cursor={cursor} onNotify={notify} /> : null}
                  <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
                    <button type="button" onClick={pasteAgentResponse} disabled={!selectedAgent} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40">📋 Paste</button>
                    <button type="button" onClick={submitAgent} disabled={!selectedAgent || !agentResponse.trim()} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">Add Response</button>
                  </div>
                  <span className="text-center text-[10px] text-slate-400">Ctrl + Enter adds response</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </section>
  );
}
