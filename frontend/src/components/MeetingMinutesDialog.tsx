import { useEffect, useMemo, useState } from 'react';
import { copyText } from '@/lib/clipboard';
import { getRoomLanguage } from '@/lib/languages';
import { buildMeetingMinutes } from '@/lib/meetingMinutes';
import { buildMeetingMinutesPrompt } from '@/lib/meetingMinutesPrompt';
import { useWorkspaceStore } from '@/store/workspaceStore';

interface MeetingMinutesDialogProps {
  roomId: string | null;
  onClose: () => void;
}

export function MeetingMinutesDialog({ roomId, onClose }: MeetingMinutesDialogProps) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const [minutesMode, setMinutesMode] = useState<'local' | 'manual'>('local');
  const [manualResult, setManualResult] = useState('');
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [promptCopyError, setPromptCopyError] = useState(false);

  const language = getRoomLanguage(room?.languageCode);
  const localMinutes = useMemo(() => room ? buildMeetingMinutes(room) : '', [room]);
  const manualPrompt = useMemo(() => room ? buildMeetingMinutesPrompt(room) : '', [room]);
  const activeMinutes = minutesMode === 'manual' ? manualResult.trim() : localMinutes;

  useEffect(() => {
    setMinutesMode('local');
    setManualResult('');
    setCopied(false);
    setPromptCopied(false);
    setPromptCopyError(false);
  }, [roomId]);

  if (!roomId || !room) return null;

  const handleCopyMinutes = async () => {
    if (!activeMinutes) return;
    try {
      await copyText(activeMinutes);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const handleCopyPrompt = async () => {
    if (!manualPrompt) return;
    setPromptCopyError(false);
    try {
      await copyText(manualPrompt);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 1800);
    } catch {
      setPromptCopied(false);
      setPromptCopyError(true);
    }
  };

  const handleDownload = () => {
    if (!activeMinutes) return;
    const blob = new Blob([activeMinutes], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${room.name.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '') || 'meeting'}-minutes.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/30 p-6" role="dialog" aria-modal="true" aria-label="Meeting Minutes">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Meeting Minutes</h2>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">Manual workflow</span>
            </div>
            <p className="text-xs text-slate-500">{room.name} · {language.nativeName} · No AI API connection</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close meeting minutes">✕</button>
        </div>

        <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setMinutesMode('local')}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${minutesMode === 'local' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Local Draft
          </button>
          <button
            type="button"
            onClick={() => setMinutesMode('manual')}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${minutesMode === 'manual' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Manual AI · Copy / Paste
          </button>
        </div>

        {minutesMode === 'local' ? (
          <pre dir={language.dir} className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-5 py-4 text-start text-[13px] leading-6 text-slate-700">{localMinutes}</pre>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <div className="space-y-3">
                <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
                  <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</div>
                  <h3 className="text-sm font-bold text-slate-900">Copy grounded AI prompt</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">Includes the full room transcript, message evidence IDs, selected language, and strict anti-hallucination rules.</p>
                  <button type="button" onClick={() => void handleCopyPrompt()} className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700">
                    {promptCopied ? '✓ Prompt Copied' : '⧉ Copy AI Minutes Prompt'}
                  </button>
                  {promptCopyError ? <p className="mt-2 text-[11px] font-medium text-rose-600">Clipboard access failed. Check browser clipboard permission and try again.</p> : null}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">2</div>
                  <h3 className="text-sm font-bold text-slate-900">Paste into any AI</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">Open ChatGPT or another AI manually, paste the copied prompt, and let it return only the Markdown minutes.</p>
                </div>

                <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">3</div>
                  <h3 className="text-sm font-bold text-slate-900">Paste the result back</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">Review it here, then copy or download the final Markdown. The app does not send anything to an AI service.</p>
                </div>
              </div>

              <div className="flex min-h-[430px] flex-col rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <div>
                    <div className="text-sm font-bold text-slate-900">Paste AI Result</div>
                    <div className="text-[11px] text-slate-500">Expected: grounded Markdown with [M01], [M02]… evidence references</div>
                  </div>
                  {manualResult.trim() ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Ready</span> : null}
                </div>
                <textarea
                  dir={language.dir}
                  value={manualResult}
                  onChange={event => setManualResult(event.target.value)}
                  placeholder="Paste the AI-generated meeting minutes here..."
                  className="min-h-0 flex-1 resize-none bg-transparent p-4 text-start font-mono text-[12px] leading-6 text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <span className="text-[11px] text-slate-500">
            {minutesMode === 'manual' ? 'Manual mode: nothing is sent automatically.' : 'Local deterministic draft — no AI used.'}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleDownload} disabled={!activeMinutes} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Download .md</button>
            <button type="button" onClick={() => void handleCopyMinutes()} disabled={!activeMinutes} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">{copied ? 'Copied' : 'Copy Minutes'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
