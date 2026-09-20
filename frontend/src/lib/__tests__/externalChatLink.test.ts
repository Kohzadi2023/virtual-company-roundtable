import { describe, expect, it } from 'vitest';
import { isValidExternalChatUrl, normalizeExternalChatUrl } from '@/lib/externalChatLink';

describe('external chat links', () => {
  it('normalizes pasted conversation links that omit the scheme', () => {
    expect(normalizeExternalChatUrl('chatgpt.com/c/example')).toBe('https://chatgpt.com/c/example');
    expect(normalizeExternalChatUrl('  https://claude.ai/chat/example  ')).toBe('https://claude.ai/chat/example');
  });

  it('accepts valid http(s) links and rejects malformed input', () => {
    expect(isValidExternalChatUrl('gemini.google.com/app/example')).toBe(true);
    expect(isValidExternalChatUrl('https://chat.deepseek.com/a/chat/s/example')).toBe(true);
    expect(isValidExternalChatUrl('not a url')).toBe(false);
    expect(isValidExternalChatUrl('')).toBe(false);
  });
});
