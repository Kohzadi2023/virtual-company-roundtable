import { useEffect, useState } from 'react';
import {
  loadMeetingOrchestration,
  MEETING_ORCHESTRATION_EVENT,
} from '@/lib/meetingOrchestration';
import { deriveRoomMetadataAutofillPatch } from '@/lib/roomMetadataAutofill';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function RoomMetadataAutofillRuntime({ roomId }: { roomId: string }) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const projects = useWorkspaceStore(state => state.projects);
  const decisions = useWorkspaceStore(state => state.decisions);
  const [meetingRevision, setMeetingRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setMeetingRevision(value => value + 1);
    window.addEventListener(MEETING_ORCHESTRATION_EVENT, refresh);
    return () => window.removeEventListener(MEETING_ORCHESTRATION_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!room) return;
    const project = projects.find(item => item.id === room.projectId);
    const meeting = loadMeetingOrchestration().rooms[room.id];
    const patch = deriveRoomMetadataAutofillPatch({
      room,
      project,
      meeting,
      decisions,
    });
    if (!patch) return;

    useWorkspaceStore.setState(state => ({
      rooms: state.rooms.map(item => item.id === room.id ? { ...item, ...patch } : item),
    }));
  }, [room, projects, decisions, meetingRevision]);

  return null;
}
