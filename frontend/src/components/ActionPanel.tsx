import { useEffect, useMemo, useRef, useState } from 'react';
import { AgentAvatar } from '@/components/AgentAvatar';
import { ContextCopyControls } from '@/components/ContextCopyControls';
import { Toast, type ToastMessage } from '@/components/Toast';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { agentContextKey } from '@/lib/id';
import { loadMeetingOrchestration, markSpeakerStatus } from '@/lib/meetingOrchestration';
import { useWorkspaceStore } from '@/store/workspaceStore';

function useAutoResize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(Math.max(element.scrollHeight, 72), 260)}px`;
  }, [value]);
  return ref;
}

function ToolButton({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="grid h-9 min-w-9 place-items-center rounded-lg px-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
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
  const agentRef = useAutoResize(agentResponse);

  useEffect(() => {
    if (roomAgents.some(agent => agent.id === selectedAgentId)) return;
    setSelectedAgentId(roomAgents[0]?.id ?? '');
  }, [roomAgents, selectedAgentId]);

  useEffect(() => setAgentResponse(''), [selectedAgentId, roomId]);

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
      markSpeakerStatus(room.id, selectedAgent.id, 'responded');
      const nextSpeaker = loadMeetingOrchestration().rooms[room.id]?.activeSpeakerId;
      if (nextSpeaker && room.agentIds.includes(nextSpeaker)) setSelectedAgentId(nextSpeaker);
      notify(`${selectedAgent.name}'s response added and speaking queue advanced.`);
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

  const tabClass = (active: boolean) => `relative px-4 py-3 text-center transition ${active
    ? 'bg-white text-slate-900 shadow-[inset_0_-2px_0_#2563eb]'
    : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`;

  return (
    <section className="shrink-0 bg-[#f8fafc] px-4 pb-3" aria-label="Discussion actions">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50" role="tablist" aria-label="Action type">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'user'}
            onClick={() => setTab('user')}
            className={tabClass(tab === 'user')}
          >
            <span className="block text-sm font-semibold">👤 User Message</span>
            <span className={`mt-0.5 block text-xs ${tab === 'user' ? 'text-blue-600' : 'text-slate-400'}`}>Send a new message as User</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'agent'}
            onClick={() => setTab('agent')}
            className={`${tabClass(tab === 'agent')} border-s border-slate-200`}
          >
            <span className="block text-sm font-semibold">🤖 Agent Response</span>
            <span className={`mt-0.5 block text-xs ${tab === 'agent' ? 'text-blue-600' : 'text-slate-400'}`}>Facilitator first · then specialist contributions</span>
          </button>
        </div>

        {tab === 'user' ? (
          <div className="flex items-stretch gap-3 p-2" role="tabpanel">
            <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100">
              <textarea
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
                className="block w-full resize-none overflow-y-auto border-0 bg-transparent px-3 py-3 text-start text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
              <div className="flex items-center gap-2 border-t border-slate-100 px-2 py-1.5">
                <ToolButton label="B" title="Bold" onClick={() => formatUser('**')} />
                <ToolButton label="I" title="Italic" onClick={() => formatUser('_')} />
                <ToolButton label="</>" title="Inline code" onClick={() => formatUser('`')} />
                <ToolButton label="❝" title="Quote" onClick={() => setUserMessage(value => `${value}${value ? '\n' : ''}> `)} />
                <span className="mx-1 h-5 w-px bg-slate-200" />
                <ToolButton label="☷" title="List" onClick={() => setUserMessage(value => `${value}${value ? '\n' : ''}- `)} />
                <ToolButton label="🔗" title="Link" onClick={() => formatUser('[', '](https://)')} />
                <ToolButton label="☺" title="Emoji" onClick={() => setUserMessage(value => `${value} 🙂`)} />
              </div>
            </div>
            <div className="flex w-40 shrink-0 flex-col items-stretch justify-end gap-2 pe-1 pb-1">
              <button type="button" onClick={sendUser} disabled={!userMessage.trim()} className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">✈ Send Message</button>
              <span className="text-center text-xs text-slate-500">Ctrl + Enter</span>
            </div>
          </div>
        ) : (
          <div className="p-3" role="tabpanel">
            {roomAgents.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">No specialists are in this room.</div>
            ) : (
              <div className="grid gap-3 xl:grid-cols-[280px_1fr_230px]">
                <div className="space-y-2">
                  <select id="agent-select" value={selectedAgentId} onChange={event => setSelectedAgentId(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800">
                    {roomAgents.map(agent => {
                      const role = roles.find(item => item.id === agent.roleId);
                      const facilitator = agent.id === MEETING_FACILITATOR_AGENT_ID;
                      return <option key={agent.id} value={agent.id}>{facilitator ? '★ ' : ''}{agent.name} · {facilitator ? 'Meeting Facilitator' : role?.name ?? 'Specialist'}</option>;
                    })}
                  </select>
                  {selectedAgent && selectedRole && (
                    <div className={`flex items-center gap-3 rounded-lg p-2.5 ${selectedIsFacilitator ? 'border border-violet-200 bg-violet-50' : 'bg-slate-50'}`}>
                      <AgentAvatar agent={selectedAgent} role={selectedRole} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-bold text-slate-900">{selectedAgent.name}</div>
                          {selectedIsFacilitator ? <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">FACILITATOR</span> : null}
                        </div>
                        <div className="truncate text-xs text-slate-500">{selectedIsFacilitator ? 'Meeting Facilitator · Operations' : selectedRole.name}</div>
                      </div>
                    </div>
                  )}
                </div>

                <textarea
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
                  className="w-full resize-none overflow-y-auto rounded-lg border border-slate-300 bg-white p-3 text-start text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                />

                <div className="flex flex-col justify-center gap-2">
                  {selectedAgent && selectedRole ? <ContextCopyControls room={room} agent={selectedAgent} role={selectedRole} cursor={cursor} onNotify={notify} /> : null}
                  <button type="button" onClick={submitAgent} disabled={!selectedAgent || !agentResponse.trim()} className="rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">Add Response</button>
                  <span className="text-center text-[11px] text-slate-400">Ctrl + Enter</span>
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
