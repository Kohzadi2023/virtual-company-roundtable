import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '@/components/ErrorBoundary';

function Boom(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when nothing throws', () => {
    const html = renderToStaticMarkup(
      <ErrorBoundary>
        <div>All good</div>
      </ErrorBoundary>,
    );

    expect(html).toContain('All good');
  });

  it('renders a recovery screen instead of letting a client render crash the whole app', () => {
    // getDerivedStateFromError only runs during the client reconciler's commit
    // path, not the legacy synchronous SSR renderer, so this exercises the
    // same createRoot path the real app uses in the browser.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    flushSync(() => {
      root.render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
    });

    expect(container.textContent).toContain('Something went wrong');
    expect(container.textContent).toContain('Reload');

    root.unmount();
    container.remove();
  });
});
