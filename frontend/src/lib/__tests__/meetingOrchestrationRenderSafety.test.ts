import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../meetingOrchestration.ts', import.meta.url), 'utf8');

describe('meeting orchestration render safety', () => {
  it('keeps the no-op guard before persistence in ensureMeetingRoom', () => {
    const start = source.indexOf('export function ensureMeetingRoom');
    const end = source.indexOf('export function setMeetingBrief');
    const ensureSource = source.slice(start, end);

    expect(ensureSource).toContain('if (unchanged) return existing;');
    expect(ensureSource.indexOf('if (unchanged) return existing;'))
      .toBeLessThan(ensureSource.lastIndexOf('saveMeetingOrchestration'));
  });
});
