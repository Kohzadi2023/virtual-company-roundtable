import { useState } from 'react';
import type { Agent, RoleDefinition } from '@/types/domain';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

export function AgentAvatar({
  agent,
  role,
  size = 'md',
  showHoverCard = true,
}: {
  agent: Agent;
  role?: RoleDefinition;
  size?: 'sm' | 'md' | 'lg';
  showHoverCard?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const sizeClass = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-14 w-14' : 'h-10 w-10';
  const showImage = Boolean(agent.avatarUrl) && !imageFailed;

  return (
    <span className="group/avatar relative inline-flex shrink-0" tabIndex={showHoverCard ? 0 : -1}>
      {showImage ? (
        <img
          src={agent.avatarUrl}
          alt={`تصویر ${agent.name}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className={`${sizeClass} rounded-full border border-slate-700 object-cover shadow-sm`}
        />
      ) : (
        <span
          aria-label={`تصویر جایگزین ${agent.name}`}
          className={`${sizeClass} grid place-items-center rounded-full border border-slate-700 bg-slate-800 text-xs font-bold text-slate-100`}
          style={{ boxShadow: `inset 0 0 0 2px ${agent.color}22` }}
        >
          {initials(agent.name)}
        </span>
      )}

      {showHoverCard && (
        <span
          role="tooltip"
          className="pointer-events-none absolute start-1/2 top-full z-50 mt-2 hidden w-72 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-950 p-3 text-start shadow-2xl group-hover/avatar:block group-focus-within/avatar:block"
        >
          <span className="block text-sm font-semibold text-slate-100">{agent.name}</span>
          <span className="mt-0.5 block text-xs font-medium text-indigo-300">{role?.name ?? 'Specialist'}</span>
          {role?.description && (
            <span dir="auto" className="mt-2 block text-xs leading-5 text-slate-400">{role.description}</span>
          )}
          {role && role.skills.length > 0 && (
            <span className="mt-2 flex flex-wrap gap-1.5">
              {role.skills.map(skill => (
                <span key={skill} dir="auto" className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300">
                  {skill}
                </span>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
