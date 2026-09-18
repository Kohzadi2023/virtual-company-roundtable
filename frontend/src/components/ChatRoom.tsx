import { useEffect, useRef } from 'react';
import { ActionPanel } from '@/components/ActionPanel';
import { RoomToolsBar } from '@/components/RoomToolsBar';
import { TimelineMessage } from '@/components/TimelineMessage';
import { useWorkspaceStore } from '@/store/workspaceStore';

function EmptyDiscussionState() {
  return (
    <div className="flex min-h-[460px] items-center justify-center px-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-600 shadow-sm ring-1 ring-blue-100">
          <svg viewBox="0 0 48 48" className="h-11 w-11" fill="none" aria-hidden="true">
            <path d="M9 12.5C9 8.9 12 6 15.6 6h16.8C36 6 39 8.9 39 12.5v12C39 28.1 36 31 32.4 31H23l-8.5 7v-7C11.4 30.5 9 27.8 9 24.5v-12Z" className="fill-blue-600/10 stroke-blue-600" strokeWidth="2.2" strokeLinejoin="round" />
            <circle cx="18" cy="18.5" r="2.3" className="fill-blue-600" />
            <circle cx="24" cy="18.5" r="2.3" className="fill-blue-600" />
            <circle cx="30" cy="18.5" r="2.3" className="fill-blue-600" />
          </svg>
        </div>
        <h2 className="text-xl font-bold tracking-tight text-slate-800">Start the company discussion</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Send a User message, then choose the specialist you want to hear from. Each employee contributes from their fixed role and expertise.
        </p>
      </div>
    </div>
  );
}

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
      <RoomToolsBar roomId={room.id} />

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 pt-2" role="log" aria-live="polite" aria-label="Company discussion">
        <div className="min-h-full rounded-xl border border-slate-200 bg-white px-3 py-1 shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
          {room.messages.length === 0 ? (
            <EmptyDiscussionState />
          ) : (
            <div className="space-y-0.5">
              {room.messages.map((message, index) => (
                <TimelineMessage
                  key={message.id}
                  roomId={room.id}
                  message={message}
                  isLast={index === room.messages.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ActionPanel roomId={room.id} />
    </section>
  );
}
