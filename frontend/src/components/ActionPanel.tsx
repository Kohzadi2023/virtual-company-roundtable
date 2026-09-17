import { useEffect, useMemo, useRef, useState } from 'react';
import { AgentAvatar } from '@/components/AgentAvatar';
import { Toast, type ToastMessage } from '@/components/Toast';
import { copyText } from '@/lib/clipboard';
import { unseenMessagesForAgent } from '@/lib/contextDelta';
import { agentContextKey } from '@/lib/id';
import { buildAgentPrompt } from '@/lib/promptBuilder';
import { useWorkspaceStore } from '@/store/workspaceStore';

function useAutoResize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(Math.max(element.scrollHeight, 96), 360)}px`;
  }, [value]);
  return ref;
}

export function ActionPanel({ roomId }: { roomId: string }) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const agents = useWorkspaceStore(state => state.agents);
  const roles = useWorkspaceStore(state => state.roles);
  const agentContext = useWorkspaceStore(state => state.agentContext);
  const markAgentContextCopied = useWorkspaceStore(state => state.markAgentContextCopied);
  const addAgentMessage = useWorkspaceStore(state => state.addAgentMessage);
  const addUserMessage = useWorkspaceStore(state => state.addUserMessage);

  const roomAgents = useMemo(() => {
    if (!room) return [];
    const allowed = new Set(room.agentIds);
    return agents.filter(agent => allowed.has(agent.id));
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
  const cursor = room && selectedAgent ? agentContext[agentContextKey(room.id, selectedAgent.id)] : undefined;
  const unseen = room && selectedAgent ? unseenMessagesForAgent(room, selectedAgent.id, cursor) : [];

  if (!room) return null;

  const notify = (text: string, tone: ToastMessage['tone'] = 'success') => {
    setToast({ id: Date.now(), text, tone });
  };

  const sendUser = () => {
    if (!userMessage.trim()) return;
    if (addUserMessage(room.id, userMessage)) {
      setUserMessage('');
      notify('پیام User به Timeline اضافه شد.');
    }
  };

  const copyNewContext = async () => {
    if (!selectedAgent || !selectedRole || unseen.length === 0) return;
    try {
      await copyText(buildAgentPrompt(selectedAgent, selectedRole, unseen));
      markAgentContextCopied(room.id, selectedAgent.id);
      notify(`${unseen.length} پیام جدید برای ${selectedAgent.name} کپی شد.`);
    } catch {
      notify('کپی در Clipboard انجام نشد.', 'error');
    }
  };

  const submitAgent = () => {
    if (!selectedAgent || !agentResponse.trim()) return;
    if (addAgentMessage(room.id, selectedAgent.id, agentResponse)) {
      setAgentResponse('');
      notify(`نظر ${selectedAgent.name} به Timeline اضافه شد.`);
    }
  };

  return (
    <section className="border-t border-slate-800 bg-slate-950/95 p-3" aria-label="پنل عملیات">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/75 shadow-xl">
        <div className="grid grid-cols-2 border-b border-slate-700" role="tablist" aria-label="نوع عملیات">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'user'}
            onClick={() => setTab('user')}
            className={`px-4 py-3 text-sm font-medium ${tab === 'user' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            👤 User Message
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'agent'}
            onClick={() => setTab('agent')}
            className={`px-4 py-3 text-sm font-medium ${tab === 'agent' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            🤖 Agent Response
          </button>
        </div>

        {tab === 'user' ? (
          <div className="p-4" role="tabpanel">
            <label htmlFor="user-message" className="mb-2 block text-xs font-medium text-slate-400">پیام User</label>
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
              placeholder="پیام خود را بنویسید… Ctrl+Enter برای ثبت"
              className="w-full resize-none overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-3 text-start text-sm placeholder:text-slate-600"
            />
            <div className="mt-2 flex justify-end">
              <button type="button" onClick={sendUser} disabled={!userMessage.trim()} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50">ارسال پیام</button>
            </div>
          </div>
        ) : (
          <div className="p-4" role="tabpanel">
            {roomAgents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-sm text-slate-400">هیچ متخصصی در این اتاق حضور ندارد.</div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
                <div>
                  <label htmlFor="agent-select" className="mb-2 block text-xs font-medium text-slate-400">انتخاب متخصص</label>
                  <select id="agent-select" value={selectedAgentId} onChange={event => setSelectedAgentId(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm">
                    {roomAgents.map(agent => {
                      const role = roles.find(item => item.id === agent.roleId);
                      return <option key={agent.id} value={agent.id}>{agent.name} · {role?.name ?? 'Specialist'}</option>;
                    })}
                  </select>

                  {selectedAgent && selectedRole && (
                    <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                      <AgentAvatar agent={selectedAgent} role={selectedRole} size="lg" />
                      <div className="min-w-0">
                        <div className="font-semibold">{selectedAgent.name}</div>
                        <div className="text-xs text-indigo-300">{selectedRole.name}</div>
                        <div className="mt-1 truncate text-[11px] text-slate-500">{selectedRole.skills.join(' · ')}</div>
                      </div>
                    </div>
                  )}

                  <button type="button" onClick={copyNewContext} disabled={!selectedAgent || unseen.length === 0} className="mt-3 w-full rounded-xl bg-sky-600 px-3 py-2.5 text-sm font-semibold hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-45">
                    {unseen.length > 0 ? `📋 Copy New Context · ${unseen.length}` : '✓ Agent is up to date'}
                  </button>
                  <p className="mt-2 text-[11px] leading-5 text-slate-500">فقط پیام‌هایی کپی می‌شوند که این متخصص هنوز ندیده است.</p>
                </div>

                <div>
                  <label htmlFor="agent-response" className="mb-2 block text-xs font-medium text-slate-400">پاسخ {selectedAgent?.name ?? 'Agent'} را Paste کنید</label>
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
                    placeholder="فقط نظر Agent را Paste کنید… Ctrl+Enter برای ثبت"
                    className="w-full resize-none overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-3 text-start text-sm placeholder:text-slate-600"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button type="button" onClick={() => setAgentResponse('')} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">پاک کردن</button>
                    <button type="button" onClick={submitAgent} disabled={!selectedAgent || !agentResponse.trim()} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold hover:bg-emerald-500 disabled:opacity-50">ثبت نظر {selectedAgent?.name ?? ''}</button>
                  </div>
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
