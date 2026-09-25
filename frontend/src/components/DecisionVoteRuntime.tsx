import { useEffect } from 'react';
import { syncDecisionVoting } from '@/lib/decisionVoting';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function DecisionVoteRuntime({ roomId }: { roomId: string }) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));

  useEffect(() => {
    if (!room) return;
    syncDecisionVoting(room.id);
  }, [room, roomId]);

  return null;
}
