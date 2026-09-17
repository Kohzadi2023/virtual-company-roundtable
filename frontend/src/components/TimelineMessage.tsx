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
    <article className={`group flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex w-full max-w-[94%] items-start gap-3 lg:max-w-[88%] ${isUser ? 'flex-row-reverse' : ''}`}>
        {isUser ? (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-indigo-500/50 bg-indigo-600 text-sm font-bold text-white" aria-label="User">U</span>
        ) : agent ? (
          <AgentAvatar agent={agent} role={role} size="md" />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-700 bg-slate-800">🤖</span>
        )}

        <div className={`min-w-0 flex-1 rounded-2xl border px-4 py-3 shadow-sm ${isUser ? 'border-indigo-900/70 bg-indigo-950/45' : 'border-slate-800 bg-slate-900/65'}`}>
          <header className={`mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${isUser ? 'flex-row-reverse text-end' : ''}`}>
            <strong className={isUser ? 'text-indigo-300' : 'text-emerald-300'}>{author}</strong>
            {!isUser && message.roleNameSnapshot && <span className="text-slate-500">· {message.roleNameSnapshot}</span>}
            <time className="text-slate-500" dateTime={new Date(message.createdAt).toISOString()}>
              {formatTimestamp(message.createdAt)}
            </time>
            <button
              type="button"
              onClick={() => deleteMessage(roomId, message.id)}
              className="ms-auto text-slate-600 opacity-0 transition hover:text-rose-300 group-hover:opacity-100 focus:opacity-100"
              aria-label={`حذف پیام ${author}`}
            >
              حذف
            </button>
          </header>

          <MarkdownMessage content={visibleContent} />

          {long && (
            <button
              type="button"
              onClick={() => setExpanded(value => !value)}
              className="mt-2 text-xs font-medium text-sky-300 hover:text-sky-200"
              aria-expanded={expanded}
            >
              {expanded ? 'نمایش کمتر ↑' : 'Read more ↓'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
