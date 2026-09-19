import { useEffect, useRef } from 'react';
import {
  captureAgentMemoryHistory,
  MEMORY_V2_EVENT,
  refreshMemoryConflicts,
  suggestMemoryFromMessage,
  syncOliviaMeetingState,
} from '@/lib/memoryV2';
import { loadWorkspaceSuite, WORKSPACE_SUITE_EVENT } from '@/lib/workspaceSuite';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function MemoryV2Runtime() {
  const rooms = useWorkspaceStore(state => state.rooms);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const decisions = useWorkspaceStore(state => state.decisions);
  const actionItems = useWorkspaceStore(state => state.actionItems);
  const processedMessages = useRef(new Set<string>());

  useEffect(() => {
    for (const room of rooms) {
      const latest = room.messages.at(-1);
      if (!latest || processedMessages.current.has(latest.id)) continue;
      processedMessages.current.add(latest.id);
      const suite = loadWorkspaceSuite();
      suggestMemoryFromMessage(room, latest, room.companyId ?? suite.activeCompanyId);
    }
  }, [rooms]);

  useEffect(() => {
    const room = rooms.find(item => item.id === activeRoomId);
    if (!room) return;
    const suite = loadWorkspaceSuite();
    syncOliviaMeetingState(room, decisions, actionItems, room.companyId ?? suite.activeCompanyId);
  }, [activeRoomId, actionItems, decisions, rooms]);

  useEffect(() => {
    captureAgentMemoryHistory();
    refreshMemoryConflicts();
    const refresh = () => {
      captureAgentMemoryHistory();
      refreshMemoryConflicts();
    };
    window.addEventListener(WORKSPACE_SUITE_EVENT, refresh);
    window.addEventListener(MEMORY_V2_EVENT, refresh);
    return () => {
      window.removeEventListener(WORKSPACE_SUITE_EVENT, refresh);
      window.removeEventListener(MEMORY_V2_EVENT, refresh);
    };
  }, []);

  return null;
}
