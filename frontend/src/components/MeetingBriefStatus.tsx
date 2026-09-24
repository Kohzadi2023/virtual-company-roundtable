import { useEffect, useMemo, useState } from 'react';
import { findLatestOliviaMeetingBrief } from '@/lib/meetingBriefAutomation';
import {
  loadMeetingOrchestration,
  MEETING_ORCHESTRATION_EVENT,
} from '@/lib/meetingOrchestration';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function MeetingBriefStatus({ roomId }: { roomId: string }) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(MEETING_ORCHESTRATION_EVENT, refresh);
    return () => window.removeEventListener(MEETING_ORCHESTRATION_EVENT, refresh);
  }, []);

  const meeting = useMemo(
    () => loadMeetingOrchestration().rooms[roomId],
    [roomId, revision],
  );
  const latestBrief = useMemo(
    () => room ? findLatestOliviaMeetingBrief(room.messages) : null,
    [room],
  );

  if (!room || !meeting) return null;

  const briefReady = Boolean(
    meeting.objective?.trim()
    && meeting.expectedOutcome?.trim()
    && meeting.decisionQuestion?.trim(),
  );
  if (briefReady) return null;

  if (latestBrief?.needsClarification) {
    return (
      <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-2.5" role="status">
        <div className="flex flex-wrap items-center gap-2 text-amber-900">
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-amber-200">Meeting Brief</span>
          <strong className="text-sm font-bold">Needs clarification</strong>
          <span dir="auto" className="min-w-0 flex-1 text-start text-xs leading-5 text-amber-800">
            {latestBrief.clarificationQuestion || 'Olivia needs one clarification before the meeting brief can be finalized.'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-blue-100 bg-blue-50 px-3 py-2.5" role="status">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700 ring-1 ring-blue-200">Meeting Brief</span>
        <strong className="text-sm font-bold text-blue-900">Olivia is preparing it automatically</strong>
        <span className="text-xs font-medium text-blue-600">No action required from you.</span>
      </div>
    </div>
  );
}
