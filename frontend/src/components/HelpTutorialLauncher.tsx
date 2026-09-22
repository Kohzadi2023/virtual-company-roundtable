import { useEffect, useMemo, useRef, useState } from 'react';
import {
  TUTORIAL_LANGUAGE_OPTIONS,
  TUTORIAL_LOCALES,
  tutorialLanguageFromBrowser,
  type TutorialLanguage,
} from '@/lib/tutorialContent';

const LANGUAGE_KEY = 'virtual-company:tutorial-language:v1';

function loadLanguage(): TutorialLanguage {
  const saved = localStorage.getItem(LANGUAGE_KEY);
  if (saved === 'en' || saved === 'fa' || saved === 'fr' || saved === 'es' || saved === 'ar') return saved;
  return tutorialLanguageFromBrowser();
}

export function HelpTutorialLauncher() {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<TutorialLanguage>(() => loadLanguage());
  const [query, setQuery] = useState('');
  const [activeSectionId, setActiveSectionId] = useState('overview');
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  const locale = TUTORIAL_LOCALES[language];
  const filteredSections = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase();
    if (!clean) return locale.sections;
    return locale.sections.filter(section => {
      const haystack = [section.title, section.summary, ...section.paragraphs, ...(section.steps ?? []), ...(section.tips ?? [])]
        .join(' ')
        .toLocaleLowerCase();
      return haystack.includes(clean);
    });
  }, [locale.sections, query]);

  useEffect(() => {
    if (!open) return;
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      window.requestAnimationFrame(() => launcherRef.current?.focus());
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const changeLanguage = (next: TutorialLanguage) => {
    localStorage.setItem(LANGUAGE_KEY, next);
    setLanguage(next);
    setQuery('');
    setActiveSectionId('overview');
  };

  const close = () => {
    setOpen(false);
    window.requestAnimationFrame(() => launcherRef.current?.focus());
  };

  const scrollToSection = (sectionId: string) => {
    setActiveSectionId(sectionId);
    document.getElementById(`tutorial-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold text-violet-600 transition hover:bg-violet-50 hover:text-violet-800"
        title="Help and tutorial"
      >
        <span aria-hidden="true">?</span> Help
      </button>

      {open ? (
        <div className="fixed inset-0 z-[180] bg-[#f7f9fc]" role="dialog" aria-modal="true" aria-labelledby="tutorial-page-title">
          <div className="flex h-screen min-w-[980px] flex-col" dir={locale.direction}>
            <header className="flex h-20 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-6 shadow-sm">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-100 text-xl text-violet-700" aria-hidden="true">?</div>
              <div className="min-w-0 flex-1">
                <h1 id="tutorial-page-title" className="truncate text-xl font-bold text-slate-900">{locale.pageTitle}</h1>
                <p className="mt-0.5 truncate text-xs text-slate-500">{locale.pageSubtitle}</p>
              </div>

              <label className="shrink-0">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">{locale.languageLabel}</span>
                <select
                  value={language}
                  onChange={event => changeLanguage(event.target.value as TutorialLanguage)}
                  className="min-w-36 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                >
                  {TUTORIAL_LANGUAGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>

              <button
                ref={closeButtonRef}
                type="button"
                onClick={close}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                aria-label={locale.closeLabel}
                title={locale.closeLabel}
              >
                ✕
              </button>
            </header>

            <div className="flex min-h-0 flex-1">
              <aside className="flex w-[310px] shrink-0 flex-col border-e border-slate-200 bg-white">
                <div className="border-b border-slate-100 p-4">
                  <input
                    type="search"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder={locale.searchPlaceholder}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                  />
                  <p className="mt-2 text-[10px] leading-4 text-slate-400">{locale.guideOnlyNote}</p>
                </div>

                <nav className="min-h-0 flex-1 overflow-y-auto p-3" aria-label={locale.contentsLabel}>
                  <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{locale.contentsLabel}</div>
                  <div className="space-y-1">
                    {filteredSections.map(section => (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => scrollToSection(section.id)}
                        className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-start text-xs transition ${activeSectionId === section.id ? 'bg-violet-50 font-bold text-violet-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                      >
                        <span className="shrink-0" aria-hidden="true">{section.icon}</span>
                        <span className="leading-5">{section.title}</span>
                      </button>
                    ))}
                  </div>
                </nav>
              </aside>

              <main className="min-w-0 flex-1 overflow-y-auto scroll-smooth px-8 py-7" onScroll={event => {
                const container = event.currentTarget;
                const sections = filteredSections.map(section => ({ id: section.id, element: document.getElementById(`tutorial-${section.id}`) })).filter(item => item.element);
                const containerTop = container.getBoundingClientRect().top;
                const visible = sections.find(item => (item.element!.getBoundingClientRect().top - containerTop) >= -24);
                if (visible) setActiveSectionId(visible.id);
              }}>
                <div className="mx-auto max-w-5xl">
                  {filteredSections.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">{locale.noResults}</div>
                  ) : (
                    <div className="space-y-6">
                      {filteredSections.map(section => (
                        <section key={section.id} id={`tutorial-${section.id}`} className="scroll-mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                          <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-5">
                            <div className="flex items-start gap-3">
                              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-xl" aria-hidden="true">{section.icon}</span>
                              <div>
                                <h2 className="text-lg font-bold text-slate-900">{section.title}</h2>
                                <p className="mt-1 text-sm leading-6 text-slate-500">{section.summary}</p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4 px-6 py-5 text-sm leading-7 text-slate-700">
                            {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}

                            {section.steps?.length ? (
                              <ol className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                                {section.steps.map((step, index) => (
                                  <li key={index} className="flex items-start gap-3">
                                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-600 text-[11px] font-bold text-white">{index + 1}</span>
                                    <span>{step}</span>
                                  </li>
                                ))}
                              </ol>
                            ) : null}

                            {section.tips?.length ? (
                              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">Tips</div>
                                <ul className="space-y-1.5 text-amber-900">
                                  {section.tips.map((tip, index) => <li key={index}>• {tip}</li>)}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              </main>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
