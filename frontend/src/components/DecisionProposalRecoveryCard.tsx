import { useEffect, useState } from 'react';
import { copyText } from '@/lib/clipboard';
import { findLatestDecisionProposal } from '@/lib/decisionVoting';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { openOrFocusExternalChat } from '@/lib/externalChatWindow';
import { getExternalAgentChat, loadMeetingOrchestration } from '@/lib/meetingOrchestration';
import { buildOliviaDecisionProposalRecoveryPrompt } from '@/lib/oliviaRegeneration';
import { useWorkspaceStore } from '@/store/workspaceStore';

/**
 * advanceAfterAgentResponse (meetingResponseFlow.ts) already stops a
 * final-round opening response without a valid VC_DECISION_PROPOSAL from
 * silently advancing the meeting -- but that alone only shows a toast that
 * disappears in a few seconds, with no lasting sign of what is wrong or how
 * to fix it. This is the persistent counterpart, mirroring
 * OliviaStaffingCard's recovery UX for the equivalent round-1 staffing gate.
 */
export function DecisionProposalRecoveryCard({ roomId }: { roomId: string }) {
  const room = useWorkspaceStore(state => state.rooms.find(item => item.id === roomId));
  const agents = useWorkspaceStore(state => state.agents);
  const roles = useWorkspaceStore(state => state.roles);
  const [message, setMessage] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    setMessage('');
    setIsRegenerating(false);
  }, [roomId]);

  if (!room) return null;
  const meeting = loadMeetingOrchestration().rooms[room.id];
  if (!meeting) return null;

  const isFinalRoundOpening = meeting.roundStage === 'opening' && meeting.roundIndex >= meeting.rounds.length - 1;
  if (!isFinalRoundOpening) return null;

  const latestOliviaResponse = [...room.messages].reverse()
    .find(item => item.authorType === 'agent' && item.authorId === MEETING_FACILITATOR_AGENT_ID);
  if (!latestOliviaResponse) return null;
  if (findLatestDecisionProposal(room.messages)) return null;

  const olivia = agents.find(agent => agent.id === MEETING_FACILITATOR_AGENT_ID);
  const oliviaRole = olivia ? roles.find(role => role.id === olivia.roleId) : undefined;

  const regenerateResponse = async () => {
    if (!olivia || !oliviaRole) {
      setMessage('Olivia or her role configuration is missing, so a recovery prompt cannot be generated.');
      return;
    }
    setIsRegenerating(true);
    setMessage('Preparing the decision-proposal recovery prompt…');

    try {
      const prompt = buildOliviaDecisionProposalRecoveryPrompt(olivia, oliviaRole, room.messages);
      await copyText(prompt);

      const chat = getExternalAgentChat(MEETING_FACILITATOR_AGENT_ID);
      if (!chat?.url) {
        setIsRegenerating(false);
        setMessage('Recovery prompt copied. Add Olivia’s external chat link in Meeting controls, then open that chat and paste the prompt.');
        return;
      }

      const openResult = await openOrFocusExternalChat(MEETING_FACILITATOR_AGENT_ID, chat.url);
      if (openResult === 'blocked') {
        setIsRegenerating(false);
        setMessage(`Recovery prompt copied, but ${chat.provider} could not be opened automatically. Open Olivia’s saved chat and paste the prompt manually.`);
        return;
      }

      setMessage(`Recovery prompt copied and Olivia’s ${chat.provider} chat opened. Send the prompt there. This warning will disappear automatically once a valid decision proposal is added to the room.`);
    } catch {
      setIsRegenerating(false);
      setMessage('Could not prepare the regeneration prompt. Try again or use Dev → Export Debug Snapshot.');
    }
  };

  return (
    <section className="mx-3 mt-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-sm" aria-label="Olivia decision proposal missing">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-500 text-lg text-white" aria-hidden="true">⚠</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">Waiting for Olivia’s final decision</h3>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">Meeting paused</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-700">
            Olivia’s latest response was saved, but it did not include a valid decision proposal. The final round will not advance until she produces one.
          </p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            Use Regenerate Response to prepare a focused recovery prompt and open Olivia’s linked AI chat.
          </p>
          {message ? <p className="mt-2 text-[11px] font-medium text-amber-900" role="status">{message}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => void regenerateResponse()}
          disabled={isRegenerating}
          className="inline-flex min-w-[150px] shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-800 disabled:cursor-wait disabled:bg-amber-500"
        >
          {isRegenerating ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
              Regenerating…
            </>
          ) : 'Regenerate Response'}
        </button>
      </div>
    </section>
  );
}
