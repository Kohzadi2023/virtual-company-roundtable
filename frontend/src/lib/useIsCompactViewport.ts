import { useEffect, useState } from 'react';

const COMPACT_BREAKPOINT_PX = 768;

function matchesCompact(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < COMPACT_BREAKPOINT_PX;
}

/**
 * True below the tablet breakpoint (768px). Used to switch the side panels
 * from permanent, layout-pushing columns to closed-by-default overlays, since
 * their fixed pixel widths don't fit next to the room content on a phone.
 */
export function useIsCompactViewport(): boolean {
  const [compact, setCompact] = useState(matchesCompact);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${COMPACT_BREAKPOINT_PX - 1}px)`);
    const update = () => setCompact(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return compact;
}
