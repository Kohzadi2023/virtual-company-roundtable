import { useMemo } from 'react';
import { attentionReasonLabel, findRoomsNeedingAttention } from '@/lib/meetingAttention';
import { useWorkspaceStore } from '@/store/workspaceStore';

/**
 * Aggregates every room paused on a staffing problem (missing plan, or an
 * unresolved blocker after Invite Team) into one workspace-wide count, so a
 * stuck meeting doesn't go unnoticed until someone happens to reopen that
 * specific room. Hidden entirely when nothing needs attention -- unlike the
 * other footer pills, a "0" here isn't a useful thing to broadcast.
 */
export function MeetingAttentionBadge() {
  const rooms = useWorkspaceStore(state => state.rooms);
  const setActiveRoom = useWorkspaceStore(state => state.setActiveRoom);
  const items = useMemo(() => findRoomsNeedingAttention(rooms), [rooms]);

  if (items.length === 0) return null;

  return (
    <details className="group relative">
      <summary
        className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md bg-amber-50 px-2 py-1 font-semibold text-amber-800 transition hover:bg-amber-100"
        title="Meetings waiting on a staffing decision"
      >
        <span aria-hidden="true">⚠</span> {items.length}
      </summary>
      <div className="absolute bottom-8 end-0 z-[80] w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-2xl">
        <div className="px-2 pb-2 pt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Needs a staffing decision
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {items.map(item => (
            <button
              key={item.roomId}
              type="button"
              onClick={() => setActiveRoom(item.roomId)}
              className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-start text-xs hover:bg-amber-50"
            >
              <span dir="auto" className="line-clamp-1 font-semibold text-slate-800">{item.roomName}</span>
              <span className="text-[11px] text-amber-700">{attentionReasonLabel(item.reason)}</span>
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}
