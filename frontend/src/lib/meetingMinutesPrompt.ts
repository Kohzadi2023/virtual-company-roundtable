import { getRoomLanguage } from '@/lib/languages';
import type { Message, Room } from '@/types/domain';

function messageAuthor(message: Message): string {
  if (message.authorType === 'user') return 'User';
  return `${message.authorNameSnapshot ?? 'Agent'}${message.roleNameSnapshot ? ` · ${message.roleNameSnapshot}` : ''}`;
}

function formatMessage(message: Message, index: number): string {
  const id = `M${String(index + 1).padStart(2, '0')}`;
  const timestamp = new Date(message.createdAt).toLocaleString();
  return [
    `[${id}]`,
    `Author: ${messageAuthor(message)}`,
    `Time: ${timestamp}`,
    'Content:',
    message.content,
  ].join('\n');
}

export function buildMeetingMinutesPrompt(room: Room): string {
  const language = getRoomLanguage(room.languageCode);
  const transcript = room.messages.map(formatMessage).join('\n\n---\n\n');

  return [
    'You are an expert executive meeting secretary.',
    '',
    'TASK',
    `Create a professional meeting-minutes document for the room “${room.name}”.`,
    `Write the ENTIRE final document in ${language.name} (${language.nativeName}).`,
    'The transcript may contain multiple languages; the selected room language controls the final output language.',
    '',
    'GROUNDING RULES — MANDATORY',
    '1. Use ONLY information explicitly supported by the transcript below.',
    '2. Do not invent decisions, owners, deadlines, requirements, risks, dates, commitments, or next steps.',
    '3. Distinguish clearly between a confirmed decision and a suggestion/proposal. Suggestions are NOT decisions.',
    '4. If an owner or deadline is not explicitly stated, write “Not specified” translated into the output language. Never infer it.',
    '5. Every substantive bullet, decision, action item, open question, risk, and next step MUST end with one or more evidence references such as [M01] or [M02][M05].',
    '6. Preserve participant names exactly as written in the transcript.',
    '7. If a section has no supported items, write a short equivalent of “None explicitly recorded.” in the output language.',
    '8. Do not include facts from general knowledge, previous chats, external sources, or assumptions.',
    '9. Keep evidence quotes short. Never alter the meaning of a source message.',
    '10. Return ONLY the final Markdown document. Do not add commentary before or after it.',
    '11. The section labels shown below are structural examples. Translate all headings, labels, table headers, statuses, and “Not specified” into the selected output language while preserving the exact section order and Markdown structure.',
    '',
    'REQUIRED OUTPUT FORMAT',
    '# Meeting Minutes',
    '',
    `**Room:** ${room.name}`,
    `**Language:** ${language.nativeName}`,
    '',
    '## Participants',
    '- Name — role if explicitly available',
    '',
    '## Executive Summary',
    '- 2–5 concise bullets summarizing the actual discussion. [M..]',
    '',
    '## Key Discussion Points',
    '- Important topic / position / trade-off. [M..]',
    '',
    '## Decisions',
    '| Decision | Evidence |',
    '| --- | --- |',
    '| Confirmed decision only | [M..] |',
    '',
    '## Action Items',
    '| Action | Owner | Deadline | Status | Evidence |',
    '| --- | --- | --- | --- | --- |',
    '| Explicit action only | Person or Not specified | Date or Not specified | Open / In progress / Done only if supported | [M..] |',
    '',
    '## Open Questions',
    '- Unresolved question or missing decision. [M..]',
    '',
    '## Risks & Concerns',
    '- Risk or concern explicitly raised in the discussion. [M..]',
    '',
    '## Next Steps',
    '- Next step only if supported by transcript. [M..]',
    '',
    '## Evidence Index',
    '- [M01] Author — short faithful excerpt',
    '- [M02] Author — short faithful excerpt',
    '',
    'TRANSCRIPT',
    transcript || '(No messages)',
  ].join('\n');
}
