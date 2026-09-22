import { describe, expect, it } from 'vitest';
import {
  TUTORIAL_LANGUAGE_OPTIONS,
  TUTORIAL_LOCALES,
  tutorialLanguageFromBrowser,
} from '@/lib/tutorialContent';

describe('multilingual tutorial content', () => {
  it('exposes the supported languages', () => {
    expect(TUTORIAL_LANGUAGE_OPTIONS.map(item => item.value)).toEqual(['en', 'fa', 'fr', 'es', 'ar']);
  });

  it('selects the first supported browser language and falls back to English', () => {
    expect(tutorialLanguageFromBrowser(['de-DE', 'fa-IR', 'en-US'])).toBe('fa');
    expect(tutorialLanguageFromBrowser(['fr-CA'])).toBe('fr');
    expect(tutorialLanguageFromBrowser(['de-DE'])).toBe('en');
  });

  it('keeps the same complete section map in every locale', () => {
    const expectedIds = TUTORIAL_LOCALES.en.sections.map(section => section.id);
    expect(expectedIds).toHaveLength(12);

    for (const locale of Object.values(TUTORIAL_LOCALES)) {
      expect(locale.sections.map(section => section.id)).toEqual(expectedIds);
      expect(locale.sections.every(section => section.title && section.summary && section.paragraphs.length > 0)).toBe(true);
    }
  });

  it('uses RTL direction for Persian and Arabic only', () => {
    expect(TUTORIAL_LOCALES.fa.direction).toBe('rtl');
    expect(TUTORIAL_LOCALES.ar.direction).toBe('rtl');
    expect(TUTORIAL_LOCALES.en.direction).toBe('ltr');
    expect(TUTORIAL_LOCALES.fr.direction).toBe('ltr');
    expect(TUTORIAL_LOCALES.es.direction).toBe('ltr');
  });
});
