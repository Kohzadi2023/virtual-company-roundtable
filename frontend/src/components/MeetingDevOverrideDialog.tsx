import { useEffect, useState } from 'react';
import {
  ensureMeetingRoom,
  loadMeetingOrchestration,
  MEETING_ORCHESTRATION_EVENT,
  renameMeetingRound,
  setMeetingRound,
  type MeetingRoomState,
} from '@/lib/meetingOrchestration';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function MeetingDevOverrideDialog({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const [meeting, setMeeting] = useState<MeetingRoomState | null>(null);
  const [selectedRound, setSelectedRound] = useState(0);
  const [roundName, setRoundName] = useState('');

  useEffect(() => {
    if (!room) return;
    const refresh = () => {
      const next = loadMeetingOrchestration().rooms[room.id] ?? ensureMeetingRoom(room.id, room.agentIds);
      setMeeting(next);
      setSelectedRound(current => Math.min(current, Math.max(0, next.rounds.length - 1)));
    };
    refresh();
    window.addEventListener(MEETING_ORCHESTRATION_EVENT, refresh);
    return () => window.removeEventListener(MEETING_ORCHESTRATION_EVENT, refresh);
  }, [room]);

  useEffect(() => {
    if (!meeting) return;
    setRoundName(meeting.rounds[selectedRound] ?? '');
  }, [meeting, selectedRound]);

  if (!room || !meeting) return null;

  const jumpToRound = () => {
    const target = meeting.rounds[selectedRound] ?? `Round ${selectedRound + 1}`;
    if (!window.confirm(`Developer override: jump directly to Round ${selectedRound + 1} — ${target}?\n\nThis resets speaker statuses for that round and can bypass the normal meeting sequence.`)) return;
    setMeetingRound(room.id, selectedRound);
  };

  const saveRoundName = () => {
    const clean = roundName.trim();
    if (!clean) return;
    renameMeetingRound(room.id, selectedRound, clean);
  };

  return (
    <div className="fixed inset-0 z-[140] grid place-items-center bg-slate-950/55 p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="meeting-dev-override-title">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="meeting-dev-override-title" className="text-base font-bold text-slate-900">Meeting Round Override</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Debug-only controls. Normal meetings advance rounds automatically through Olivia, specialist turns, synthesis, and Start next round.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close meeting round override">✕</button>
        </header>

        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
            Current state: <strong>Round {meeting.roundIndex + 1}/{meeting.rounds.length}</strong> · {meeting.rounds[meeting.roundIndex]} · stage <strong>{meeting.roundStage}</strong>. Jumping rounds is intentionally unavailable in the normal Meeting Orchestration UI.
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">Override target round</span>
            <select value={selectedRound} onChange={event => setSelectedRound(Number(event.target.value))} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-amber-400">
              {meeting.rounds.map((name, index) => <option key={`${index}-${name}`} value={index}>Round {index + 1} — {name}</option>)}
            </select>
          </label>

          <button type="button" onClick={jumpToRound} className="w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-100">Jump to selected round</button>

          <div className="border-t border-slate-200 pt-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-700">Rename selected round</span>
              <input value={roundName} onChange={event => setRoundName(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-amber-400" />
            </label>
            <button type="button" onClick={saveRoundName} disabled={!roundName.trim()} className="mt-2 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50">Save debug round name</button>
            <p className="mt-2 text-[11px] leading-4 text-slate-400">Renaming changes the display label only. The semantic behavior of Rounds 1–4 remains fixed so specialist prompts cannot silently change meaning.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
