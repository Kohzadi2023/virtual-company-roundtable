import { useMemo, useState } from 'react';
import { copyText } from '@/lib/clipboard';
import {
  CONTEXT_MODES,
  decoratePromptForContextMode,
  estimatePromptSize,
  messagesForContextMode,
  type ContextCopyMode,
} from '@/lib/contextModes';
import { getExternalAgentChat } from '@/lib/meetingOrchestration';
import { buildAgentPrompt } from '@/lib/promptBuilder';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { Agent, AgentContextState, RoleDefinition, Room } from '@/types/domain';

interface ContextCopyControlsProps {
  room: Room;
  agent: Agent;
  role: RoleDefinition;
  cursor?: AgentContextState | undefined;
  onNotify: (text: string, tone?: 'success' | 'error') => void;
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

export function ContextCopyControls({ room, agent, role, cursor, onNotify }: ContextCopyControlsProps) {
  const markAgentContextCopied = useWorkspaceStore(state => state.markAgentContextCopied);
  const [mode, setMode] = useState<ContextCopyMode>('continue');
  const [previewOpen, setPreviewOpen] = useState(false);

  const messages = useMemo(() => messagesForContextMode(room, agent.id, cursor, mode), [agent.id, cursor, mode, room]);
  const prompt = useMemo(() => decoratePromptForContextMode(buildAgentPrompt(agent, role, messages), mode), [agent, messages, mode, role]);
  const size = useMemo(() => estimatePromptSize(prompt), [prompt]);
  const externalChat = getExternalAgentChat(agent.id);
  const externalChatUrl = canOpen(externalChat?.url) ? externalChat.url : null;
  const disabled = mode === 'continue' && messages.length === 0;

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
      <div className="space-y-2">
        <select value={mode} onChange={event => setMode(event.target.value as ContextCopyMode)} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[11px] font-semibold text-slate-700">
          {CONTEXT_MODES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[10px] leading-4 text-slate-500">
          <div>{CONTEXT_MODES.find(item => item.value === mode)?.description}</div>
          <div className="mt-1 font-semibold text-slate-600">{messages.length} messages · {size.words.toLocaleString()} words · ~{size.approxTokens.toLocaleString()} tokens</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setPreviewOpen(true)} disabled={disabled} className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Preview</button>
          <button type="button" onClick={copy} disabled={disabled} className="rounded-lg border border-blue-500 bg-blue-50 px-2 py-2 text-[11px] font-bold text-blue-600 hover:bg-blue-100 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400">⧉ Copy</button>
        </div>
        {externalChat && externalChatUrl ? <button type="button" onClick={() => window.open(externalChatUrl, '_blank', 'noopener,noreferrer')} className="w-full rounded-lg border border-violet-200 bg-violet-50 px-2 py-2 text-[11px] font-bold text-violet-700 hover:bg-violet-100">Open {externalChat.provider} Chat ↗</button> : null}
      </div>

      {previewOpen ? (
        <div className="fixed inset-0 z-[140] grid place-items-center bg-slate-950/50 p-5" onMouseDown={event => { if (event.target === event.currentTarget) setPreviewOpen(false); }}>
          <section className="flex h-[82vh] w-[min(980px,94vw)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Context preview">
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div><h2 className="text-base font-bold text-slate-900">Context Preview · {agent.name}</h2><p className="mt-0.5 text-xs text-slate-500">{CONTEXT_MODES.find(item => item.value === mode)?.label} · {size.words.toLocaleString()} words · ~{size.approxTokens.toLocaleString()} tokens</p></div>
              <button type="button" onClick={() => setPreviewOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">✕</button>
            </header>
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-5 py-4 text-xs leading-5 text-slate-700">{prompt}</pre>
            <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3"><button type="button" onClick={() => setPreviewOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600">Close</button><button type="button" onClick={async () => { await copy(); setPreviewOpen(false); }} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700">⧉ Copy This Context</button></footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
