import { openAgentMemory } from '@/lib/agentMemory';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function AgentMemoryLauncher() {
  const activeRoom = useWorkspaceStore(state => state.rooms.find(room => room.id === state.activeRoomId));
  const defaultAgentId = activeRoom?.agentIds[0];

  return (
    <button
      type="button"
      onClick={() => openAgentMemory(defaultAgentId ? { agentId: defaultAgentId } : {})}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-violet-50 hover:text-violet-700"
      title="Persistent Agent Memory"
    >
      <span aria-hidden="true">🧠</span> Agent Memory
    </button>
  );
}
