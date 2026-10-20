import type { Message } from '@/types/domain';

/**
 * Citation/grounding markup that external chat UIs leave behind when a reply
 * is copied or captured. None of it resolves outside the originating chat,
 * so in a room message it is pure noise — and in the minutes it reads as a
 * broken reference. Each pattern also eats the horizontal whitespace before
 * the marker so "claim :marker." collapses to "claim.".
 */
const PROVIDER_ARTIFACT_PATTERNS: RegExp[] = [
  // ChatGPT copy: :chatgpt-content-reference{index="0"}
  /[ \t]*:chatgpt-content-reference\{[^}\n]*\}/g,
  // ChatGPT copy (older): :contentReference[oaicite:0]{index=0}
  /[ \t]*:contentReference\[[^\]\n]*\](?:\{[^}\n]*\})?/g,
  // Bare oaicite tokens: [oaicite:3]
  /[ \t]*\[oaicite:[^\]\n]*\]/g,
  // File/search citations: 【4:0†source】
  /[ \t]*【[^】\n]*†[^】\n]*】/g,
  // Private-use-area citation spans: citeturn0search0
  /[ \t]*[^\n]*/g,
];

export function stripProviderArtifacts(content: string): string {
  let cleaned = content;
  for (const pattern of PROVIDER_ARTIFACT_PATTERNS) cleaned = cleaned.replace(pattern, '');
  return cleaned
    // Stray private-use delimiters left over from partially copied spans.
    .replace(/[-]/g, '')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const MIN_ECHO_LENGTH = 20;

/**
 * Removes the user's request when a model repeats it verbatim at the top of
 * its reply (seen with Olivia echoing the user's instruction before
 * answering). Only an exact, whole-message prefix counts, and only when
 * something substantive is left afterwards.
 */
export function stripEchoedPrompt(content: string, userMessage: string | undefined): string {
  const echo = userMessage?.trim();
  if (!echo || collapse(echo).length < MIN_ECHO_LENGTH) return content;
  const trimmed = content.trimStart();
  if (!trimmed.startsWith(echo)) return content;
  const remainder = trimmed.slice(echo.length).trim();
  return remainder ? remainder : content;
}

export function latestUserMessage(messages: readonly Message[]): Message | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.authorType === 'user') return message;
  }
  return undefined;
}

/** The single cleanup every agent response goes through before it is stored. */
export function sanitizeAgentResponse(content: string, messages: readonly Message[]): string {
  return stripEchoedPrompt(stripProviderArtifacts(content), latestUserMessage(messages)?.content).trim();
}

export function duplicateFingerprint(content: string): string {
  return collapse(stripProviderArtifacts(content)).toLocaleLowerCase();
}

/**
 * An agent message already in the room with the same content. A second copy
 * is never new evidence: it is either the same reply added twice or a reply
 * pasted into the wrong agent's box, and either way it double-counts a
 * position and duplicates the minutes.
 */
export function findDuplicateAgentMessage(messages: readonly Message[], content: string): Message | undefined {
  const fingerprint = duplicateFingerprint(content);
  if (!fingerprint) return undefined;
  return messages.find(message => message.authorType === 'agent' && duplicateFingerprint(message.content) === fingerprint);
}

const CONTEXTLESS_REPLY_MAX_LENGTH = 1500;

// Phrases a model uses when it was given a role but no task: it introduces
// itself and asks for the input instead of contributing.
const CONTEXTLESS_REPLY_PATTERNS: RegExp[] = [
  /\b(?:send|share|give|paste|provide)\s+me\s+(?:the|your|a|an|with)\b/i,
  /\bplease\s+(?:share|send|provide|paste)\s+(?:the|your)\b/i,
  /\bonce\s+you\s+(?:share|send|provide|paste)\b/i,
  /\buseful\s+inputs?\b/i,
  /\bwhat\s+would\s+you\s+like\s+(?:me\s+)?to\b/i,
  /\bhow\s+can\s+I\s+help\b/i,
  /لطفاً?\s.{0,60}(?:ارسال\s*کنید|بفرستید|به\s*اشتراک\s*بگذارید)/,
  /چه\s*کمکی\s*(?:از\s*من\s*)?(?:می‌توانم|میتوانم|برمی‌آید)/,
];

/**
 * True for a short reply that asks for the problem statement instead of
 * answering it — what an agent produces when its prompt carried no meeting
 * discussion. Long replies are never flagged: a real contribution may well
 * end by asking for more detail.
 */
export function looksLikeContextlessReply(content: string): boolean {
  const text = stripProviderArtifacts(content);
  if (!text || text.length > CONTEXTLESS_REPLY_MAX_LENGTH) return false;
  return CONTEXTLESS_REPLY_PATTERNS.some(pattern => pattern.test(text));
}
