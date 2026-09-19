import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT_ID, useWorkspaceStore } from '@/store/workspaceStore';

function reset(): void {
  useWorkspaceStore.setState({
    rooms: [],
    activeRoomId: null,
    roles: [],
    agents: [],
    teams: [],
    projects: [],
    decisions: [],
    actionItems: [],
    agentContext: {},
    hydrated: true,
    syncState: 'idle',
  });
  useWorkspaceStore.getState().seedDefaultCompany();
}

describe('project management', () => {
  beforeEach(reset);

  it('assigns legacy/default rooms to General and lets rooms move between projects', () => {
    const initial = useWorkspaceStore.getState();
    const roomId = initial.rooms[0]!.id;
    expect(initial.projects.some(project => project.id === DEFAULT_PROJECT_ID)).toBe(true);
    expect(initial.rooms[0]?.projectId).toBe(DEFAULT_PROJECT_ID);

    const projectId = initial.createProject('LogiCount', '📊', 'Accounting automation');
    expect(projectId).toBeTruthy();
    initial.setRoomProject(roomId, projectId!);

    const room = useWorkspaceStore.getState().rooms.find(item => item.id === roomId)!;
    expect(room.projectId).toBe(projectId);
  });

  it('new rooms inherit the active room project', () => {
    const state = useWorkspaceStore.getState();
    const projectId = state.createProject('Atoms', '⚛️', 'Agent platform')!;
    const firstRoomId = state.rooms[0]!.id;
    state.setRoomProject(firstRoomId, projectId);
    state.setActiveRoom(firstRoomId);

    const nextRoomId = state.createRoom('Architecture');
    const nextRoom = useWorkspaceStore.getState().rooms.find(room => room.id === nextRoomId)!;
    expect(nextRoom.projectId).toBe(projectId);
  });

  it('records decision lifecycle with room evidence', () => {
    const state = useWorkspaceStore.getState();
    const projectId = state.projects[0]!.id;
    const roomId = state.rooms[0]!.id;
    const decisionId = state.addDecision({
      projectId,
      roomId,
      title: 'Use a modular monolith',
      details: 'Keep bounded modules inside one deployable application.',
      evidence: '[M03]',
      status: 'proposed',
    })!;

    state.updateDecision(decisionId, { status: 'approved' });
    const decision = useWorkspaceStore.getState().decisions.find(item => item.id === decisionId)!;
    expect(decision.status).toBe('approved');
    expect(decision.roomId).toBe(roomId);
    expect(decision.evidence).toBe('[M03]');
  });

  it('tracks action item owner deadline priority and workflow status', () => {
    const state = useWorkspaceStore.getState();
    const projectId = state.projects[0]!.id;
    const actionId = state.addActionItem({
      projectId,
      roomId: state.rooms[0]!.id,
      title: 'Draft architecture ADR',
      owner: 'Emma',
      deadline: '2026-09-25',
      evidence: '[M03]',
      priority: 'high',
      status: 'todo',
    })!;

    state.updateActionItem(actionId, { status: 'in-progress' });
    state.updateActionItem(actionId, { status: 'done' });
    const action = useWorkspaceStore.getState().actionItems.find(item => item.id === actionId)!;
    expect(action.owner).toBe('Emma');
    expect(action.deadline).toBe('2026-09-25');
    expect(action.priority).toBe('high');
    expect(action.status).toBe('done');
  });
});
