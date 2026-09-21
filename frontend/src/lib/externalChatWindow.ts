interface ExternalChatWindowRecord {
  targetName: string;
  url: string;
  windowRef: Window;
}

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type WindowWithTauri = Window & {
  __TAURI__?: {
    core?: {
      invoke?: TauriInvoke;
    };
  };
};

const openWindows = new Map<string, ExternalChatWindowRecord>();

function safeTargetPart(value: string): string {
  const normalized = value.trim().toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'chat';
}

function tauriInvoke(): TauriInvoke | null {
  return (window as WindowWithTauri).__TAURI__?.core?.invoke ?? null;
}

export function externalChatWindowTarget(agentId: string): string {
  return `virtual-company-ai-${safeTargetPart(agentId)}`;
}

export type ExternalChatOpenResult = 'opened' | 'focused' | 'navigated' | 'blocked';

/**
 * Opens one reusable browser tab/window per Agent in the web app.
 * In Tauri desktop, delegates to a native command so the saved chat URL opens
 * in the user's system browser instead of relying on WebView popup behavior.
 */
export async function openOrFocusExternalChat(agentId: string, url: string): Promise<ExternalChatOpenResult> {
  const cleanUrl = url.trim();
  if (!cleanUrl) return 'blocked';

  const invoke = tauriInvoke();
  if (invoke) {
    try {
      await invoke<void>('open_external_url', { url: cleanUrl });
      return 'opened';
    } catch {
      return 'blocked';
    }
  }

  const targetName = externalChatWindowTarget(agentId);
  const existing = openWindows.get(agentId);

  if (existing && !existing.windowRef.closed) {
    if (existing.url === cleanUrl) {
      existing.windowRef.focus();
      return 'focused';
    }

    const navigated = window.open(cleanUrl, existing.targetName);
    if (!navigated) return 'blocked';
    try { navigated.opener = null; } catch { /* Best-effort opener isolation. */ }
    navigated.focus();
    openWindows.set(agentId, { targetName: existing.targetName, url: cleanUrl, windowRef: navigated });
    return 'navigated';
  }

  openWindows.delete(agentId);
  const opened = window.open(cleanUrl, targetName);
  if (!opened) return 'blocked';
  try { opened.opener = null; } catch { /* Best-effort opener isolation. */ }
  opened.focus();
  openWindows.set(agentId, { targetName, url: cleanUrl, windowRef: opened });
  return 'opened';
}

export function forgetExternalChatWindow(agentId: string): void {
  openWindows.delete(agentId);
}

export function resetExternalChatWindowRegistry(): void {
  openWindows.clear();
}
