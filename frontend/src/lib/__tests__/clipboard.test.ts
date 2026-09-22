import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText, readText } from '@/lib/clipboard';

function clearTauriGlobal() {
  Reflect.deleteProperty(window, '__TAURI__');
}

function setNavigatorClipboard(value: Partial<Clipboard>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value,
  });
}

afterEach(() => {
  clearTauriGlobal();
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.restoreAllMocks();
});

describe('clipboard bridge', () => {
  it('uses native Tauri clipboard commands on desktop', async () => {
    const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'read_clipboard_text') return 'agent reply';
      if (command === 'write_clipboard_text') {
        expect(args).toEqual({ text: 'context prompt' });
        return undefined;
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    Object.defineProperty(window, '__TAURI__', {
      configurable: true,
      value: { core: { invoke } },
    });

    await expect(copyText('context prompt')).resolves.toBeUndefined();
    await expect(readText()).resolves.toBe('agent reply');
    expect(invoke).toHaveBeenNthCalledWith(1, 'write_clipboard_text', { text: 'context prompt' });
    expect(invoke).toHaveBeenNthCalledWith(2, 'read_clipboard_text');
  });

  it('uses the browser Clipboard API on web', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const browserReadText = vi.fn().mockResolvedValue('web reply');
    setNavigatorClipboard({ writeText, readText: browserReadText });

    await expect(copyText('web context')).resolves.toBeUndefined();
    await expect(readText()).resolves.toBe('web reply');

    expect(writeText).toHaveBeenCalledWith('web context');
    expect(browserReadText).toHaveBeenCalledTimes(1);
  });

  it('falls back to the browser Clipboard API when the desktop bridge fails', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('native clipboard failed'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    const browserReadText = vi.fn().mockResolvedValue('fallback reply');

    Object.defineProperty(window, '__TAURI__', {
      configurable: true,
      value: { core: { invoke } },
    });
    setNavigatorClipboard({ writeText, readText: browserReadText });

    await expect(copyText('fallback context')).resolves.toBeUndefined();
    await expect(readText()).resolves.toBe('fallback reply');

    expect(writeText).toHaveBeenCalledWith('fallback context');
    expect(browserReadText).toHaveBeenCalledTimes(1);
  });
});
