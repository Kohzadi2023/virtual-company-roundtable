import { useEffect, useMemo, useState } from 'react';
import {
  loadMeetingOrchestration,
  MEETING_ORCHESTRATION_EVENT,
  type MeetingPhase,
} from '@/lib/meetingOrchestration';
import {
  clearMeetingTimer,
  loadOperationsSuite,
  OPERATIONS_SUITE_EVENT,
  setMeetingTimer,
  type MeetingTimerState,
} from '@/lib/operationsSuite';

const PHASE_MINUTES: Record<Exclude<MeetingPhase, 'closed'>, number> = {
  open: 5,
  collect: 5,
  challenge: 10,
  resolve: 5,
  decision: 5,
  actions: 5,
};

const PHASE_LABELS: Record<MeetingPhase, string> = {
  open: 'Open',
  collect: 'Collect opinions',
  challenge: 'Critique',
  resolve: 'Resolve',
  decision: 'Decision',
  actions: 'Actions',
  closed: 'Closed',
};

function remainingSeconds(timer: MeetingTimerState | undefined, now: number): number {
  if (!timer) return 0;
  if (!timer.startedAt) return Math.max(0, timer.pausedRemainingSeconds ?? timer.durationSeconds);
  return Math.max(0, timer.durationSeconds - Math.floor((now - timer.startedAt) / 1000));
}

export function MeetingPhaseTimerStrip({ roomId }: { roomId: string }) {
  const [meeting, setMeeting] = useState(() => loadMeetingOrchestration().rooms[roomId]);
  const [timer, setTimer] = useState(() => loadOperationsSuite().timers[roomId]);
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const refreshMeeting = () => setMeeting(loadMeetingOrchestration().rooms[roomId]);
    const refreshTimer = () => setTimer(loadOperationsSuite().timers[roomId]);
    window.addEventListener(MEETING_ORCHESTRATION_EVENT, refreshMeeting);
    window.addEventListener(OPERATIONS_SUITE_EVENT, refreshTimer);
    return () => {
      window.removeEventListener(MEETING_ORCHESTRATION_EVENT, refreshMeeting);
      window.removeEventListener(OPERATIONS_SUITE_EVENT, refreshTimer);
    };
  }, [roomId]);

  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = useMemo(() => remainingSeconds(timer, tick), [timer, tick]);
  const phase = meeting?.phase ?? 'open';
  const phaseMinutes = phase === 'closed' ? 0 : PHASE_MINUTES[phase];
  const running = Boolean(timer?.startedAt && remaining > 0);
  const paused = Boolean(timer && !timer.startedAt && timer.pausedRemainingSeconds !== undefined);

  const startPreset = () => {
    if (phase === 'closed') return;
    setMeetingTimer({
      roomId,
      label: `${PHASE_LABELS[phase]} segment`,
      durationSeconds: phaseMinutes * 60,
      startedAt: Date.now(),
    });
  };

  const pause = () => {
    if (!timer || !timer.startedAt) return;
    const left = remainingSeconds(timer, Date.now());
    setMeetingTimer({
      roomId,
      label: timer.label,
      durationSeconds: timer.durationSeconds,
      pausedRemainingSeconds: left,
    });
  };

  const resume = () => {
    if (!timer || timer.pausedRemainingSeconds === undefined) return;
    const left = Math.max(1, timer.pausedRemainingSeconds);
    setMeetingTimer({
      roomId,
      label: timer.label,
      durationSeconds: left,
      startedAt: Date.now(),
    });
  };

  if (phase === 'closed' && !timer) return null;

  return (
    <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
      <span className="rounded-full bg-white px-2.5 py-1 font-bold text-slate-700 ring-1 ring-slate-200">⏱ {PHASE_LABELS[phase]}</span>
      {phase !== 'closed' ? <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-500 ring-1 ring-slate-200">Preset {phaseMinutes} min</span> : null}
      {timer ? <span className={`rounded-full bg-white px-2.5 py-1 font-mono text-xs font-bold ring-1 ring-slate-200 ${remaining === 0 ? 'text-rose-600' : 'text-slate-700'}`}>{String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}</span> : <span className="rounded-full bg-white px-2.5 py-1 text-slate-400 ring-1 ring-slate-200">Not started</span>}
      <div className="ms-auto flex flex-wrap items-center gap-1.5">
        {phase !== 'closed' ? <button type="button" onClick={startPreset} className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700">Start {phaseMinutes}m</button> : null}
        {running ? <button type="button" onClick={pause} className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 font-bold text-amber-700">Pause</button> : null}
        {paused ? <button type="button" onClick={resume} className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 font-bold text-blue-700">Resume</button> : null}
        {timer ? <button type="button" onClick={() => clearMeetingTimer(roomId)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-500">Reset</button> : null}
      </div>
    </div>
  );
}
