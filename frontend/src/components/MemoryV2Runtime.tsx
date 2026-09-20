import { useEffect, useState } from 'react';
import {
  consolidateRoundMemory,
  queueMemoryCandidate,
  reconcileSuggestedMemoryMetadata,
} from '@/lib/memoryIntelligence';
import {
  loadMeetingOrchestration,
  MEETING_ORCHESTRATION_EVENT,
} from '@/lib/meetingOrchestration';
import {
  captureAgentMemoryHistory,
  MEMORY_V2_EVENT,
  refreshMemoryConflicts,
  syncOliviaMeetingState,
} from '@/lib/memoryV2';
import { runWithMemoryQuotaRecovery } from '@/lib/memoryV2StorageRecovery';
import { loadWorkspaceSuite, WORKSPACE_SUITE_EVENT } from '@/lib/workspaceSuite';
import { useWorkspaceStore } from '@/store/workspaceStore';

function runMemoryTask(label: string, task: () => void): void {
  runWithMemoryQuotaRecovery(label, task, undefined);
}

export function MemoryV2Runtime() {
  const rooms = useWorkspaceStore(state => state.rooms);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const decisions = useWorkspaceStore(state => state.decisions);
  const actionItems = useWorkspaceStore(state => state.actionItems);
  const [meetingVersion, setMeetingVersion] = useState(0);

  useEffect(() => {
    const refreshMeeting = () => setMeetingVersion(value => value + 1);
    window.addEventListener(MEETING_ORCHESTRATION_EVENT, refreshMeeting);
    return () => window.removeEventListener(MEETING_ORCHESTRATION_EVENT, refreshMeeting);
  }, []);

  // Stage 1: every new discussion message is evaluated locally and deterministically.
  // Nothing is auto-saved here; high-confidence candidates wait for round consolidation.
  useEffect(() => {
    const meetingState = loadMeetingOrchestration();
    const suite = loadWorkspaceSuite();
    for (const room of rooms) {
      const latest = room.messages[room.messages.length - 1];
      if (!latest) continue;
      const meeting = meetingState.rooms[room.id];
      runMemoryTask('Queue memory candidate', () => {
        queueMemoryCandidate(
          room,
          latest,
          room.companyId ?? suite.activeCompanyId,
          meeting ? { roundIndex: meeting.roundIndex, rounds: meeting.rounds } : undefined,
        );
      });
    }
  }, [meetingVersion, rooms]);

  // Stage 2: Olivia finishing a round is the consolidation boundary. Strong,
  // non-conflicting candidates are persisted automatically; medium/conflicting
  // candidates go to Memory Center for human review.
  useEffect(() => {
    const meetingState = loadMeetingOrchestration();
    for (const room of rooms) {
      const meeting = meetingState.rooms[room.id];
      if (!meeting || meeting.roundStage !== 'complete') continue;
      runMemoryTask('Consolidate round memory', () => {
        consolidateRoundMemory(room, meeting);
      });
    }
  }, [meetingVersion, rooms]);

  useEffect(() => {
    const room = rooms.find(item => item.id === activeRoomId);
    if (!room) return;
    const suite = loadWorkspaceSuite();
    runMemoryTask('Synchronize Olivia meeting memory', () => {
      syncOliviaMeetingState(room, decisions, actionItems, room.companyId ?? suite.activeCompanyId);
    });
  }, [activeRoomId, actionItems, decisions, rooms]);

  useEffect(() => {
    const reconcileAll = () => {
      runMemoryTask('Capture agent memory history', captureAgentMemoryHistory);
      runMemoryTask('Refresh memory conflicts', refreshMemoryConflicts);
      runMemoryTask('Reconcile suggested memory metadata', reconcileSuggestedMemoryMetadata);
    };

    reconcileAll();

    const refreshWorkspace = () => reconcileAll();
    const reconcileMemory = () => {
      runMemoryTask('Reconcile suggested memory metadata', reconcileSuggestedMemoryMetadata);
    };

    window.addEventListener(WORKSPACE_SUITE_EVENT, refreshWorkspace);
    window.addEventListener(MEMORY_V2_EVENT, reconcileMemory);
    return () => {
      window.removeEventListener(WORKSPACE_SUITE_EVENT, refreshWorkspace);
      window.removeEventListener(MEMORY_V2_EVENT, reconcileMemory);
    };
  }, []);

  return null;
}
