import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Virtual Company] Unhandled UI error.', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f9fc] px-6 text-center text-slate-700" role="alert">
        <div className="max-w-md space-y-3">
          <p className="text-lg font-semibold">Something went wrong.</p>
          <p className="text-sm text-slate-500">
            The app hit an unexpected error and could not continue safely. Your data was not lost — reloading
            will restore the last saved state.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
