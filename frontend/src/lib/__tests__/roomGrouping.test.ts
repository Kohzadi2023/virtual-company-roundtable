import { describe, expect, it } from 'vitest';
import { groupRoomsByProject } from '@/lib/roomGrouping';
import type { ProjectDefinition, Room } from '@/types/domain';

function project(id: string, name: string): ProjectDefinition {
  return { id, name, description: '', emoji: '📁', createdAt: 0 };
}

function room(id: string, projectId?: string): Room {
  return { id, name: id, emoji: '🏢', projectId, agentIds: [], messages: [], createdAt: 0 };
}

describe('groupRoomsByProject', () => {
  it('groups rooms under their project, preserving project order', () => {
    const projects = [project('p-general', 'General'), project('p-marketing', 'Marketing')];
    const rooms = [room('r1', 'p-marketing'), room('r2', 'p-general'), room('r3', 'p-marketing')];

    const groups = groupRoomsByProject(rooms, projects, 'p-general');

    expect(groups).toHaveLength(2);
    expect(groups[0]?.project.id).toBe('p-general');
    expect(groups[0]?.rooms.map(r => r.id)).toEqual(['r2']);
    expect(groups[1]?.project.id).toBe('p-marketing');
    expect(groups[1]?.rooms.map(r => r.id)).toEqual(['r1', 'r3']);
  });

  it('falls back a room with no projectId to the default project instead of dropping it', () => {
    const projects = [project('p-general', 'General')];
    const rooms = [room('r1', undefined)];

    const groups = groupRoomsByProject(rooms, projects, 'p-general');

    expect(groups[0]?.rooms.map(r => r.id)).toEqual(['r1']);
  });

  it('falls back a room whose projectId matches no known project, rather than dropping it', () => {
    const projects = [project('p-general', 'General'), project('p-marketing', 'Marketing')];
    const rooms = [room('r1', 'p-deleted')];

    const groups = groupRoomsByProject(rooms, projects, 'p-general');

    expect(groups.find(g => g.project.id === 'p-general')?.rooms.map(r => r.id)).toEqual(['r1']);
    expect(groups.find(g => g.project.id === 'p-marketing')?.rooms).toEqual([]);
  });

  it('includes a project with zero rooms as an empty group, not omitted', () => {
    const projects = [project('p-general', 'General'), project('p-empty', 'Empty')];
    const rooms = [room('r1', 'p-general')];

    const groups = groupRoomsByProject(rooms, projects, 'p-general');

    expect(groups.find(g => g.project.id === 'p-empty')?.rooms).toEqual([]);
  });
});
