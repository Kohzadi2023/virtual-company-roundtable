import type { MeetingRoomState } from '@/lib/meetingOrchestration';
import type { OperationsSuiteState } from '@/lib/operationsSuite';
import type { ActionItem, DecisionRecord } from '@/types/domain';

export interface MeetingReadiness {
  decisionReady: boolean;
  closeReady: boolean;
  decisionBlockers: string[];
  closeBlockers: string[];
  briefReady: boolean;
  openQuestionCount: number;
  criticalOpenRiskCount: number;
  proposedDecisionCount: number;
  approvedDecisionCount: number;
  unownedOpenActionCount: number;
}

function hasText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function assessMeetingReadiness(input: {
  roomId: string;
  meeting: MeetingRoomState;
  operations: OperationsSuiteState;
  decisions: DecisionRecord[];
  actionItems: ActionItem[];
}): MeetingReadiness {
  const { roomId, meeting, operations, decisions, actionItems } = input;

  const roomQuestions = operations.questions.filter(item => item.roomId === roomId && item.status === 'open');
  const criticalOpenRisks = operations.risks.filter(item => (
    item.roomId === roomId
    && item.status === 'open'
    && (item.impact === 'critical' || item.probability === 'critical')
  ));
  const roomDecisions = decisions.filter(item => item.roomId === roomId);
  const roomActions = actionItems.filter(item => item.roomId === roomId);
  const proposedDecisions = roomDecisions.filter(item => item.status === 'proposed');
  const approvedDecisions = roomDecisions.filter(item => item.status === 'approved');
  const unownedOpenActions = roomActions.filter(item => item.status !== 'done' && !item.owner?.trim());
  const briefReady = hasText(meeting.objective) && hasText(meeting.expectedOutcome) && hasText(meeting.decisionQuestion);

  const decisionBlockers: string[] = [];
  if (!briefReady) decisionBlockers.push('Olivia is preparing the meeting brief automatically.');
  if (roomQuestions.length > 0) decisionBlockers.push(`${roomQuestions.length} open question${roomQuestions.length === 1 ? '' : 's'} must be resolved or archived.`);
  if (criticalOpenRisks.length > 0) decisionBlockers.push(`${criticalOpenRisks.length} critical open risk${criticalOpenRisks.length === 1 ? '' : 's'} must be mitigated, accepted, or archived.`);

  const finalRoundComplete = meeting.roundStage === 'complete' && meeting.roundIndex >= meeting.rounds.length - 1;
  const closeBlockers = [...decisionBlockers];
  if (!finalRoundComplete) closeBlockers.push('The final decision round is not complete.');
  if (approvedDecisions.length === 0) closeBlockers.push('No approved decision is recorded for this meeting.');
  if (proposedDecisions.length > 0) closeBlockers.push(`${proposedDecisions.length} proposed decision${proposedDecisions.length === 1 ? '' : 's'} still need approval or reversal.`);
  if (unownedOpenActions.length > 0) closeBlockers.push(`${unownedOpenActions.length} open action${unownedOpenActions.length === 1 ? '' : 's'} need an owner.`);

  return {
    decisionReady: decisionBlockers.length === 0,
    closeReady: closeBlockers.length === 0,
    decisionBlockers,
    closeBlockers,
    briefReady,
    openQuestionCount: roomQuestions.length,
    criticalOpenRiskCount: criticalOpenRisks.length,
    proposedDecisionCount: proposedDecisions.length,
    approvedDecisionCount: approvedDecisions.length,
    unownedOpenActionCount: unownedOpenActions.length,
  };
}
