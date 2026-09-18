import { useMemo, useState } from 'react';
import { AgentAvatar } from '@/components/AgentAvatar';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { copyText } from '@/lib/clipboard';
import { formatTimestamp } from '@/lib/format';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { Message } from '@/types/domain';

const COLLAPSE_WORDS = 500;

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function truncateWords(value: string, maxWords: number): string {
  const words = value.trim().split(/\s+/);
  if (words.length <= maxWords) return value;
  return `${words.slice(0, maxWords).join(' ')}\n\n…`;
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
  const agents = useWorkspaceStore(state => state.agents);
  const roles = useWorkspaceStore(state => state.roles);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [copied, setCopied] = useState(false);

  const isUser = message.authorType === 'user';
  const author = isUser ? 'User' : message.authorNameSnapshot ?? 'Agent';
  const agent = !isUser ? agents.find(item => item.id === message.authorId) : undefined;
  const role = agent ? roles.find(item => item.id === agent.roleId) : undefined;
  const long = useMemo(() => wordCount(message.content) > COLLAPSE_WORDS, [message.content]);
  const visibleContent = long && !expanded ? truncateWords(message.content, COLLAPSE_WORDS) : message.content;

  const startEditing = () => {
    setDraft(message.content);
    setExpanded(true);
    setEditing(true);
  };

  const saveEdit = () => {
    const content = draft.trim();
    if (!content) return;

    useWorkspaceStore.setState(state => ({
      rooms: state.rooms.map(room => room.id === roomId
        ? {
            ...room,
            messages: room.messages.map(item => item.id === message.id
              ? { ...item, content }
              : item),
          }
        : room),
    }));
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
  };

  return (
    <article className="flex items-start gap-3 py-1.5">
      {isUser ? (
        <span className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-semibold text-white shadow-sm" aria-label="User">U</span>
      ) : agent ? (
        <AgentAvatar agent={agent} role={role} size="md" />
      ) : (
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-200 text-lg">🤖</span>
      )}

      <div className="min-w-0 flex-1">
        <header className="mb-1 flex min-h-6 items-center gap-2 text-[12px]">
          <strong className="text-[14px] font-bold text-[#111b3a]">{author}</strong>
          {!isUser && message.roleNameSnapshot && <span className="text-slate-500">{message.roleNameSnapshot}</span>}
          <time className="text-slate-400" dateTime={new Date(message.createdAt).toISOString()}>
            {formatTimestamp(message.createdAt)}
          </time>
        </header>

        <div className={`rounded-lg border px-3 py-2 text-[13px] leading-5 shadow-[0_1px_2px_rgba(15,23,42,0.025)] ${isUser ? 'border-blue-100 bg-blue-50' : messageTone(role?.id)}`}>
          {editing ? (
            <div className="space-y-2">
              <textarea
                autoFocus
                dir="auto"
                value={draft}
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Escape') cancelEdit();
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') saveEdit();
                }}
                rows={Math.min(12, Math.max(4, draft.split('\n').length + 2))}
                className="w-full resize-y rounded-lg border border-blue-200 bg-white px-3 py-2 text-[13px] leading-5 text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                aria-label="Edit message"
              />
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={cancelEdit} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="button" onClick={saveEdit} disabled={!draft.trim()} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <MarkdownMessage content={visibleContent} />
              {long && (
                <button
                  type="button"
                  onClick={() => setExpanded(value => !value)}
                  className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:text-blue-700"
                  aria-expanded={expanded}
                >
                  {expanded ? 'Read less' : 'Read more'} <span aria-hidden="true">⌄</span>
                </button>
              )}
            </>
          )}
        </div>

        {isLast && !editing && (
          <div className="mt-1.5 flex items-center justify-end gap-1 text-[11px] text-slate-500" aria-label="Latest message actions">
            <button type="button" onClick={startEditing} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium transition hover:bg-slate-100 hover:text-blue-600" title="Edit message">
              <span aria-hidden="true">✎</span> Edit
            </button>
            <button type="button" onClick={handleCopy} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium transition hover:bg-slate-100 hover:text-blue-600" title="Copy message">
              <span aria-hidden="true">⧉</span> {copied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" onClick={handleDelete} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium transition hover:bg-rose-50 hover:text-rose-600" title="Delete message">
              <span aria-hidden="true">⌫</span> Delete
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
