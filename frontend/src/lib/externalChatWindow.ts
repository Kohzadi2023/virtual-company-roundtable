interface ExternalChatWindowRecord {
  targetName: string;
  url: string;
  windowRef: Window;
}

const openWindows = new Map<string, ExternalChatWindowRecord>();

function safeTargetPart(value: string): string {
  const normalized = value.trim().toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'chat';
}

export function externalChatWindowTarget(agentId: string): string {
  return `virtual-company-ai-${safeTargetPart(agentId)}`;
}

export type ExternalChatOpenResult = 'opened' | 'focused' | 'navigated' | 'blocked';

/**
 * Opens one reusable browser tab/window per Agent.
 *
 * Browser security does not let the app enumerate arbitrary tabs that the user
 * opened manually. This helper can, however, reuse tabs created by Virtual
 * Company and also asks the browser to reuse the same named browsing context
 * after an app refresh when the browser still has it available.
 */
export function openOrFocusExternalChat(agentId: string, url: string): ExternalChatOpenResult {
  const cleanUrl = url.trim();
  if (!cleanUrl) return 'blocked';

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
