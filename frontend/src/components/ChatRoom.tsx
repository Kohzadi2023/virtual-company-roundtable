import { useEffect, useRef } from 'react';
import { ActionPanel } from '@/components/ActionPanel';
import { TimelineMessage } from '@/components/TimelineMessage';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function ChatRoom({ roomId }: { roomId: string }) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [room?.messages.length]);

  if (!room) return <div className="grid h-full place-items-center text-slate-400">Room not found</div>;

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[#f8fafc]">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 pt-2" role="log" aria-live="polite" aria-label="Company discussion">
        <div className="min-h-full rounded-xl border border-slate-200 bg-white px-3 py-1 shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
          {room.messages.length === 0 ? (
            <div className="grid min-h-[420px] place-items-center text-center">
              <div>
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-2xl">💬</div>
                <div className="font-semibold text-slate-700">Start the company discussion</div>
                <p className="mt-1 text-sm text-slate-400">Send a User message, then choose a specialist to contribute.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              {room.messages.map(message => (
                <TimelineMessage key={message.id} roomId={room.id} message={message} />
              ))}
            </div>
          )}
        </div>
      </div>

      <ActionPanel roomId={room.id} />
    </section>
  );
}
