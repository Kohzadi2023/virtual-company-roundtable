import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { useClickOutside } from '@/lib/useClickOutside';

/**
 * Closes a popup menu on an outside click or Escape. Returns the ref to put on
 * the element wrapping both the trigger and the panel, so clicking the trigger
 * is not treated as "outside" (it toggles the menu itself).
 */
export function useDismissibleMenu<T extends HTMLElement>(open: boolean, close: () => void): RefObject<T> {
  const ref = useRef<T>(null);
  const stableClose = useCallback(close, [close]);

  useClickOutside(ref, open, stableClose);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') stableClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, stableClose]);

  return ref;
}
