import { useMemo, useState } from 'react';
import { copyText } from '@/lib/clipboard';
import { defaultRoomLanguages, getRoomLanguage } from '@/lib/languages';
import { buildMeetingMinutes } from '@/lib/meetingMinutes';
import { deleteRoom, setRoomLanguage } from '@/lib/roomActions';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function RoomToolsBar({ roomId }: { roomId: string }) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const [minutesOpen, setMinutesOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const language = getRoomLanguage(room?.languageCode);
  const minutes = useMemo(() => room ? buildMeetingMinutes(room) : '', [room]);

  if (!room) return null;

  const handleDelete = () => {
    if (!window.confirm(`Delete room “${room.name}” and all of its messages? This cannot be undone.`)) return;
    deleteRoom(room.id);
  };

  const handleCopyMinutes = async () => {
    await copyText(minutes);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const handleDownload = () => {
    const blob = new Blob([minutes], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${room.name.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '') || 'meeting'}-minutes.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Room language</span>
          <select
            value={language.code}
            onChange={event => setRoomLanguage(room.id, event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none transition hover:border-blue-200 focus:border-blue-400"
            aria-label="Room language"
          >
            {defaultRoomLanguages.map(item => (
              <option key={item.code} value={item.code}>{item.nativeName} · {item.name}</option>
            ))}
          </select>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase text-slate-500">{language.code}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMinutesOpen(true)}
            disabled={room.messages.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span aria-hidden="true">▤</span> Meeting Minutes
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
          >
            <span aria-hidden="true">⌫</span> Delete Room
          </button>
        </div>
      </div>

      {minutesOpen && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/30 p-6" role="dialog" aria-modal="true" aria-label="Meeting Minutes">
          <div className="flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Meeting Minutes</h2>
                <p className="text-xs text-slate-500">{room.name} · {language.nativeName}</p>
              </div>
              <button type="button" onClick={() => setMinutesOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close meeting minutes">✕</button>
            </div>
            <pre dir={language.dir} className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-5 py-4 text-start text-[13px] leading-6 text-slate-700">{minutes}</pre>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button type="button" onClick={handleDownload} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Download .md</button>
              <button type="button" onClick={handleCopyMinutes} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">{copied ? 'Copied' : 'Copy Minutes'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
