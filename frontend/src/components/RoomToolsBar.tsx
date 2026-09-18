import { defaultRoomLanguages, getRoomLanguage } from '@/lib/languages';
import { setRoomLanguage } from '@/lib/roomActions';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function RoomToolsBar({ roomId }: { roomId: string }) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const language = getRoomLanguage(room?.languageCode);

  if (!room) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
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
  );
}
