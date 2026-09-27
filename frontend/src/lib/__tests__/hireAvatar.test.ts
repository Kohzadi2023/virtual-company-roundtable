import { describe, expect, it } from 'vitest';
import { avatarUrlForHire } from '@/lib/hireAvatar';

describe('avatarUrlForHire', () => {
  it('is stable for the same name regardless of case and spacing', () => {
    expect(avatarUrlForHire('Evan')).toBe(avatarUrlForHire('  evan '));
  });

  it('picks a portrait set from the first name', () => {
    expect(avatarUrlForHire('Evan')).toContain('/men/');
    expect(avatarUrlForHire('Claire Dubois')).toContain('/women/');
  });

  it('always yields a valid portrait index', () => {
    for (const name of ['Evan', 'Claire', '', 'علی', 'A'.repeat(200)]) {
      expect(avatarUrlForHire(name)).toMatch(/\/portraits\/(men|women)\/\d{1,2}\.jpg$/);
    }
  });
});
