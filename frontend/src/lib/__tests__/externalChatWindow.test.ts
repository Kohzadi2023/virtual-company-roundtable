import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  externalChatWindowTarget,
  openOrFocusExternalChat,
  resetExternalChatWindowRegistry,
} from '@/lib/externalChatWindow';

function fakeWindow() {
  return {
    closed: false,
    focus: vi.fn(),
    opener: null,
  } as unknown as Window;
}

function clearTauriGlobal() {
  Reflect.deleteProperty(window, '__TAURI__');
}

describe('external AI browser tab reuse', () => {
  beforeEach(() => {
    resetExternalChatWindowRegistry();
    clearTauriGlobal();
  });
  afterEach(() => {
    clearTauriGlobal();
    vi.restoreAllMocks();
  });

  it('uses one stable named browser target per agent', () => {
    expect(externalChatWindowTarget('Agent Emma')).toBe('virtual-company-ai-agent-emma');
    expect(externalChatWindowTarget('agent-olivia')).toBe('virtual-company-ai-agent-olivia');
  });

  it('focuses an already-open agent tab instead of opening a duplicate', async () => {
    const tab = fakeWindow();
    const open = vi.spyOn(window, 'open').mockReturnValue(tab);
    const url = 'https://chatgpt.com/c/example';

    await expect(openOrFocusExternalChat('agent-emma', url)).resolves.toBe('opened');
    await expect(openOrFocusExternalChat('agent-emma', url)).resolves.toBe('focused');

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(url, 'virtual-company-ai-agent-emma');
    expect(tab.focus).toHaveBeenCalledTimes(2);
  });

  it('reuses the same named agent target when the saved conversation URL changes', async () => {
    const firstTab = fakeWindow();
    const navigatedTab = fakeWindow();
    const open = vi.spyOn(window, 'open')
      .mockReturnValueOnce(firstTab)
      .mockReturnValueOnce(navigatedTab);

    await expect(openOrFocusExternalChat('agent-sophia', 'https://gemini.google.com/app/one')).resolves.toBe('opened');
    await expect(openOrFocusExternalChat('agent-sophia', 'https://gemini.google.com/app/two')).resolves.toBe('navigated');

    expect(open).toHaveBeenNthCalledWith(2, 'https://gemini.google.com/app/two', 'virtual-company-ai-agent-sophia');
    expect(navigatedTab.focus).toHaveBeenCalledTimes(1);
  });

  it('reports a blocked popup without caching a dead tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await expect(openOrFocusExternalChat('agent-mike', 'https://chatgpt.com/')).resolves.toBe('blocked');
    await expect(openOrFocusExternalChat('agent-mike', 'https://chatgpt.com/')).resolves.toBe('blocked');
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('uses the native Tauri command instead of window.open on desktop', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, '__TAURI__', {
      configurable: true,
      value: { core: { invoke } },
    });
    const open = vi.spyOn(window, 'open');
    const url = 'https://chatgpt.com/c/desktop';

    await expect(openOrFocusExternalChat('agent-olivia', url)).resolves.toBe('opened');

    expect(invoke).toHaveBeenCalledWith('open_external_url', { url });
    expect(open).not.toHaveBeenCalled();
  });

  it('reports blocked when the native Tauri command fails', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('native open failed'));
    Object.defineProperty(window, '__TAURI__', {
      configurable: true,
      value: { core: { invoke } },
    });

    await expect(openOrFocusExternalChat('agent-olivia', 'https://chatgpt.com/')).resolves.toBe('blocked');
  });
});
