import { useEffect, useState } from 'react';
import { formatUsd } from '@/lib/llm/apiRun';
import {
  cachedInputShare,
  clearUsage,
  loadBudgetState,
  monthSpendUsd,
  saveBudgetSettings,
  type BudgetSettings,
} from '@/lib/llm/budget';
import { clearApiKey, getApiKey, isSessionOnlyKey, maskApiKey, setApiKey } from '@/lib/llm/credentials';
import { LLM_CHANGE_EVENT, getLlmSettings, notifyLlmChange, updateLlmSettings } from '@/lib/llm/llmSettings';
import type { ThinkingPreference } from '@/lib/llm/llmSettings';
import { MODELS } from '@/lib/llm/pricing';

function BudgetField({
  label,
  hint,
  value,
  step,
  onCommit,
}: {
  label: string;
  hint: string;
  value: number;
  step: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
      setDraft(String(value));
      return;
    }
    onCommit(parsed);
  };
  return (
    <label className="block text-xs">
      <span className="font-semibold text-slate-700">{label}</span>
      <input
        type="number"
        min={0}
        step={step}
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') commit();
        }}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
      />
      <span className="mt-1 block text-[10px] leading-4 text-slate-400">{hint}</span>
    </label>
  );
}

export function LlmSettingsLauncher() {
  const [open, setOpen] = useState(false);
  const [, setRevision] = useState(0);
  const [keyDraft, setKeyDraft] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(LLM_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(LLM_CHANGE_EVENT, refresh);
  }, []);

  const savedKey = getApiKey('gemini');
  const budget = loadBudgetState();
  const settings = getLlmSettings();
  const monthSpend = monthSpendUsd(budget.entries, Date.now());
  const cacheShare = cachedInputShare(budget.entries);

  const saveKey = () => {
    if (!keyDraft.trim()) return;
    const result = setApiKey('gemini', keyDraft);
    setKeyDraft('');
    setStatus(result === 'saved'
      ? 'API key saved on this device only.'
      : 'Browser storage is full, so the key is kept for this session only. Re-enter it after reloading, or free space by archiving or deleting old rooms.');
    notifyLlmChange();
  };

  const removeKey = () => {
    clearApiKey('gemini');
    setStatus('API key removed. Manual copy/paste mode is unaffected.');
    notifyLlmChange();
  };

  const commitBudget = (patch: Partial<BudgetSettings>) => {
    saveBudgetSettings(patch);
    setStatus('Budget saved.');
    notifyLlmChange();
  };

  const resetUsage = () => {
    if (!window.confirm('Clear the recorded API usage? Monthly and per-meeting totals will restart from zero.')) return;
    clearUsage();
    setStatus('Usage history cleared.');
    notifyLlmChange();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        title="Optional: run agents through the Gemini API with your own key"
      >
        <span aria-hidden="true">⚡</span> AI API
      </button>

      {open ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/40 p-5" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="AI API settings">
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">AI API (optional)</h2>
                <p className="mt-0.5 text-xs text-slate-500">Connect your own Gemini key to run agents automatically. Without a key, nothing changes: you keep copying and pasting.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close AI API settings">✕</button>
            </header>

            <div className="space-y-4 p-5">
              <section className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-bold text-slate-800">Gemini API key</h3>
                {savedKey ? (
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <span className="rounded-md bg-emerald-50 px-2 py-1 font-mono text-emerald-700">{maskApiKey(savedKey)}{isSessionOnlyKey('gemini') ? ' · this session only' : ''}</span>
                    <button type="button" onClick={removeKey} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600">Remove key</button>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={keyDraft}
                      onChange={event => setKeyDraft(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') saveKey();
                      }}
                      placeholder="Paste your Gemini API key"
                      aria-label="Gemini API key"
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                    />
                    <button type="button" disabled={!keyDraft.trim()} onClick={saveKey} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Save key</button>
                  </div>
                )}
                <p className="mt-2 text-[10px] leading-4 text-slate-400">
                  The key stays in this browser/app on this device. It is never added to backups, exports, or debug snapshots. When you use “Run via API”, the prompt for that agent — including room messages and memory — is sent to Google.
                </p>
              </section>

              <section className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-bold text-slate-800">Models and token use</h3>
                <label className="mt-2 block text-xs">
                  <span className="font-semibold text-slate-700">Main model (Olivia, and everyone unless set below)</span>
                  <select
                    value={settings.model}
                    onChange={event => updateLlmSettings({ model: event.target.value })}
                    aria-label="Gemini model"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  >
                    {MODELS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
                <label className="mt-3 block text-xs">
                  <span className="font-semibold text-slate-700">Specialist model</span>
                  <select
                    value={settings.specialistModel ?? ''}
                    onChange={event => updateLlmSettings({ specialistModel: event.target.value === '' ? null : event.target.value })}
                    aria-label="Specialist model"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  >
                    <option value="">Same as main model</option>
                    {MODELS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                  <span className="mt-1 block text-[10px] leading-4 text-slate-400">A cheaper model for specialist turns can cut the bill noticeably; Olivia keeps the main model for staffing, proposals and synthesis.</span>
                </label>
                <label className="mt-3 block text-xs">
                  <span className="font-semibold text-slate-700">Thinking effort</span>
                  <select
                    value={settings.thinking}
                    onChange={event => updateLlmSettings({ thinking: event.target.value as ThinkingPreference })}
                    aria-label="Thinking effort"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  >
                    <option value="low">Low (cheaper, recommended)</option>
                    <option value="default">Model default (more reasoning, costs more)</option>
                  </select>
                  <span className="mt-1 block text-[10px] leading-4 text-slate-400">Hidden reasoning is billed like output. If Gemini rejects this setting the app retries without it automatically.</span>
                </label>
                <div className="mt-3 flex items-start justify-between gap-3 text-xs">
                  <span>
                    <span className="font-semibold text-slate-700">Token saver</span>
                    <span className="mt-0.5 block text-[10px] leading-4 text-slate-400">Summarises older discussion sooner (keeps the brief, Olivia's summaries and the latest decision proposal) so each call sends less. Turn off for maximum fidelity.</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.tokenSaver}
                    aria-label="Token saver"
                    onClick={() => updateLlmSettings({ tokenSaver: !settings.tokenSaver })}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition ${settings.tokenSaver ? 'bg-violet-600' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${settings.tokenSaver ? 'start-[22px]' : 'start-0.5'}`} />
                  </button>
                </div>
                <p className="mt-3 text-[10px] leading-4 text-slate-400">Costs shown in the app are estimates from public prices, not a bill.</p>
              </section>

              <section className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-bold text-slate-800">Budget limits</h3>
                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  <BudgetField label="Per meeting (USD)" hint="0 blocks all API calls" value={budget.settings.perMeetingUsd} step={0.5} onCommit={value => commitBudget({ perMeetingUsd: value })} />
                  <BudgetField label="Per month (USD)" hint="All meetings combined" value={budget.settings.perMonthUsd} step={1} onCommit={value => commitBudget({ perMonthUsd: value })} />
                  <BudgetField label="Max calls per meeting" hint="Stops runaway loops" value={budget.settings.maxCallsPerMeeting} step={1} onCommit={value => commitBudget({ maxCallsPerMeeting: Math.floor(value) })} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <span>This month: <strong>{formatUsd(monthSpend)}</strong> of {formatUsd(budget.settings.perMonthUsd)} · {budget.entries.length} recorded calls{cacheShare === undefined ? '' : ` · ${Math.round(cacheShare * 100)}% of input served from cache`}</span>
                  <button type="button" onClick={resetUsage} className="font-semibold text-slate-500 underline hover:text-slate-800">Clear usage</button>
                </div>
                <p className="mt-2 text-[10px] leading-4 text-slate-400">Limits are enforced by this app only. They cannot stop spending made with the same key elsewhere.</p>
              </section>

              <div className="min-h-4 text-[11px] font-medium text-emerald-600" role="status">{status}</div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
