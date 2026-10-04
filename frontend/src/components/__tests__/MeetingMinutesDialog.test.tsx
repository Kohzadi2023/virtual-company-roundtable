import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MeetingMinutesDialog } from '@/components/MeetingMinutesDialog';
import { BRIEF_DISCLAIMER } from '@/lib/executiveBrief';
import { printMarkdown } from '@/lib/printMarkdown';
import { useWorkspaceStore } from '@/store/workspaceStore';

vi.mock('@/lib/printMarkdown', () => ({ printMarkdown: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const proposal = JSON.stringify({
  title: 'Pilot Go Decision',
  outcome: 'CONDITIONAL_GO',
  details: 'Run a bounded pilot.',
  checklist: [{ item: 'Code signing issued', status: 'condition' }],
  voteQuestion: 'Support?',
});

describe('MeetingMinutesDialog decision brief tab', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.setState({
      rooms: [{
        id: 'room-a',
        name: 'Pilot Review',
        emoji: '🏢',
        languageCode: 'en',
        agentIds: [],
        teamIds: [],
        individualAgentIds: [],
        messages: [{
          id: 'm-proposal',
          authorType: 'agent',
          authorId: 'agent-olivia',
          authorNameSnapshot: 'Olivia',
          content: `VC_DECISION_PROPOSAL\n\`\`\`json\n${proposal}\n\`\`\``,
          createdAt: 1,
        }],
        createdAt: 1,
      }],
      decisions: [],
      actionItems: [],
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

  const click = (label: string) => {
    const button = Array.from(container.querySelectorAll('button')).find(item => item.textContent?.trim() === label);
    if (!button) throw new Error(`No button "${label}"`);
    act(() => button.click());
  };

  it('shows the executive brief with the legal disclaimer and the user-ratification status', () => {
    act(() => root.render(<MeetingMinutesDialog roomId="room-a" onClose={() => undefined} />));
    click('Decision Brief');

    const text = container.textContent ?? '';
    expect(text).toContain('Executive Decision Brief');
    expect(text).toContain('Pilot Go Decision');
    expect(text).toContain('CONDITIONAL GO');
    expect(text).toContain(BRIEF_DISCLAIMER);
    expect(text).toContain('no AI used');
  });

  it('prints the brief itself, not the plain minutes', () => {
    act(() => root.render(<MeetingMinutesDialog roomId="room-a" onClose={() => undefined} />));
    expect(Array.from(container.querySelectorAll('button')).some(item => item.textContent === 'Print / Save PDF')).toBe(false);

    click('Decision Brief');
    click('Print / Save PDF');

    expect(printMarkdown).toHaveBeenCalledTimes(1);
    const [markdown, options] = vi.mocked(printMarkdown).mock.calls[0]!;
    expect(markdown).toContain('# Executive Decision Brief');
    expect(options.dir).toBe('ltr');
  });

  it('surfaces a print failure instead of failing silently', () => {
    vi.mocked(printMarkdown).mockImplementationOnce(() => {
      throw new Error('Printing is not available in this window.');
    });
    act(() => root.render(<MeetingMinutesDialog roomId="room-a" onClose={() => undefined} />));
    click('Decision Brief');
    click('Print / Save PDF');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Printing is not available in this window.');
  });
});
