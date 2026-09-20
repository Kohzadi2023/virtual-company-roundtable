import { useEffect, useState } from 'react';
import { AgentAvatar } from '@/components/AgentAvatar';
import { isValidExternalChatUrl, normalizeExternalChatUrl } from '@/lib/externalChatLink';
import type { ExternalChatProvider, SpeakerStatus } from '@/lib/meetingOrchestration';
import type { Agent, RoleDefinition } from '@/types/domain';

export interface MeetingAgentRowData {
  agent: Agent;
  role?: RoleDefinition | undefined;
  status: SpeakerStatus;
  active: boolean;
  facilitator: boolean;
  provider?: ExternalChatProvider | undefined;
  chatUrl?: string | undefined;
}

interface MeetingAgentRowProps {
  data: MeetingAgentRowData;
  onActivate: (agentId: string) => void;
  onToggleSkip: (agentId: string, status: SpeakerStatus) => void;
  onSaveChat: (agentId: string, url: string) => void | Promise<void>;
  onOpenChat: (agentId: string, url: string) => void;
}

type EditState = 'idle' | 'editing' | 'saving' | 'removing';

function statusClasses(status: SpeakerStatus): string {
  if (status === 'responded') return 'bg-emerald-100 text-emerald-700 ring-emerald-200';
  if (status === 'skipped') return 'bg-slate-100 text-slate-500 ring-slate-200';
  return 'bg-amber-50 text-amber-700 ring-amber-200';
}

function providerClasses(provider?: ExternalChatProvider): string {
  switch (provider) {
    case 'ChatGPT': return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'Gemini': return 'bg-blue-50 text-blue-700 ring-blue-200';
    case 'Claude': return 'bg-orange-50 text-orange-700 ring-orange-200';
    case 'Copilot': return 'bg-cyan-50 text-cyan-700 ring-cyan-200';
    case 'DeepSeek': return 'bg-indigo-50 text-indigo-700 ring-indigo-200';
    case 'Qwen': return 'bg-violet-50 text-violet-700 ring-violet-200';
    case 'Grok': return 'bg-slate-100 text-slate-800 ring-slate-300';
    case 'META': return 'bg-blue-50 text-blue-800 ring-blue-200';
    default: return 'bg-slate-100 text-slate-600 ring-slate-200';
  }
}

export function MeetingAgentRow({ data, onActivate, onToggleSkip, onSaveChat, onOpenChat }: MeetingAgentRowProps) {
  const [editState, setEditState] = useState<EditState>('idle');
  const [draftUrl, setDraftUrl] = useState(data.chatUrl ?? '');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (editState === 'idle') setDraftUrl(data.chatUrl ?? '');
  }, [data.chatUrl, editState]);

  const beginEditing = () => {
    setDraftUrl(data.chatUrl ?? '');
    setValidationError('');
    setEditState('editing');
  };

  const cancelEditing = () => {
    setDraftUrl(data.chatUrl ?? '');
    setValidationError('');
    setEditState('idle');
  };

  const save = async () => {
    const normalized = normalizeExternalChatUrl(draftUrl);
    if (!isValidExternalChatUrl(normalized)) {
      setValidationError('Enter a valid conversation URL.');
      return;
    }

    setValidationError('');
    setEditState('saving');
    await Promise.resolve(onSaveChat(data.agent.id, normalized));
    setDraftUrl(normalized);
    setEditState('idle');
  };

  const remove = async () => {
    if (!data.chatUrl) return;
    const confirmed = window.confirm(`Remove the saved external chat link for ${data.agent.name}?`);
    if (!confirmed) return;

    setValidationError('');
    setEditState('removing');
    await Promise.resolve(onSaveChat(data.agent.id, ''));
    setDraftUrl('');
    setEditState('idle');
  };

  return (
    <div
      className={`grid min-w-[820px] grid-cols-[minmax(250px,1.2fr)_minmax(220px,0.9fr)_minmax(340px,1.4fr)] items-center gap-4 border-b border-slate-200 px-4 py-3 transition ${data.active ? 'bg-emerald-50/60' : 'bg-white hover:bg-slate-50/70'}`}
      data-agent-id={data.agent.id}
    >
      <button type="button" onClick={() => onActivate(data.agent.id)} className="flex min-w-0 items-center gap-3 text-start">
        <AgentAvatar agent={data.agent} role={data.role} size="sm" showHoverCard={false} />
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-slate-900">{data.agent.name}</span>
            {data.facilitator ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-700 ring-1 ring-inset ring-violet-200">Facilitator</span> : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">{data.role?.name ?? 'Specialist'}</span>
        </span>
      </button>

      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${statusClasses(data.status)}`}>{data.status}</span>
        <button
          type="button"
          onClick={() => onToggleSkip(data.agent.id, data.status)}
          className="rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-white hover:text-slate-800 hover:shadow-sm"
        >
          {data.status === 'skipped' ? 'Unskip' : 'Skip'}
        </button>
        {data.active ? <span className="text-[10px] font-semibold text-emerald-700">Current speaker</span> : null}
      </div>

      <div className="min-w-0">
        {editState === 'removing' ? (
          <span className="text-xs font-semibold text-slate-500">Removing chat link…</span>
        ) : editState === 'editing' || editState === 'saving' ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={draftUrl}
                onChange={event => setDraftUrl(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') void save();
                  if (event.key === 'Escape') cancelEditing();
                }}
                disabled={editState === 'saving'}
                placeholder="chatgpt.com/c/..."
                aria-label={`External chat URL for ${data.agent.name}`}
                className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
              />
              <button type="button" onClick={() => void save()} disabled={editState === 'saving'} className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                {editState === 'saving' ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={cancelEditing} disabled={editState === 'saving'} className="rounded-md px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
            </div>
            {validationError ? <div className="text-[10px] font-medium text-red-600">{validationError}</div> : null}
          </div>
        ) : data.chatUrl ? (
          <div className="flex items-center gap-2">
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${providerClasses(data.provider)}`}>{data.provider ?? 'Other'}</span>
            <button type="button" onClick={() => onOpenChat(data.agent.id, data.chatUrl!)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50">Open / Focus ↗</button>
            <button type="button" onClick={beginEditing} className="rounded-md px-2 py-1.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-50">Edit</button>
            <button type="button" onClick={() => void remove()} className="rounded-md px-2 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50">Remove</button>
          </div>
        ) : (
          <button type="button" onClick={beginEditing} className="rounded-md border border-dashed border-blue-300 bg-blue-50/40 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:border-blue-400 hover:bg-blue-50">+ Add Chat Link</button>
        )}
      </div>
    </div>
  );
}
