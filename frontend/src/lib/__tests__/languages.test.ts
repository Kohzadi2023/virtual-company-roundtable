import { describe, expect, it } from 'vitest';
import { getRoomLanguage } from '@/lib/languages';

describe('room language direction', () => {
  it('uses RTL for Persian and Arabic rooms', () => {
    expect(getRoomLanguage('fa').dir).toBe('rtl');
    expect(getRoomLanguage('ar').dir).toBe('rtl');
  });

  it('keeps LTR languages left-to-right', () => {
    expect(getRoomLanguage('en').dir).toBe('ltr');
    expect(getRoomLanguage('fr').dir).toBe('ltr');
  });

  it('falls back to English/LTR for unknown room languages', () => {
    expect(getRoomLanguage('unknown').code).toBe('en');
    expect(getRoomLanguage('unknown').dir).toBe('ltr');
  });
});
