import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string;
  copied: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: '', copied: false };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error, copied: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const componentStack = info.componentStack ?? '';
    this.setState({ componentStack });
    console.error('[Virtual Company] Unhandled UI error.', error, componentStack);

    try {
      sessionStorage.setItem('virtual-company:last-ui-error', JSON.stringify({
        name: error.name,
        message: error.message,
        stack: error.stack ?? '',
        componentStack,
        capturedAt: new Date().toISOString(),
      }));
    } catch {
      // Diagnostics must never make an existing UI failure worse.
    }
  }

  private diagnostics = (): string => {
    const { error, componentStack } = this.state;
    if (!error) return '';
    return [
      `${error.name}: ${error.message}`,
      error.stack ?? '',
      componentStack ? `Component stack:${componentStack}` : '',
    ].filter(Boolean).join('\n\n');
  };

  private handleCopyDiagnostics = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(this.diagnostics());
      this.setState({ copied: true });
    } catch {
      this.setState({ copied: false });
    }
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const diagnostics = this.diagnostics();

    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f9fc] px-6 py-8 text-center text-slate-700" role="alert">
        <div className="w-full max-w-2xl space-y-3">
          <p className="text-lg font-semibold">Something went wrong.</p>
          <p className="text-sm text-slate-500">
            The app hit an unexpected error and could not continue safely. Your workspace data is still preserved.
          </p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => void this.handleCopyDiagnostics()}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {this.state.copied ? 'Copied ✓' : 'Copy technical details'}
            </button>
          </div>
          <details className="rounded-lg border border-slate-200 bg-white text-left">
            <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-slate-600">Technical details</summary>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words border-t border-slate-100 px-4 py-3 text-[11px] leading-5 text-slate-600">{diagnostics}</pre>
          </details>
        </div>
      </div>
    );
  }
}
