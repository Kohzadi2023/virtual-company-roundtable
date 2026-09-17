import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Agent, RoleDefinition } from '@/types/domain';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

type Position = { top: number; left: number };

export function AgentAvatar({
  agent,
  role,
  size = 'md',
  showHoverCard = true,
}: {
  agent: Agent;
  role?: RoleDefinition | undefined;
  size?: 'sm' | 'md' | 'lg';
  showHoverCard?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [profilePosition, setProfilePosition] = useState<Position | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const sizeClass = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-14 w-14' : 'h-11 w-11';
  const showImage = Boolean(agent.avatarUrl) && !imageFailed;

  const showProfile = () => {
    if (!showHoverCard || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const cardWidth = 288;
    const cardHeight = 290;
    const gap = 12;
    const preferredLeft = rect.right + gap;
    const left = preferredLeft + cardWidth <= window.innerWidth - 12
      ? preferredLeft
      : Math.max(12, rect.left - cardWidth - gap);
    const top = Math.max(12, Math.min(rect.top - 8, window.innerHeight - cardHeight - 12));
    setProfilePosition({ top, left });
  };

  const hideProfile = () => setProfilePosition(null);

  return (
    <>
      <span
        ref={rootRef}
        className="relative inline-flex shrink-0"
        tabIndex={showHoverCard ? 0 : -1}
        onMouseEnter={showProfile}
        onMouseLeave={hideProfile}
        onFocus={showProfile}
        onBlur={hideProfile}
      >
        {showImage ? (
          <img
            src={agent.avatarUrl}
            alt={`تصویر ${agent.name}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className={`${sizeClass} rounded-full border-2 border-white object-cover shadow-sm ring-1 ring-slate-200`}
          />
        ) : (
          <span
            aria-label={`تصویر جایگزین ${agent.name}`}
            className={`${sizeClass} grid place-items-center rounded-full border-2 border-white bg-slate-200 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-300`}
            style={{ boxShadow: `inset 0 0 0 2px ${agent.color}22` }}
          >
            {initials(agent.name)}
          </span>
        )}
      </span>

      {showHoverCard && profilePosition && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[100] w-72 rounded-xl border border-slate-700 bg-slate-900 p-4 text-start text-white shadow-2xl"
          style={{ top: profilePosition.top, left: profilePosition.left }}
        >
          <div className="flex items-center gap-3">
            {showImage ? (
              <img src={agent.avatarUrl} alt="" className="h-12 w-12 rounded-full border-2 border-white/80 object-cover" />
            ) : (
              <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-700 text-sm font-bold">{initials(agent.name)}</span>
            )}
            <div>
              <div className="font-bold">{agent.name}</div>
              <div className="text-sm text-slate-300">{role?.name ?? 'Specialist'}</div>
            </div>
          </div>

          {role?.description && (
            <p dir="auto" className="mt-4 border-b border-slate-600 pb-4 text-sm leading-6 text-slate-200">{role.description}</p>
          )}

          {role && role.skills.length > 0 && (
            <div className="mt-3">
              <div className="mb-2 text-xs font-semibold text-slate-300">Key Skills</div>
              <div className="flex flex-wrap gap-1.5">
                {role.skills.map(skill => (
                  <span key={skill} dir="auto" className="rounded-md bg-slate-700 px-2 py-1 text-[11px] text-slate-100 shadow-inner">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
