import { describe, expect, it } from 'vitest';
import { buildExternalChatTitleHint } from '@/lib/promptBuilder';

describe('external chat title hint', () => {
  it('uses only the selected agent name as the requested chat title', () => {
    const hint = buildExternalChatTitleHint({ name: 'Emma' });

    expect(hint[0]).toBe('CHAT TITLE: Emma');
    expect(hint[1]).toContain('use exactly "Emma" as the conversation title');
    expect(hint[1]).toContain('Do not add the role, room name, project name, or task');
  });
});
