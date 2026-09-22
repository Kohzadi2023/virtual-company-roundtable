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
      <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
        <strong>Meeting Brief · Needs clarification</strong>
        <span className="ms-2">{latestBrief.clarificationQuestion || 'Olivia needs one clarification before the meeting brief can be finalized.'}</span>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800" role="status">
      <strong>Meeting Brief · Olivia is preparing it automatically</strong>
      <span className="ms-2 text-blue-600">No action required from you.</span>
    </div>
  );
}
