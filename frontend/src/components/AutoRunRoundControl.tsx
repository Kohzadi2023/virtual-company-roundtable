import { useEffect, useRef, useState } from 'react';
import { formatUsd } from '@/lib/llm/apiRun';
import { autoRunRound, buildCurrentTurnPrompt, estimateRoundCostUsd, remainingTurns } from '@/lib/llm/autoRunRound';
import { loadBudgetState, meetingSpendUsd, monthSpendUsd } from '@/lib/llm/budget';
import { hasApiKey } from '@/lib/llm/credentials';
import { LLM_CHANGE_EVENT, getSelectedModel } from '@/lib/llm/llmSettings';
import { ensureMeetingRoom, MEETING_ORCHESTRATION_EVENT } from '@/lib/meetingOrchestration';
import { useWorkspaceStore } from '@/store/workspaceStore';

interface AutoRunRoundControlProps {
  roomId: string;
  onNotify: (text: string, tone?: 'success' | 'error' | 'info') => void;
}

export function AutoRunRoundControl({ roomId, onNotify }: AutoRunRoundControlProps) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const [, setRevision] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState<{ agentName: string; turn: number } | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(MEETING_ORCHESTRATION_EVENT, refresh);
    window.addEventListener(LLM_CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener(MEETING_ORCHESTRATION_EVENT, refresh);
      window.removeEventListener(LLM_CHANGE_EVENT, refresh);
    };
  }, []);

  // Leaving the room stops the run; otherwise it would keep spending in the background.
  useEffect(() => {
    setConfirming(false);
    return () => abort.current?.abort();
  }, [roomId]);

  if (!room || !hasApiKey('gemini')) return null;
  const meeting = ensureMeetingRoom(room.id, room.agentIds);
  const turns = remainingTurns(meeting);
  if (turns === 0 && !running) return null;

  const model = getSelectedModel();
  const budget = loadBudgetState();
  const turnPrompt = confirming ? buildCurrentTurnPrompt(room.id) : null;
  const forecast = turnPrompt ? estimateRoundCostUsd(model, turnPrompt.prompt.length, turns) : 0;
  const meetingSpend = meetingSpendUsd(budget.entries, room.id);
  const monthSpend = monthSpendUsd(budget.entries, Date.now());
  const overBudget =
    meetingSpend + forecast > budget.settings.perMeetingUsd || monthSpend + forecast > budget.settings.perMonthUsd;

  const start = async () => {
    const controller = new AbortController();
    abort.current = controller;
    setConfirming(false);
    setRunning({ agentName: '…', turn: 1 });
    try {
      const result = await autoRunRound(room.id, {
        signal: controller.signal,
        onProgress: progress => setRunning({ agentName: progress.agentName, turn: progress.turn }),
      });
      onNotify(result.message, result.reason === 'round-complete' ? 'success' : result.reason === 'error' ? 'error' : 'info');
    } finally {
      if (abort.current === controller) abort.current = null;
      setRunning(null);
    }
  };

  if (running) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[12px] font-semibold text-violet-700" role="status">
        Running {running.agentName} (turn {running.turn})…
        <button type="button" onClick={() => abort.current?.abort()} className="rounded bg-white px-2 py-0.5 text-[12px] font-bold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50">Stop</button>
      </span>
    );
  }

  if (confirming) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[12px] text-violet-800" role="group" aria-label="Confirm automatic round">
        <span>
          Run {turns} turn{turns === 1 ? '' : 's'} via API · est. up to <strong>{formatUsd(forecast)}</strong>
          {' '}· meeting {formatUsd(meetingSpend)}/{formatUsd(budget.settings.perMeetingUsd)}
          {overBudget ? <strong className="text-rose-600"> · may hit your budget and stop early</strong> : null}
        </span>
        <button type="button" onClick={() => void start()} className="rounded bg-violet-600 px-2.5 py-1 text-[12px] font-bold text-white hover:bg-violet-700">Start</button>
        <button type="button" onClick={() => setConfirming(false)} className="rounded px-2 py-1 text-[12px] font-semibold text-slate-500 hover:bg-white">Cancel</button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="rounded-md border border-violet-300 bg-white px-2.5 py-1.5 text-[12px] font-bold text-violet-700 hover:bg-violet-50"
      title="Let the API answer each remaining turn of this round. Pauses at anything that needs your approval."
    >
      ▶ Run round via API
    </button>
  );
}
