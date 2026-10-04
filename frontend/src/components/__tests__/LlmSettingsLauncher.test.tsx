import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LlmSettingsLauncher } from '@/components/LlmSettingsLauncher';
import { downloadTextFile } from '@/lib/downloadText';
import { recordUsage, resetBudgetMemory } from '@/lib/llm/budget';
import { useWorkspaceStore } from '@/store/workspaceStore';

vi.mock('@/lib/downloadText', () => ({ downloadTextFile: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('LlmSettingsLauncher cost benchmark download', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    resetBudgetMemory();
    useWorkspaceStore.setState({
      rooms: [{ id: 'room-a', name: 'Benchmark 1', emoji: '🏢', languageCode: 'en', agentIds: [], teamIds: [], individualAgentIds: [], messages: [], createdAt: 1 }],
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  const button = (label: string) => {
    const found = Array.from(container.querySelectorAll('button')).find(item => item.textContent?.includes(label));
    if (!found) throw new Error(`No button "${label}"`);
    return found;
  };

  const open = () => {
    act(() => root.render(<LlmSettingsLauncher />));
    act(() => button('AI API').click());
  };

  const typeInvoice = (value: string) => {
    const input = container.querySelector<HTMLInputElement>('input[placeholder="e.g. 1.37"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('offers no download until some usage has been recorded', () => {
    open();
    expect(container.textContent).not.toContain('Download cost benchmark');
  });

  it('downloads a report that includes the configuration and the invoice variance', () => {
    recordUsage({ at: 1_000, roomId: 'room-a', model: 'gemini-3.8-flash', costUsd: 1.5, inputTokens: 50_000, cachedInputTokens: 0, outputTokens: 5_000, thoughtTokens: 2_000 });
    open();
    typeInvoice('1.4');
    act(() => button('Download cost benchmark').click());

    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const [filename, report] = vi.mocked(downloadTextFile).mock.calls[0]!;
    expect(filename).toMatch(/^gemini-cost-benchmark-\d{4}-\d{2}-\d{2}\.md$/);
    expect(report).toContain('| Benchmark 1 |');
    expect(report).toContain('- **Default model:**');
    expect(report).toContain('**Variance:** +7.1% (app over-estimates)');
  });

  it('rejects an invalid invoice amount instead of silently producing an unreconciled report', () => {
    recordUsage({ at: 1_000, roomId: 'room-a', model: 'gemini-3.8-flash', costUsd: 1, inputTokens: 1000, outputTokens: 100 });
    open();
    typeInvoice('-3');
    act(() => button('Download cost benchmark').click());

    expect(downloadTextFile).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Enter the invoice amount as a positive number');
  });
});
