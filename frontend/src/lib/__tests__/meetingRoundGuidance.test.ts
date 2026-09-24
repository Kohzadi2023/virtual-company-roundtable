import { describe, expect, it } from 'vitest';
import { getSpecialistRoundGuidance } from '@/lib/meetingRoundGuidance';

describe('specialist round guidance', () => {
  it('keeps stable semantics for each controlled meeting round', () => {
    const round1 = getSpecialistRoundGuidance({ roundIndex: 0 });
    const round2 = getSpecialistRoundGuidance({ roundIndex: 1 });
    const round3 = getSpecialistRoundGuidance({ roundIndex: 2 });
    const round4 = getSpecialistRoundGuidance({ roundIndex: 3 });

    expect(round1.instruction).toContain('independent analysis');
    expect(round1.instruction).toContain('initial recommendation');

    expect(round2.instruction).toContain('Critique the prior contributions');
    expect(round2.instruction).toContain('unsupported assumptions');

    expect(round3.instruction).toContain('revised proposal');
    expect(round3.instruction).toContain('what changed');
    expect(round3.instruction).toContain('acceptance or validation criteria');

    expect(round4.instruction).toContain('final professional position');
    expect(round4.instruction).toContain('proceeding conditionally');
    expect(round4.instruction).toContain('residual risks');
  });

  it('has a safe fallback for a future custom round index', () => {
    const guidance = getSpecialistRoundGuidance({ roundIndex: 8 });

    expect(guidance.purpose).toContain('current meeting round');
    expect(guidance.instruction).toContain('materially advances the current round');
  });
});
