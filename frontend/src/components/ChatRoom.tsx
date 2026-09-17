import { useEffect, useRef, useState } from 'react';
import { ActionPanel } from '@/components/ActionPanel';
import { TimelineMessage } from '@/components/TimelineMessage';
import { Toast, type ToastMessage } from '@/components/Toast';
import { copyText } from '@/lib/clipboard';
import { buildFullChatText } from '@/lib/fullChat';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function ChatRoom({ roomId }: { roomId: string }) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const scrollRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [room?.messages.length]);

  if (!room) return <div className="grid h-full place-items-center text-slate-500">اتاق یافت نشد</div>;

  const copyFullChat = async () => {
    if (room.messages.length === 0) return;
    try {
      await copyText(buildFullChatText(room));
      setToast({ id: Date.now(), text: 'کل Timeline با فرمت تمیز کپی شد.', tone: 'success' });
    } catch {
      setToast({ id: Date.now(), text: 'کپی کل Timeline انجام نشد.', tone: 'error' });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-bold">{room.emoji} {room.name}</h1>
          <p className="mt-0.5 text-xs text-slate-500">Company discussion timeline · {room.messages.length} messages</p>
        </div>
        <button type="button" onClick={copyFullChat} disabled={room.messages.length === 0} className="rounded-xl border border-sky-800 bg-sky-950/30 px-3 py-2 text-xs font-medium text-sky-300 hover:bg-sky-950/60 disabled:opacity-40">📋 Copy Full Chat</button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="گفتگوی شرکت">
        <div className="mx-auto max-w-5xl space-y-4">
          {room.messages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center text-sm text-slate-500">
              هنوز پیامی ثبت نشده است. User گفتگو را شروع می‌کند.
            </div>
          ) : room.messages.map(message => (
            <TimelineMessage key={message.id} roomId={room.id} message={message} />
          ))}
        </div>
      </div>

      <ActionPanel roomId={room.id} />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
