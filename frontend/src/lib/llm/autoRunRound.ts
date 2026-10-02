import { decoratePromptForContextMode, messagesForContextMode, preferredContextModeForMeetingTurn } from '@/lib/contextModes';
import { MEETING_FACILITATOR_AGENT_ID } from '@/lib/defaultCompany';
import { agentContextKey } from '@/lib/id';
import { estimateRunCostUsd, runPromptViaApi, describeLlmError, isCancelled } from '@/lib/llm/apiRun';
import type { ApiRunResult } from '@/lib/llm/apiRun';
import { ensureMeetingRoom, hasMeetingStarted } from '@/lib/meetingOrchestration';
import type { MeetingRoomState } from '@/lib/meetingOrchestration';
import type { MeetingResponseAdvanceReason } from '@/lib/meetingResponseFlow';
import { advanceAfterAgentResponse } from '@/lib/meetingResponseFlow';
import { findLatestOliviaStaffingPlan } from '@/lib/meetingStaffing';
import { buildOliviaDecisionProposalRecoveryPrompt, buildOliviaStaffingRecoveryPrompt } from '@/lib/oliviaRegeneration';
import { buildAgentPrompt } from '@/lib/promptBuilder';
import { useWorkspaceStore } from '@/store/workspaceStore';

export type AutoRunStopReason =
  /** The round finished; starting the next one stays an explicit user step. */
  | 'round-complete'
  /** A step that needs a human (e.g. approving Olivia's staffing plan). */
  | 'checkpoint'
  | 'cancelled'
  | 'error'
  | 'no-speaker'
  | 'duplicate'
  | 'turn-limit';

export interface AutoRunResult {
  reason: AutoRunStopReason;
  completedTurns: number;
  /** Human-readable explanation for the toast / status line. */
  message: string;
}

export interface AutoRunProgress {
  agentName: string;
  turn: number;
  retry: boolean;
}

export interface AutoRunOptions {
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: AutoRunProgress) => void) | undefined;
  /** Injectable for tests. */
  runPrompt?: ((prompt: string, roomId: string, signal?: AbortSignal) => Promise<ApiRunResult>) | undefined;
}

/** Average size of one added message, used only for cost forecasting. */
const FORECAST_GROWTH_CHARS_PER_TURN = 4000;

export function remainingTurns(meeting: MeetingRoomState): number {
  const hasFacilitator = meeting.speakerOrder.includes(MEETING_FACILITATOR_AGENT_ID);
  const waiting = meeting.speakerOrder.filter(id => id !== MEETING_FACILITATOR_AGENT_ID && meeting.speakerStatus[id] === 'waiting').length;
  switch (meeting.roundStage) {
    case 'opening':
      return 1 + waiting + (hasFacilitator ? 1 : 0);
    case 'specialists':
      return waiting + (hasFacilitator ? 1 : 0);
    case 'synthesis':
      return 1;
    case 'complete':
      return 0;
  }
}

/** Rough upper-ish bound: each later turn sees the earlier turns' output as extra context. */
export function estimateRoundCostUsd(model: string, firstPromptChars: number, turns: number): number {
  let total = 0;
  for (let index = 0; index < turns; index += 1) {
    total += estimateRunCostUsd(model, 'x'.repeat(firstPromptChars + index * FORECAST_GROWTH_CHARS_PER_TURN));
  }
  return total;
}

/** Same prompt the Copy / Run via API buttons produce for the speaker whose turn it is. */
export function buildCurrentTurnPrompt(roomId: string): { prompt: string; agentId: string; agentName: string } | null {
  const state = useWorkspaceStore.getState();
  const room = state.rooms.find(item => item.id === roomId);
  if (!room) return null;
  const meeting = ensureMeetingRoom(room.id, room.agentIds);
  const agent = state.agents.find(item => item.id === meeting.activeSpeakerId && room.agentIds.includes(item.id));
  const role = agent ? state.roles.find(item => item.id === agent.roleId) : undefined;
  if (!agent || !role) return null;
  const mode = preferredContextModeForMeetingTurn(agent.id, meeting.activeSpeakerId, meeting.roundStage);
  const cursor = state.agentContext[agentContextKey(room.id, agent.id)];
  const messages = messagesForContextMode(room, agent.id, cursor, mode);
  return {
    prompt: decoratePromptForContextMode(buildAgentPrompt(agent, role, messages), mode),
    agentId: agent.id,
    agentName: agent.name,
  };
}

function recoveryPromptFor(roomId: string, agentId: string, reason: MeetingResponseAdvanceReason): string | null {
  if (agentId !== MEETING_FACILITATOR_AGENT_ID) return null;
  if (reason !== 'decision-proposal-missing' && reason !== 'staffing-plan-missing') return null;
  const state = useWorkspaceStore.getState();
  const room = state.rooms.find(item => item.id === roomId);
  const agent = state.agents.find(item => item.id === agentId);
  const role = agent ? state.roles.find(item => item.id === agent.roleId) : undefined;
  if (!room || !agent || !role) return null;
  return reason === 'decision-proposal-missing'
    ? buildOliviaDecisionProposalRecoveryPrompt(agent, role, room.messages)
    : buildOliviaStaffingRecoveryPrompt(agent, role, room.messages);
}

function checkpointMessage(reason: MeetingResponseAdvanceReason): string {
  switch (reason) {
    case 'staffing-plan-pending-approval':
      return "Olivia's staffing plan is ready. Review it and click Invite Team, then run the round again.";
    case 'staffing-not-ready':
      return 'Required staffing blockers remain, so the meeting is paused. Resolve them, then run the round again.';
    case 'staffing-plan-missing':
      return "Olivia still did not produce a valid staffing plan after one automatic retry. Use the regenerate card to try again.";
    case 'decision-proposal-missing':
      return 'Olivia still did not produce a valid decision proposal after one automatic retry. Use the regenerate card to try again.';
    case 'room-missing':
      return 'The room no longer exists.';
    case 'advanced':
      return 'The meeting advanced.';
  }
}

/**
 * Runs the current round through the API, one speaker at a time, until the
 * round completes or something needs a human. It reuses the app's own gates
 * (addAgentMessage's duplicate/sanitize rules and advanceAfterAgentResponse),
 * so an automatic run can never skip a checkpoint a manual run would hit.
 * Budget and rate-limit failures surface as an 'error' stop with the
 * already-completed turns kept.
 */
export async function autoRunRound(roomId: string, options: AutoRunOptions = {}): Promise<AutoRunResult> {
  const runPrompt = options.runPrompt ?? runPromptViaApi;
  const initial = useWorkspaceStore.getState().rooms.find(item => item.id === roomId);
  if (!initial) return { reason: 'no-speaker', completedTurns: 0, message: 'The room no longer exists.' };

  const startMeeting = ensureMeetingRoom(initial.id, initial.agentIds);
  const startRound = startMeeting.roundIndex;
  const turnLimit = remainingTurns(startMeeting) + 4;
  let completedTurns = 0;

  const stop = (reason: AutoRunStopReason, message: string): AutoRunResult => ({ reason, completedTurns, message });

  while (completedTurns < turnLimit) {
    if (options.signal?.aborted) return stop('cancelled', 'Stopped.');

    const state = useWorkspaceStore.getState();
    const room = state.rooms.find(item => item.id === roomId);
    if (!room) return stop('no-speaker', 'The room no longer exists.');
    const meeting = ensureMeetingRoom(room.id, room.agentIds);
    if (meeting.roundIndex !== startRound || meeting.roundStage === 'complete') {
      return stop('round-complete', completedTurns > 0 ? 'Round complete. Review it, then start the next round.' : 'This round is already complete.');
    }

    const turn = buildCurrentTurnPrompt(roomId);
    if (!turn) return stop('no-speaker', 'No speaker is ready to respond in this round.');

    // After the user approves the staffing plan the opening turn is advanced by
    // the staffing card; if Olivia already has an applicable plan, don't pay
    // for a second opening, just let the normal gate decide.
    if (
      turn.agentId === MEETING_FACILITATOR_AGENT_ID
      && meeting.roundStage === 'opening'
      && !hasMeetingStarted(meeting)
      && findLatestOliviaStaffingPlan(room.messages, MEETING_FACILITATOR_AGENT_ID)
    ) {
      const gate = advanceAfterAgentResponse(room.id, turn.agentId);
      if (gate.advanced) continue;
      return stop('checkpoint', checkpointMessage(gate.reason));
    }

    let prompt = turn.prompt;
    let retried = false;
    for (;;) {
      options.onProgress?.({ agentName: turn.agentName, turn: completedTurns + 1, retry: retried });
      let result: ApiRunResult;
      try {
        result = await runPrompt(prompt, roomId, options.signal);
      } catch (error) {
        if (isCancelled(error)) return stop('cancelled', 'Stopped.');
        const detail = describeLlmError(error);
        const kept = completedTurns > 0 ? ` ${completedTurns} earlier turn${completedTurns === 1 ? ' was' : 's were'} kept.` : '';
        return stop('error', `${turn.agentName}: ${detail}${kept}`);
      }

      const store = useWorkspaceStore.getState();
      if (!store.addAgentMessage(roomId, turn.agentId, result.response.text)) {
        return stop('duplicate', `${turn.agentName}'s answer was empty or identical to an earlier message, so it was not added. Run the round again or answer manually.`);
      }
      store.markAgentContextCopied(roomId, turn.agentId);
      completedTurns += 1;

      const advance = advanceAfterAgentResponse(roomId, turn.agentId);
      if (advance.advanced) break;

      const recovery = retried ? null : recoveryPromptFor(roomId, turn.agentId, advance.reason);
      if (!recovery) return stop('checkpoint', checkpointMessage(advance.reason));
      prompt = recovery;
      retried = true;
    }
  }
  return stop('turn-limit', 'Stopped after the safety limit of turns for one round. Check the discussion before continuing.');
}
