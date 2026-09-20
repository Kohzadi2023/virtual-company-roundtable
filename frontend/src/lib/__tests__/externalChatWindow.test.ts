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

describe('external AI browser tab reuse', () => {
  beforeEach(() => resetExternalChatWindowRegistry());
  afterEach(() => vi.restoreAllMocks());

  it('uses one stable named browser target per agent', () => {
    expect(externalChatWindowTarget('Agent Emma')).toBe('virtual-company-ai-agent-emma');
    expect(externalChatWindowTarget('agent-olivia')).toBe('virtual-company-ai-agent-olivia');
  });

  it('focuses an already-open agent tab instead of opening a duplicate', () => {
    const tab = fakeWindow();
    const open = vi.spyOn(window, 'open').mockReturnValue(tab);
    const url = 'https://chatgpt.com/c/example';

    expect(openOrFocusExternalChat('agent-emma', url)).toBe('opened');
    expect(openOrFocusExternalChat('agent-emma', url)).toBe('focused');

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(url, 'virtual-company-ai-agent-emma');
    expect(tab.focus).toHaveBeenCalledTimes(2);
  });

  it('reuses the same named agent target when the saved conversation URL changes', () => {
    const firstTab = fakeWindow();
    const navigatedTab = fakeWindow();
    const open = vi.spyOn(window, 'open')
      .mockReturnValueOnce(firstTab)
      .mockReturnValueOnce(navigatedTab);

    expect(openOrFocusExternalChat('agent-sophia', 'https://gemini.google.com/app/one')).toBe('opened');
    expect(openOrFocusExternalChat('agent-sophia', 'https://gemini.google.com/app/two')).toBe('navigated');

    expect(open).toHaveBeenNthCalledWith(2, 'https://gemini.google.com/app/two', 'virtual-company-ai-agent-sophia');
    expect(navigatedTab.focus).toHaveBeenCalledTimes(1);
  });

  it('reports a blocked popup without caching a dead tab', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    expect(openOrFocusExternalChat('agent-mike', 'https://chatgpt.com/')).toBe('blocked');
    expect(openOrFocusExternalChat('agent-mike', 'https://chatgpt.com/')).toBe('blocked');
    expect(open).toHaveBeenCalledTimes(2);
  });
});
