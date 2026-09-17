import { useMemo, useState } from 'react';
import { AgentAvatar } from '@/components/AgentAvatar';
import { MarkdownMessage } from '@/components/MarkdownMessage';
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

export function TimelineMessage({ roomId, message }: { roomId: string; message: Message }) {
  const deleteMessage = useWorkspaceStore(state => state.deleteMessage);
  const agents = useWorkspaceStore(state => state.agents);
  const roles = useWorkspaceStore(state => state.roles);
  const [expanded, setExpanded] = useState(false);
  const isUser = message.authorType === 'user';
  const author = isUser ? 'User' : message.authorNameSnapshot ?? 'Agent';
  const agent = !isUser ? agents.find(item => item.id === message.authorId) : undefined;
  const role = agent ? roles.find(item => item.id === agent.roleId) : undefined;
  const long = useMemo(() => wordCount(message.content) > COLLAPSE_WORDS, [message.content]);
  const visibleContent = long && !expanded ? truncateWords(message.content, COLLAPSE_WORDS) : message.content;

  return (
    <article className="group flex items-start gap-3 py-1.5">
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
          <button
            type="button"
            onClick={() => deleteMessage(roomId, message.id)}
            className="ms-auto grid h-6 w-7 place-items-center rounded-md text-base text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-rose-500 group-hover:opacity-100 focus:opacity-100"
            aria-label={`حذف پیام ${author}`}
            title="Delete message"
          >
            ⋯
          </button>
        </header>

        <div className={`rounded-lg border px-3 py-2 text-[13px] leading-5 shadow-[0_1px_2px_rgba(15,23,42,0.025)] ${isUser ? 'border-blue-100 bg-blue-50' : messageTone(role?.id)}`}>
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
        </div>
      </div>
    </article>
  );
}
