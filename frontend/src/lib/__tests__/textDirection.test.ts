import { describe, expect, it } from 'vitest';
import { isPredominantlyRtl, textDirection } from '@/lib/textDirection';

describe('textDirection', () => {
  it('detects Persian and Arabic room titles as RTL', () => {
    expect(isPredominantlyRtl('سرمایه گذاری')).toBe(true);
    expect(isPredominantlyRtl('تحلیل بازار 2026')).toBe(true);
    expect(textDirection('غرفة الاستثمار')).toBe('rtl');
  });

  it('keeps English and mixed Latin-dominant titles LTR', () => {
    expect(isPredominantlyRtl('Investment Review')).toBe(false);
    expect(isPredominantlyRtl('Q3 بررسی')).toBe(false);
    expect(textDirection('Launch Review 2026')).toBe('ltr');
  });
});
