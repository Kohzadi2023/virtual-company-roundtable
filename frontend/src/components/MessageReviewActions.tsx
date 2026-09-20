import { useState } from 'react';
import { addReviewRequest } from '@/lib/operationsSuite';
import { setActiveSpeaker } from '@/lib/meetingOrchestration';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { Message } from '@/types/domain';

export function MessageReviewActions({ roomId, message }: { roomId: string; message: Message }) {
  const agents = useWorkspaceStore(state => state.agents);
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const addUserMessage = useWorkspaceStore(state => state.addUserMessage);
  const [open, setOpen] = useState(false);
  const [targetAgentId, setTargetAgentId] = useState('');
  const [kind, setKind] = useState<'second-opinion' | 'handoff'>('second-opinion');

  const available = agents.filter(agent => room?.agentIds.includes(agent.id) && agent.id !== message.authorId);
  const selected = available.find(agent => agent.id === targetAgentId) ?? available[0];

  const submit = () => {
    if (!room || !selected) return;
    const source = message.authorNameSnapshot ?? (message.authorType === 'user' ? 'User' : 'Agent');
    const note = kind === 'second-opinion'
      ? `Review ${source}'s contribution independently. Identify agreements, disagreements, risks, missing evidence, and a concrete recommendation from your professional scope.`
      : `Take this handoff from ${source}. Continue the work from your professional scope without requiring the full room transcript to be repeated.`;
    addReviewRequest({
      roomId,
      sourceMessageId: message.id,
      ...(message.authorId ? { fromAgentId: message.authorId } : {}),
      targetAgentId: selected.id,
      kind,
      note,
    });
    addUserMessage(roomId, `## ${kind === 'second-opinion' ? 'Second Opinion' : 'Cross-Agent Handoff'} → ${selected.name}\n\nSource: **${source}**\n\n${note}\n\n### Source contribution\n${message.content}`);
    setActiveSpeaker(roomId, selected.id);
    setOpen(false);
  };

  if (available.length === 0) return null;

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(value => !value)} className="rounded-md px-2 py-1 font-medium hover:bg-cyan-50 hover:text-cyan-700">⇢ Review / Handoff</button>
      {open ? (
        <div className="absolute bottom-7 end-0 z-30 w-72 rounded-xl border border-slate-200 bg-white p-3 text-start shadow-2xl">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Send this contribution to</div>
          <select value={selected?.id ?? ''} onChange={event => setTargetAgentId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-2 text-xs">
            {available.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </select>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setKind('second-opinion')} className={`rounded-lg border px-2 py-2 text-[10px] font-semibold ${kind === 'second-opinion' ? 'border-cyan-300 bg-cyan-50 text-cyan-700' : 'border-slate-200 text-slate-500'}`}>Second Opinion</button>
            <button type="button" onClick={() => setKind('handoff')} className={`rounded-lg border px-2 py-2 text-[10px] font-semibold ${kind === 'handoff' ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500'}`}>Handoff</button>
          </div>
          <button type="button" onClick={submit} className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-bold text-white">Create request & make next speaker</button>
        </div>
      ) : null}
    </div>
  );
}
