import { describe, expect, it } from 'vitest';
import { defaultTeams } from '@/lib/defaultCompany';
import { defaultThinkRooms } from '@/lib/thinkRooms';

describe('default think rooms', () => {
  it('defines one specialized think room for every default team', () => {
    expect(defaultThinkRooms).toHaveLength(defaultTeams.length);

    const teamIds = new Set(defaultTeams.map(team => team.id));
    for (const room of defaultThinkRooms) {
      expect(teamIds.has(room.teamId), `${room.name} must reference a default team`).toBe(true);
      expect(room.name).toContain('Think Room');
      expect(room.description.length).toBeGreaterThan(30);
    }
  });

  it('keeps think room names and team bindings unique', () => {
    expect(new Set(defaultThinkRooms.map(room => room.name)).size).toBe(defaultThinkRooms.length);
    expect(new Set(defaultThinkRooms.map(room => room.teamId)).size).toBe(defaultThinkRooms.length);
  });
});
