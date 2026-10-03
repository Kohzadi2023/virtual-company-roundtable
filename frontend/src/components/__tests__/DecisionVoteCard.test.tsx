import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DecisionVoteCard } from '@/components/DecisionVoteCard';
import { defaultAgents, defaultRoles, defaultTeams, MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { ensureMeetingRoom } from '@/lib/meetingOrchestration';
import { useWorkspaceStore } from '@/store/workspaceStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const proposal = {
  title: 'Adopt the portfolio',
  outcome: 'GO',
  details: 'Proceed with the staged plan.',
  checklist: [{ item: 'Privacy review complete', status: 'condition', evidence: 'Pending legal sign-off.' }],
  voteQuestion: 'Do you support this decision proposal as written?',
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  const agentIds = [MEETING_FACILITATOR_AGENT_ID, 'agent-emma'];
  useWorkspaceStore.setState({
    rooms: [{
      id: 'room-1',
      name: 'Review',
      emoji: '🏢',
      agentIds,
      messages: [{
        id: 'm1',
        authorType: 'agent',
        authorId: MEETING_FACILITATOR_AGENT_ID,
        authorNameSnapshot: 'Olivia',
        content: `Final proposal.\n\nVC_DECISION_PROPOSAL\n\`\`\`json\n${JSON.stringify(proposal)}\n\`\`\``,
        createdAt: 1,
      }],
      createdAt: 1,
    }],
    activeRoomId: 'room-1',
    roles: defaultRoles.map(role => ({ ...role })),
    agents: defaultAgents.map(agent => ({ ...agent })),
    teams: defaultTeams.map(team => ({ ...team, agentIds: [...team.agentIds] })),
    projects: [],
    decisions: [],
    actionItems: [],
    agentContext: {},
    hydrated: true,
    syncState: 'idle',
  });
  ensureMeetingRoom('room-1', agentIds);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const card = () => container.querySelector('[aria-label="Decision proposal and vote"]') as HTMLElement;
const toggle = () => [...container.querySelectorAll('button')].find(button => /details/i.test(button.textContent ?? ''))!;

describe('DecisionVoteCard layout', () => {
  it('starts collapsed and pinned: title and actions visible, long body hidden', () => {
    act(() => root.render(<DecisionVoteCard roomId="room-1" />));

    expect(card().textContent).toContain('Adopt the portfolio');
    expect(card().textContent).toContain('Approve voted decision');
    expect(card().textContent).not.toContain('Privacy review complete');
    expect(card().className).toContain('sticky');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('expands to the full checklist and stops being pinned so it can never cover the conversation', () => {
    act(() => root.render(<DecisionVoteCard roomId="room-1" />));
    act(() => toggle().click());

    expect(card().textContent).toContain('Privacy review complete');
    expect(card().textContent).toContain('Proceed with the staged plan.');
    expect(card().className).not.toContain('sticky');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');

    act(() => toggle().click());
    expect(card().textContent).not.toContain('Privacy review complete');
    expect(card().className).toContain('sticky');
  });
});
