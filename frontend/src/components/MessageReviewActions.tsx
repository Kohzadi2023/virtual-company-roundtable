import { useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { addReviewRequest } from '@/lib/operationsSuite';
import { setActiveSpeaker } from '@/lib/meetingOrchestration';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { Message } from '@/types/domain';

const PANEL_WIDTH = 288;
const PANEL_HEIGHT = 200;

export function MessageReviewActions({
  roomId,
  message,
  onDone,
  popoverRef,
}: {
  roomId: string;
  message: Message;
  onDone?: () => void;
  /**
   * A caller that renders this inside its own click-outside-managed popover
   * (TimelineMessage's "More" menu) passes a ref here and adds it to that
   * popover's own ignoreRefs, so a click inside this one isn't treated as a
   * click "outside" the parent and doesn't close it. Not needed standalone.
   */
  popoverRef?: RefObject<HTMLDivElement>;
}) {
  const agents = useWorkspaceStore(state => state.agents);
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const addUserMessage = useWorkspaceStore(state => state.addUserMessage);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [targetAgentId, setTargetAgentId] = useState('');
  const [kind, setKind] = useState<'second-opinion' | 'handoff'>('second-opinion');
  const triggerRef = useRef<HTMLButtonElement>(null);

  const available = agents.filter(agent => room?.agentIds.includes(agent.id) && agent.id !== message.authorId);
  const selected = available.find(agent => agent.id === targetAgentId) ?? available[0];

  // This item is meant to be used inside TimelineMessage's own portaled
  // "More" menu, which is itself viewport-clamped and can land anywhere on
  // screen. A CSS-anchored popover (bottom-0/end-full) clipped the same way
  // the outer menu used to; keeping it as a plain absolute-positioned
  // descendant with computed offsets doesn't help either, because the outer
  // menu itself has overflow-y-auto (which, per the CSS overflow spec,
  // clips the perpendicular axis too once either axis is non-visible) and
  // is narrower than this panel — confirmed live: absolute-positioned with
  // "correct" viewport coordinates still got clipped by that ancestor's own
  // bounding box. Portaled to <body>, same as the outer menu, is the only
  // way to fully escape it.
  const toggle = () => {
    setPosition(current => {
      if (current) return null;
      const trigger = triggerRef.current;
      if (!trigger) return null;
      const rect = trigger.getBoundingClientRect();
      const gap = 4;
      const spaceLeft = rect.left;
      const spaceRight = window.innerWidth - rect.right;
      const left = spaceLeft >= PANEL_WIDTH + gap || spaceLeft >= spaceRight
        ? Math.max(8, rect.left - PANEL_WIDTH - gap)
        : Math.min(rect.right + gap, window.innerWidth - PANEL_WIDTH - 8);
      const top = Math.max(8, Math.min(rect.top, window.innerHeight - PANEL_HEIGHT - 8));
      return { top, left };
    });
  };
  const close = () => setPosition(null);

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
    close();
    onDone?.();
  };

  if (available.length === 0) return null;

  return (
    <>
      <button ref={triggerRef} type="button" role="menuitem" onClick={toggle} className="block w-full rounded-md px-2 py-1.5 text-start font-medium hover:bg-cyan-50 hover:text-cyan-700">⇢ Review / Handoff</button>
      {position ? createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[110] w-72 rounded-xl border border-slate-200 bg-white p-3 text-start text-[10px] text-slate-500 shadow-2xl"
          style={{ top: position.top, left: position.left }}
        >
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Send this contribution to</div>
          <select value={selected?.id ?? ''} onChange={event => setTargetAgentId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-2 text-xs">
            {available.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </select>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setKind('second-opinion')} className={`rounded-lg border px-2 py-2 text-[10px] font-semibold ${kind === 'second-opinion' ? 'border-cyan-300 bg-cyan-50 text-cyan-700' : 'border-slate-200 text-slate-500'}`}>Second Opinion</button>
            <button type="button" onClick={() => setKind('handoff')} className={`rounded-lg border px-2 py-2 text-[10px] font-semibold ${kind === 'handoff' ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500'}`}>Handoff</button>
          </div>
          <button type="button" onClick={submit} className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-bold text-white">Create request & make next speaker</button>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
