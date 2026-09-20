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
  hasLocalStorageHeadroom,
  prepareMemoryV2Storage,
  runWithMemoryV2StorageRecovery,
} from '@/lib/memoryV2Storage';
import {
  captureAgentMemoryHistory,
  MEMORY_V2_EVENT,
  refreshMemoryConflicts,
  syncOliviaMeetingState,
} from '@/lib/memoryV2';
import { loadWorkspaceSuite, WORKSPACE_SUITE_EVENT } from '@/lib/workspaceSuite';
import { useWorkspaceStore } from '@/store/workspaceStore';

function captureAgentHistoryWhenSafe(): void {
  const suite = loadWorkspaceSuite();
  // The current Memory V2 cache stores fingerprints derived from full memory text,
  // so conservatively budget roughly one extra serialized copy before rebuilding it.
  const anticipatedCacheCharacters = JSON.stringify(suite.agentMemories).length;
  if (!hasLocalStorageHeadroom(anticipatedCacheCharacters)) {
    console.warn('[MemoryV2] Skipping derived agent-memory history cache rebuild because local storage headroom is low.');
    return;
  }
  runWithMemoryV2StorageRecovery(() => captureAgentMemoryHistory(), 'agent-memory history capture');
}

export function MemoryV2Runtime() {
  const rooms = useWorkspaceStore(state => state.rooms);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const decisions = useWorkspaceStore(state => state.decisions);
  const actionItems = useWorkspaceStore(state => state.actionItems);
  const [meetingVersion, setMeetingVersion] = useState(0);

  // Recover storage pressure before any of the message/round effects below can
  // attempt another Memory V2 write. This only removes derived/old metadata;
  // active shared memories and graph relationships are preserved.
  useEffect(() => {
    prepareMemoryV2Storage();
  }, []);

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
      runWithMemoryV2StorageRecovery(() => queueMemoryCandidate(
        room,
        latest,
        room.companyId ?? suite.activeCompanyId,
        meeting ? { roundIndex: meeting.roundIndex, rounds: meeting.rounds } : undefined,
      ), 'memory candidate queue');
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
      runWithMemoryV2StorageRecovery(
        () => consolidateRoundMemory(room, meeting),
        `round memory consolidation (${room.id})`,
      );
    }
  }, [meetingVersion, rooms]);

  useEffect(() => {
    const room = rooms.find(item => item.id === activeRoomId);
    if (!room) return;
    const suite = loadWorkspaceSuite();
    runWithMemoryV2StorageRecovery(
      () => syncOliviaMeetingState(room, decisions, actionItems, room.companyId ?? suite.activeCompanyId),
      'Olivia meeting-state memory sync',
    );
  }, [activeRoomId, actionItems, decisions, rooms]);

  useEffect(() => {
    prepareMemoryV2Storage();
    captureAgentHistoryWhenSafe();
    runWithMemoryV2StorageRecovery(() => refreshMemoryConflicts(), 'memory conflict refresh');
    runWithMemoryV2StorageRecovery(() => reconcileSuggestedMemoryMetadata(), 'memory suggestion reconciliation');

    const refreshWorkspace = () => {
      prepareMemoryV2Storage();
      captureAgentHistoryWhenSafe();
      runWithMemoryV2StorageRecovery(() => refreshMemoryConflicts(), 'memory conflict refresh');
      runWithMemoryV2StorageRecovery(() => reconcileSuggestedMemoryMetadata(), 'memory suggestion reconciliation');
    };
    const reconcileMemory = () => {
      runWithMemoryV2StorageRecovery(() => reconcileSuggestedMemoryMetadata(), 'memory suggestion reconciliation');
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
