import { describe, expect, it } from 'vitest';
import { defaultAgents, defaultRoles } from '@/lib/defaultCompany';
import { professionalProfiles } from '@/lib/professionalProfiles';
import { buildAgentPrompt } from '@/lib/promptBuilder';

const regulatedRoleIds = [
  'role-lawyer',
  'role-immigration-lawyer',
  'role-accountant',
  'role-psychologist',
  'role-physician',
];

describe('enterprise professional skill matrices', () => {
  it('covers every built-in specialist with a deep professional profile', () => {
    expect(defaultAgents).toHaveLength(23);
    expect(defaultRoles).toHaveLength(23);

    for (const role of defaultRoles) {
      const profile = professionalProfiles[role.id];
      expect(profile, `${role.name} must have a professional profile`).toBeDefined();
      expect(profile.skillGroups.length, `${role.name} must have grouped capabilities`).toBeGreaterThanOrEqual(4);

      const skills = profile.skillGroups.flatMap(group => group.skills);
      expect(skills.length, `${role.name} must have at least 12 matrix skills`).toBeGreaterThanOrEqual(12);
      expect(new Set(skills).size, `${role.name} matrix skills should be distinct`).toBe(skills.length);
      expect(profile.deliverables.length, `${role.name} must define concrete outputs`).toBeGreaterThanOrEqual(4);
      expect(profile.scope.length, `${role.name} must define professional scope`).toBeGreaterThan(40);
      expect(profile.limitations.length, `${role.name} must define boundaries`).toBeGreaterThanOrEqual(2);
    }
  });

  it('defines explicit safety and professional boundaries for regulated roles', () => {
    for (const roleId of regulatedRoleIds) {
      const profile = professionalProfiles[roleId];
      expect(profile).toBeDefined();
      const boundaries = profile.limitations.join(' ').toLocaleLowerCase();
      expect(boundaries.length).toBeGreaterThan(80);
      expect(boundaries).toMatch(/licensed|professional|clinician|legal|tax|counsel|diagnos|jurisdiction/);
    }
  });

  it('injects the full professional matrix into copied agent prompts', () => {
    const architect = defaultRoles.find(role => role.id === 'role-architect')!;
    const emma = defaultAgents.find(agent => agent.id === 'agent-emma')!;
    const prompt = buildAgentPrompt(emma, architect, [{
      id: 'm1',
      authorType: 'user',
      content: 'Review the architecture.',
      createdAt: 1,
    }]);

    expect(prompt).toContain('Professional skill matrix:');
    expect(prompt).toContain('Domain-Driven Design');
    expect(prompt).toContain('Expected deliverables:');
    expect(prompt).toContain('Professional boundaries:');
    expect(prompt).toContain('NEW CONTEXT');
  });
});
