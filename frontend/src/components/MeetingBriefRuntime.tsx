import { useEffect } from 'react';
import { backfillMeetingBriefFromMessages } from '@/lib/meetingBriefAutomation';
import { loadMeetingOrchestration } from '@/lib/meetingOrchestration';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function MeetingBriefRuntime({ roomId }: { roomId: string }) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));

  useEffect(() => {
    if (!room) return;
    const meeting = loadMeetingOrchestration().rooms[roomId];
    if (!meeting) return;
    if (meeting.objective?.trim() && meeting.expectedOutcome?.trim() && meeting.decisionQuestion?.trim()) return;
    backfillMeetingBriefFromMessages(roomId, room.messages);
  }, [room, roomId]);

  return null;
}
