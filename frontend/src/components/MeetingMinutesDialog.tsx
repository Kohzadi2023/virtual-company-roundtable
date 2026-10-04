import { useEffect, useMemo, useState } from 'react';
import { MarkdownDocument } from '@/components/MarkdownDocument';
import { copyText } from '@/lib/clipboard';
import { downloadTextFile, safeFileStem } from '@/lib/downloadText';
import { buildExecutiveDecisionBrief } from '@/lib/executiveBrief';
import { getRoomLanguage } from '@/lib/languages';
import { buildMeetingMinutes } from '@/lib/meetingMinutes';
import { buildMeetingMinutesPrompt } from '@/lib/meetingMinutesPrompt';
import { printMarkdown } from '@/lib/printMarkdown';
import { saveRoomMeetingMinutes } from '@/lib/roomActions';
import { useWorkspaceStore } from '@/store/workspaceStore';

interface MeetingMinutesDialogProps {
  roomId: string | null;
  onClose: () => void;
}

export function MeetingMinutesDialog({ roomId, onClose }: MeetingMinutesDialogProps) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const decisions = useWorkspaceStore(state => state.decisions);
  const actionItems = useWorkspaceStore(state => state.actionItems);
  const [minutesMode, setMinutesMode] = useState<'local' | 'manual' | 'brief'>('local');
  const [printError, setPrintError] = useState('');
  const [documentView, setDocumentView] = useState<'preview' | 'edit'>('preview');
  const [manualResult, setManualResult] = useState('');
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [promptCopyError, setPromptCopyError] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const language = getRoomLanguage(room?.languageCode);
  const localMinutes = useMemo(() => room ? buildMeetingMinutes(room, decisions) : '', [room, decisions]);
  const manualPrompt = useMemo(() => room ? buildMeetingMinutesPrompt(room) : '', [room]);
  const executiveBrief = useMemo(() => room ? buildExecutiveDecisionBrief(room, decisions, actionItems) : '', [room, decisions, actionItems]);
  const activeMinutes = minutesMode === 'manual' ? manualResult.trim() : minutesMode === 'brief' ? executiveBrief : localMinutes;
  const savedMinutes = room?.meetingMinutes;
  const conversationChanged = Boolean(savedMinutes && room && savedMinutes.sourceMessageCount !== room.messages.length);

  useEffect(() => {
    const saved = useWorkspaceStore.getState().rooms.find(item => item.id === roomId)?.meetingMinutes?.content ?? '';
    setMinutesMode(saved ? 'manual' : 'local');
    setDocumentView(saved ? 'preview' : 'edit');
    setManualResult(saved);
    setCopied(false);
    setPromptCopied(false);
    setPromptCopyError(false);
    setHistoryOpen(false);
    setPrintError('');
  }, [roomId]);

  if (!roomId || !room) return null;

  const handleManualResultChange = (value: string) => {
    setManualResult(value);
    saveRoomMeetingMinutes(room.id, value);
  };

  const restoreRevision = (content: string) => {
    setManualResult(content);
    saveRoomMeetingMinutes(room.id, content);
    setMinutesMode('manual');
    setDocumentView('preview');
    setHistoryOpen(false);
  };

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

  const handlePrint = () => {
    setPrintError('');
    try {
      printMarkdown(executiveBrief, { title: `${room.name} — Executive Decision Brief`, dir: language.dir });
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : 'Printing failed.');
    }
  };

  const handleDownload = () => {
    if (!activeMinutes) return;
    downloadTextFile(`${safeFileStem(room.name, 'meeting')}-${minutesMode === 'brief' ? 'decision-brief' : 'minutes'}.md`, activeMinutes);
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/30 p-6" role="dialog" aria-modal="true" aria-label="Meeting Minutes">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Meeting Minutes</h2>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-amber-700">Manual workflow</span>
              {savedMinutes ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-emerald-700">Saved</span> : null}
              {conversationChanged ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-rose-700">Conversation changed</span> : null}
              {(savedMinutes?.versions?.length ?? 0) > 0 ? <button type="button" onClick={() => setHistoryOpen(value => !value)} className="rounded-full bg-violet-50 px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-violet-700">History {savedMinutes?.versions?.length}</button> : null}
            </div>
            <p className="text-xs text-slate-500">{room.name} · {language.nativeName} · No AI API connection</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700" aria-label="Close meeting minutes">✕</button>
        </div>

        {historyOpen && (savedMinutes?.versions?.length ?? 0) > 0 ? (
          <div className="max-h-56 overflow-y-auto border-b border-violet-100 bg-violet-50/40 px-5 py-3">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-violet-700">Previous saved versions</div>
            <div className="space-y-2">
              {[...(savedMinutes?.versions ?? [])].reverse().map((version, index) => (
                <div key={`${version.savedAt}-${index}`} className="flex items-center gap-3 rounded-lg border border-violet-100 bg-white px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-700">{new Date(version.savedAt).toLocaleString()}</div>
                    <div className="mt-0.5 text-[12px] text-slate-500">{version.sourceMessageCount} source messages · {version.content.slice(0, 90).replace(/\s+/g, ' ')}{version.content.length > 90 ? '…' : ''}</div>
                  </div>
                  <button type="button" onClick={() => restoreRevision(version.content)} className="rounded-md border border-violet-200 px-2.5 py-1.5 text-[12px] font-bold text-violet-700 hover:bg-violet-50">Restore</button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 p-1">
          <button type="button" onClick={() => setMinutesMode('local')} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${minutesMode === 'local' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Local Draft</button>
          <button type="button" onClick={() => { setMinutesMode('manual'); setDocumentView(manualResult.trim() ? 'preview' : 'edit'); }} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${minutesMode === 'manual' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Manual AI · Copy / Paste</button>
          <button type="button" onClick={() => setMinutesMode('brief')} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${minutesMode === 'brief' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Decision Brief</button>
        </div>

        {minutesMode === 'local' ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-white px-5 py-5"><MarkdownDocument content={localMinutes} dir={language.dir} /></div>
        ) : minutesMode === 'brief' ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-white px-5 py-5"><MarkdownDocument content={executiveBrief} dir={language.dir} /></div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <div className="space-y-3">
                <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
                  <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</div>
                  <h3 className="text-sm font-bold text-slate-900">Copy grounded AI prompt</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">Includes the full room transcript, Generated timestamp, Source Messages count, evidence IDs, selected language, and strict anti-hallucination rules.</p>
                  <button type="button" onClick={() => void handleCopyPrompt()} className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700">{promptCopied ? '✓ Prompt Copied' : '⧉ Copy AI Minutes Prompt'}</button>
                  {promptCopyError ? <p className="mt-2 text-[12px] font-medium text-rose-600">Clipboard access failed. Check browser clipboard permission and try again.</p> : null}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">2</div>
                  <h3 className="text-sm font-bold text-slate-900">Paste into any AI</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">Open ChatGPT or another AI manually, paste the copied prompt, and let it return only the Markdown minutes.</p>
                </div>

                <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">3</div>
                  <h3 className="text-sm font-bold text-slate-900">Paste the result back</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">The pasted result is auto-saved inside this room. Use Edit for Markdown source and Preview for the formatted document.</p>
                </div>
              </div>

              <div className="flex min-h-[480px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div>
                    <div className="text-sm font-bold text-slate-900">Final Meeting Minutes</div>
                    <div className="text-[12px] text-slate-500">Rendered Markdown preview with GFM tables, lists, headings, links and RTL support</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {manualResult.trim() ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[12px] font-semibold text-emerald-700">Auto-saved</span> : null}
                    <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                      <button type="button" onClick={() => setDocumentView('preview')} className={`rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition ${documentView === 'preview' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Preview</button>
                      <button type="button" onClick={() => setDocumentView('edit')} className={`rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition ${documentView === 'edit' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Edit</button>
                    </div>
                  </div>
                </div>

                {documentView === 'preview' ? (
                  manualResult.trim() ? (
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5"><MarkdownDocument content={manualResult} dir={language.dir} /></div>
                  ) : (
                    <div className="grid min-h-0 flex-1 place-items-center px-6 py-12 text-center">
                      <div className="max-w-sm"><div className="text-3xl" aria-hidden="true">▤</div><div className="mt-3 text-sm font-bold text-slate-800">No final minutes pasted yet</div><p className="mt-1 text-xs leading-5 text-slate-500">Copy the AI prompt, generate the Markdown manually, then paste it in Edit mode.</p><button type="button" onClick={() => setDocumentView('edit')} className="mt-4 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">Open Editor</button></div>
                    </div>
                  )
                ) : (
                  <textarea dir={language.dir} value={manualResult} onChange={event => handleManualResultChange(event.target.value)} placeholder="Paste the AI-generated meeting minutes Markdown here..." className="min-h-0 flex-1 resize-none bg-transparent p-4 text-start font-mono text-[12px] leading-6 text-slate-700 outline-none placeholder:text-slate-500" />
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <span className="text-[12px] text-slate-500">
            {minutesMode === 'manual'
              ? savedMinutes
                ? `Saved in room · ${savedMinutes.sourceMessageCount} source messages · ${new Date(savedMinutes.savedAt).toLocaleString()}`
                : 'Manual mode: paste the AI result to save it in this room.'
              : minutesMode === 'brief'
                ? 'Executive brief built locally from the decision proposal, votes and action items of this room — no AI used.'
                : 'Local deterministic draft — rendered as Markdown, no AI used.'}
          </span>
          <div className="flex items-center gap-2">
            {printError ? <span className="text-[12px] font-medium text-rose-600" role="alert">{printError}</span> : null}
            {minutesMode === 'brief' ? <button type="button" onClick={handlePrint} disabled={!executiveBrief} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Print / Save PDF</button> : null}
            <button type="button" onClick={handleDownload} disabled={!activeMinutes} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Download .md</button>
            <button type="button" onClick={() => void handleCopyMinutes()} disabled={!activeMinutes} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">{copied ? 'Copied' : minutesMode === 'brief' ? 'Copy Brief' : 'Copy Minutes'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}