import { useEffect, useState } from 'react';
import { openAgentMemory } from '@/lib/agentMemory';
import { copyText } from '@/lib/clipboard';
import { unseenMessagesForAgent } from '@/lib/contextDelta';
import { openOrFocusExternalChat } from '@/lib/externalChatWindow';
import { agentContextKey } from '@/lib/id';
import { getExternalAgentChat, setActiveSpeaker } from '@/lib/meetingOrchestration';
import { buildAgentPrompt } from '@/lib/promptBuilder';
import { useWorkspaceStore } from '@/store/workspaceStore';

interface MenuState {
  agentId: string;
  x: number;
  y: number;
}

export function AgentQuickActionsHost() {
  const agents = useWorkspaceStore(state => state.agents);
  const roles = useWorkspaceStore(state => state.roles);
  const rooms = useWorkspaceStore(state => state.rooms);
  const activeRoomId = useWorkspaceStore(state => state.activeRoomId);
  const agentContext = useWorkspaceStore(state => state.agentContext);
  const markAgentContextCopied = useWorkspaceStore(state => state.markAgentContextCopied);
  const addActionItem = useWorkspaceStore(state => state.addActionItem);
  const toggleAgentInRoom = useWorkspaceStore(state => state.toggleAgentInRoom);
  const addUserMessage = useWorkspaceStore(state => state.addUserMessage);
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const root = target?.closest<HTMLElement>('[data-agent-id]');
      const agentId = root?.dataset.agentId;
      if (!agentId) return;
      event.preventDefault();
      setMenu({ agentId, x: Math.min(event.clientX, window.innerWidth - 260), y: Math.min(event.clientY, window.innerHeight - 320) });
    };
    const close = () => setMenu(null);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, []);

  if (!menu) return null;
  const agent = agents.find(item => item.id === menu.agentId);
  const role = agent ? roles.find(item => item.id === agent.roleId) : undefined;
  const room = rooms.find(item => item.id === activeRoomId);
  if (!agent) return null;
  const chat = getExternalAgentChat(agent.id);
  const inRoom = Boolean(room?.agentIds.includes(agent.id));

  const copyContext = async () => {
    if (!room || !role) return;
    const cursor = agentContext[agentContextKey(room.id, agent.id)];
    const messages = unseenMessagesForAgent(room, agent.id, cursor);
    await copyText(buildAgentPrompt(agent, role, messages));
    markAgentContextCopied(room.id, agent.id);
  };

  const assignTask = () => {
    if (!room?.projectId) return;
    const title = window.prompt(`Assign a task to ${agent.name}:`)?.trim();
    if (!title) return;
    addActionItem({ projectId: room.projectId, roomId: room.id, title, owner: agent.name, status: 'todo', priority: 'medium' });
  };

  const askForReview = () => {
    if (!room) return;
    const source = room.messages.at(-1);
    if (!source) return;
    addUserMessage(room.id, `## Review Request → ${agent.name}\n\nPlease review the latest contribution from your professional scope. Identify agreements, disagreements, risks, missing evidence, and a concrete recommendation.\n\n### Source\n${source.content}`);
    setActiveSpeaker(room.id, agent.id);
  };

  return (
    <div className="fixed z-[260] w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-2xl" style={{ left: menu.x, top: menu.y }} onClick={event => event.stopPropagation()}>
      <div className="border-b border-slate-100 px-3 py-2"><div className="text-xs font-bold text-slate-800">{agent.name}</div><div className="text-[10px] text-slate-400">{role?.name ?? 'Specialist'} · Quick Actions</div></div>
      <button type="button" onClick={() => void copyContext().finally(() => setMenu(null))} disabled={!room || !role} className="block w-full px-3 py-2 text-start text-xs text-slate-700 hover:bg-blue-50 disabled:opacity-40">⧉ Copy Context</button>
      <button type="button" onClick={() => { if (chat?.url) openOrFocusExternalChat(agent.id, chat.url); setMenu(null); }} disabled={!chat?.url} className="block w-full px-3 py-2 text-start text-xs text-slate-700 hover:bg-violet-50 disabled:opacity-40">↗ Open / Focus external chat</button>
      <button type="button" onClick={() => { openAgentMemory({ agentId: agent.id }); setMenu(null); }} className="block w-full px-3 py-2 text-start text-xs text-slate-700 hover:bg-violet-50">🧠 View memory</button>
      <button type="button" onClick={() => { assignTask(); setMenu(null); }} disabled={!room?.projectId} className="block w-full px-3 py-2 text-start text-xs text-slate-700 hover:bg-emerald-50 disabled:opacity-40">✓ Assign task</button>
      <button type="button" onClick={() => { if (room) toggleAgentInRoom(room.id, agent.id); setMenu(null); }} disabled={!room} className="block w-full px-3 py-2 text-start text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40">{inRoom ? '− Remove from room' : '+ Add to room'}</button>
      <button type="button" onClick={() => { askForReview(); setMenu(null); }} disabled={!room || room.messages.length === 0} className="block w-full px-3 py-2 text-start text-xs text-slate-700 hover:bg-cyan-50 disabled:opacity-40">⇢ Ask for review</button>
    </div>
  );
}
