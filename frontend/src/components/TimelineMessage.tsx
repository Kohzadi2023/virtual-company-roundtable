import { useMemo, useState } from 'react';
import { AgentAvatar } from '@/components/AgentAvatar';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { MessageReviewActions } from '@/components/MessageReviewActions';
import { openAgentMemory } from '@/lib/agentMemory';
import { copyText } from '@/lib/clipboard';
import { formatTimestamp } from '@/lib/format';
import { recordAudit } from '@/lib/workspaceSuite';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { Message, MessageReaction } from '@/types/domain';

const COLLAPSE_WORDS = 500;
const REACTIONS: Array<{ value: MessageReaction; icon: string; label: string }> = [
  { value: 'agree', icon: '👍', label: 'Agree' },
  { value: 'disagree', icon: '👎', label: 'Disagree' },
  { value: 'risk', icon: '⚠', label: 'Risk' },
  { value: 'accepted', icon: '✅', label: 'Accepted' },
  { value: 'important', icon: '⭐', label: 'Important' },
];

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function truncateWords(value: string, maxWords: number): string {
  const words = value.trim().split(/\s+/);
  if (words.length <= maxWords) return value;
  return `${words.slice(0, maxWords).join(' ')}\n\n…`;
}

function memoryTitle(message: Message): string {
  const firstLine = message.content.split('\n').map(value => value.trim()).find(Boolean) ?? 'Discussion memory';
  const prefix = message.reaction === 'risk' ? 'Risk: ' : message.reaction === 'accepted' ? 'Accepted: ' : '';
  const value = `${prefix}${firstLine}`;
  return value.length > 72 ? `${value.slice(0, 69)}…` : value;
}

function messageTone(roleId?: string): string {
  switch (roleId) {
    case 'role-frontend': return 'bg-emerald-50/70 border-emerald-100';
    case 'role-critic': return 'bg-amber-50/70 border-amber-100';
    case 'role-uiux': return 'bg-violet-50/70 border-violet-100';
    case 'role-marketing-sales': return 'bg-sky-50/70 border-sky-100';
    case 'role-security': return 'bg-slate-50 border-slate-200';
    default: return 'bg-slate-50/70 border-slate-200';
  }
}

interface TimelineMessageProps {
  roomId: string;
  message: Message;
  isLast?: boolean;
}

export function TimelineMessage({ roomId, message, isLast = false }: TimelineMessageProps) {
  const deleteMessage = useWorkspaceStore(state => state.deleteMessage);
  const createRoom = useWorkspaceStore(state => state.createRoom);
  const setActiveRoom = useWorkspaceStore(state => state.setActiveRoom);
  const addUserMessage = useWorkspaceStore(state => state.addUserMessage);
  const agents = useWorkspaceStore(state => state.agents);
  const roles = useWorkspaceStore(state => state.roles);
  const rooms = useWorkspaceStore(state => state.rooms);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reactionOpen, setReactionOpen] = useState(false);

  const isUser = message.authorType === 'user';
  const author = isUser ? 'User' : message.authorNameSnapshot ?? 'Agent';
  const agent = !isUser ? agents.find(item => item.id === message.authorId) : undefined;
  const role = agent ? roles.find(item => item.id === agent.roleId) : undefined;
  const long = useMemo(() => wordCount(message.content) > COLLAPSE_WORDS, [message.content]);
  const visibleContent = long && !expanded ? truncateWords(message.content, COLLAPSE_WORDS) : message.content;
  const reaction = REACTIONS.find(item => item.value === message.reaction);

  const patchMessage = (updater: (current: Message) => Message) => {
    useWorkspaceStore.setState(state => ({
      rooms: state.rooms.map(room => room.id === roomId
        ? { ...room, messages: room.messages.map(item => item.id === message.id ? updater(item) : item) }
        : room),
    }));
  };

  const startEditing = () => {
    setDraft(message.content);
    setExpanded(true);
    setEditing(true);
  };

  const saveEdit = () => {
    const content = draft.trim();
    if (!content || content === message.content) {
      setEditing(false);
      return;
    }
    patchMessage(item => ({
      ...item,
      content,
      versions: [...(item.versions ?? []), { content: item.content, savedAt: Date.now() }].slice(-20),
    }));
    recordAudit('message.edited', `Edited a message in ${rooms.find(room => room.id === roomId)?.name ?? 'room'} and preserved its previous version.`);
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft(message.content);
    setEditing(false);
  };

  const handleCopy = async () => {
    try {
      await copyText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const handleDelete = () => {
    if (!window.confirm('Delete this message?')) return;
    deleteMessage(roomId, message.id);
    recordAudit('message.deleted', `Deleted a message from ${rooms.find(room => room.id === roomId)?.name ?? 'room'}.`);
  };

  const rememberMessage = () => {
    openAgentMemory({
      ...(message.authorType === 'agent' && message.authorId ? { agentId: message.authorId } : {}),
      sourceRoomId: roomId,
      sourceMessageId: message.id,
      suggestedTitle: memoryTitle(message),
      suggestedContent: message.content,
    });
  };

  const togglePin = () => {
    patchMessage(item => ({ ...item, pinned: !item.pinned }));
    recordAudit('message.pin', `${message.pinned ? 'Unpinned' : 'Pinned'} a message in ${rooms.find(room => room.id === roomId)?.name ?? 'room'}.`);
  };

  const setReaction = (value: MessageReaction) => {
    patchMessage(item => ({ ...item, reaction: value }));
    setReactionOpen(false);
    recordAudit('message.reaction', `Marked a message as ${value}.`);
  };

  const addTag = () => {
    const value = window.prompt('Message tag (without #):')?.trim().replace(/^#/, '');
    if (!value) return;
    patchMessage(item => ({ ...item, tags: Array.from(new Set([...(item.tags ?? []), value])) }));
    recordAudit('message.tagged', `Added #${value} to a message.`);
  };

  const removeTag = (tag: string) => {
    patchMessage(item => ({ ...item, tags: (item.tags ?? []).filter(value => value !== tag) }));
  };

  const createBranch = () => {
    const sourceRoom = useWorkspaceStore.getState().rooms.find(room => room.id === roomId);
    if (!sourceRoom) return;
    if (message.branchRoomId && useWorkspaceStore.getState().rooms.some(room => room.id === message.branchRoomId)) {
      setActiveRoom(message.branchRoomId);
      return;
    }

    const branchId = createRoom(
      `Branch · ${sourceRoom.name}`,
      '⑂',
      sourceRoom.agentIds,
      [],
      sourceRoom.projectId,
    );
    useWorkspaceStore.setState(state => ({
      rooms: state.rooms.map(room => {
        if (room.id === branchId) {
          return {
            ...room,
            companyId: sourceRoom.companyId,
            languageCode: sourceRoom.languageCode,
            tags: Array.from(new Set([...(sourceRoom.tags ?? []), 'branch'])),
            knowledge: sourceRoom.knowledge,
            branchOfRoomId: sourceRoom.id,
            branchRootMessageId: message.id,
            lastOpenedAt: Date.now(),
          };
        }
        if (room.id === roomId) {
          return {
            ...room,
            messages: room.messages.map(item => item.id === message.id ? { ...item, branchRoomId: branchId } : item),
          };
        }
        return room;
      }),
    }));
    addUserMessage(branchId, `## Branch context\n\nBranched from **${sourceRoom.name}** at this message:\n\n${message.content}`);
    setActiveRoom(branchId);
    recordAudit('conversation.branched', `Created a branch from ${sourceRoom.name}.`);
  };

  return (
    <article className={`flex items-start gap-3 py-1.5 ${message.pinned ? 'rounded-xl bg-amber-50/60 px-2' : ''}`}>
      {isUser ? (
        <span className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-semibold text-white shadow-sm" aria-label="User">U</span>
      ) : agent ? (
        <AgentAvatar agent={agent} role={role} size="md" />
      ) : (
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-200 text-lg">🤖</span>
      )}

      <div className="min-w-0 flex-1">
        <header className="mb-1 flex min-h-6 flex-wrap items-center gap-2 text-[12px]">
          <strong className="text-[14px] font-bold text-[#111b3a]">{author}</strong>
          {!isUser && message.roleNameSnapshot && <span className="text-slate-500">{message.roleNameSnapshot}</span>}
          <time className="text-slate-400" dateTime={new Date(message.createdAt).toISOString()}>{formatTimestamp(message.createdAt)}</time>
          {message.pinned ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">📌 PINNED</span> : null}
          {reaction ? <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 shadow-sm">{reaction.icon} {reaction.label}</span> : null}
          {message.branchRoomId ? <button type="button" onClick={createBranch} className="rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">⑂ BRANCH</button> : null}
        </header>

        <div className={`rounded-lg border px-3 py-2 text-[13px] leading-5 shadow-[0_1px_2px_rgba(15,23,42,0.025)] ${isUser ? 'border-blue-100 bg-blue-50' : messageTone(role?.id)}`}>
          {editing ? (
            <div className="space-y-2">
              <textarea autoFocus dir="auto" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') cancelEdit(); if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') saveEdit(); }} rows={Math.min(12, Math.max(4, draft.split('\n').length + 2))} className="w-full resize-y rounded-lg border border-blue-200 bg-white px-3 py-2 text-[13px] leading-5 text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" aria-label="Edit message" />
              <div className="flex items-center justify-end gap-2"><button type="button" onClick={cancelEdit} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button type="button" onClick={saveEdit} disabled={!draft.trim()} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">Save</button></div>
            </div>
          ) : (
            <><MarkdownMessage content={visibleContent} />{long && <button type="button" onClick={() => setExpanded(value => !value)} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:text-blue-700" aria-expanded={expanded}>{expanded ? 'Read less' : 'Read more'} <span aria-hidden="true">⌄</span></button>}</>
          )}
        </div>

        {(message.tags?.length ?? 0) > 0 ? <div className="mt-1.5 flex flex-wrap gap-1">{message.tags?.map(tag => <button key={tag} type="button" onClick={() => removeTag(tag)} className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-600">#{tag} ×</button>)}</div> : null}

        {!editing && (
          <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1 text-[10px] text-slate-500" aria-label="Message collaboration actions">
            <button type="button" onClick={togglePin} className="rounded-md px-2 py-1 font-medium hover:bg-amber-50 hover:text-amber-700">{message.pinned ? 'Unpin' : '📌 Pin'}</button>
            <button type="button" onClick={rememberMessage} className="rounded-md px-2 py-1 font-medium hover:bg-violet-50 hover:text-violet-700">🧠 Remember</button>
            <MessageReviewActions roomId={roomId} message={message} />
            <div className="relative">
              <button type="button" onClick={() => setReactionOpen(value => !value)} className="rounded-md px-2 py-1 font-medium hover:bg-slate-100">{reaction ? `${reaction.icon} ${reaction.label}` : 'React'}</button>
              {reactionOpen ? <div className="absolute bottom-7 end-0 z-20 flex gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">{REACTIONS.map(item => <button key={item.value} type="button" onClick={() => setReaction(item.value)} title={item.label} className="grid h-7 w-7 place-items-center rounded hover:bg-slate-100">{item.icon}</button>)}</div> : null}
            </div>
            <button type="button" onClick={addTag} className="rounded-md px-2 py-1 font-medium hover:bg-slate-100"># Tag</button>
            <button type="button" onClick={createBranch} className="rounded-md px-2 py-1 font-medium hover:bg-violet-50 hover:text-violet-700">⑂ {message.branchRoomId ? 'Open Branch' : 'Branch'}</button>
            {(message.versions?.length ?? 0) > 0 ? <button type="button" onClick={() => setHistoryOpen(value => !value)} className="rounded-md px-2 py-1 font-medium hover:bg-slate-100">History ({message.versions?.length})</button> : null}
            {isLast ? <><button type="button" onClick={startEditing} className="rounded-md px-2 py-1 font-medium hover:bg-slate-100 hover:text-blue-600"><span aria-hidden="true">✎</span> Edit</button><button type="button" onClick={handleCopy} className="rounded-md px-2 py-1 font-medium hover:bg-slate-100 hover:text-blue-600"><span aria-hidden="true">⧉</span> {copied ? 'Copied' : 'Copy'}</button><button type="button" onClick={handleDelete} className="rounded-md px-2 py-1 font-medium hover:bg-rose-50 hover:text-rose-600"><span aria-hidden="true">⌫</span> Delete</button></> : null}
          </div>
        )}

        {historyOpen && (message.versions?.length ?? 0) > 0 ? <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Previous versions</div><div className="max-h-48 space-y-2 overflow-y-auto">{[...(message.versions ?? [])].reverse().map((version, index) => <details key={`${version.savedAt}-${index}`} className="rounded border border-slate-100 p-2"><summary className="cursor-pointer text-[10px] font-semibold text-slate-500">{new Date(version.savedAt).toLocaleString()}</summary><div className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{version.content}</div></details>)}</div></div> : null}
      </div>
    </article>
  );
}
