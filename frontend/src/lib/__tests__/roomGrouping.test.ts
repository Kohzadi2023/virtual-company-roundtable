import { describe, expect, it } from 'vitest';
import { groupRoomsByProject } from '@/lib/roomGrouping';
import type { ProjectDefinition, Room } from '@/types/domain';

function project(id: string, name: string): ProjectDefinition {
  return { id, name, description: '', emoji: '📁', createdAt: 0 };
}

function room(id: string, projectId?: string, branchOfRoomId?: string): Room {
  return { id, name: id, emoji: '🏢', projectId, branchOfRoomId, agentIds: [], messages: [], createdAt: 0 };
}

describe('groupRoomsByProject', () => {
  it('groups rooms under their project, preserving project order', () => {
    const projects = [project('p-general', 'General'), project('p-marketing', 'Marketing')];
    const rooms = [room('r1', 'p-marketing'), room('r2', 'p-general'), room('r3', 'p-marketing')];

    const groups = groupRoomsByProject(rooms, projects, 'p-general');

    expect(groups).toHaveLength(2);
    expect(groups[0]?.project.id).toBe('p-general');
    expect(groups[0]?.rooms.map(entry => entry.room.id)).toEqual(['r2']);
    expect(groups[1]?.project.id).toBe('p-marketing');
    expect(groups[1]?.rooms.map(entry => entry.room.id)).toEqual(['r1', 'r3']);
  });

  it('falls back a room with no projectId to the default project instead of dropping it', () => {
    const projects = [project('p-general', 'General')];
    const rooms = [room('r1', undefined)];

    const groups = groupRoomsByProject(rooms, projects, 'p-general');

    expect(groups[0]?.rooms.map(entry => entry.room.id)).toEqual(['r1']);
  });

  it('falls back a room whose projectId matches no known project, rather than dropping it', () => {
    const projects = [project('p-general', 'General'), project('p-marketing', 'Marketing')];
    const rooms = [room('r1', 'p-deleted')];

    const groups = groupRoomsByProject(rooms, projects, 'p-general');

    expect(groups.find(g => g.project.id === 'p-general')?.rooms.map(entry => entry.room.id)).toEqual(['r1']);
    expect(groups.find(g => g.project.id === 'p-marketing')?.rooms).toEqual([]);
  });

  it('includes a project with zero rooms as an empty group, not omitted', () => {
    const projects = [project('p-general', 'General'), project('p-empty', 'Empty')];
    const rooms = [room('r1', 'p-general')];

    const groups = groupRoomsByProject(rooms, projects, 'p-general');

    expect(groups.find(g => g.project.id === 'p-empty')?.rooms).toEqual([]);
  });

  it('nests a room branched from another under that room instead of listing it as a sibling', () => {
    const projects = [project('p-general', 'General')];
    const rooms = [
      room('parent', 'p-general'),
      room('other', 'p-general'),
      room('followup', 'p-general', 'parent'),
    ];

    const groups = groupRoomsByProject(rooms, projects, 'p-general');
    const general = groups[0]!;

    expect(general.rooms.map(entry => entry.room.id)).toEqual(['parent', 'other']);
    expect(general.rooms.find(entry => entry.room.id === 'parent')?.children.map(r => r.id)).toEqual(['followup']);
    expect(general.roomCount).toBe(3);
  });

  it('flattens a chain of branches under the topmost ancestor', () => {
    const projects = [project('p-general', 'General')];
    const rooms = [
      room('grandparent', 'p-general'),
      room('parent', 'p-general', 'grandparent'),
      room('child', 'p-general', 'parent'),
    ];

    const groups = groupRoomsByProject(rooms, projects, 'p-general');
    const general = groups[0]!;

    expect(general.rooms.map(entry => entry.room.id)).toEqual(['grandparent']);
    expect(general.rooms[0]?.children.map(r => r.id)).toEqual(['parent', 'child']);
  });

  it('treats a branch whose parent is missing or in another project as top-level', () => {
    const projects = [project('p-general', 'General'), project('p-marketing', 'Marketing')];
    const rooms = [
      room('r1', 'p-general', 'deleted-parent'),
      room('parent-in-marketing', 'p-marketing'),
      room('r2', 'p-general', 'parent-in-marketing'),
    ];

    const groups = groupRoomsByProject(rooms, projects, 'p-general');
    const general = groups.find(g => g.project.id === 'p-general')!;

    expect(general.rooms.map(entry => entry.room.id).sort()).toEqual(['r1', 'r2']);
    expect(general.rooms.every(entry => entry.children.length === 0)).toBe(true);
  });

  it('does not hang on a cyclical branchOfRoomId', () => {
    const projects = [project('p-general', 'General')];
    const rooms = [
      room('a', 'p-general', 'b'),
      room('b', 'p-general', 'a'),
    ];

    const groups = groupRoomsByProject(rooms, projects, 'p-general');
    expect(groups[0]?.roomCount).toBe(2);
  });
});
