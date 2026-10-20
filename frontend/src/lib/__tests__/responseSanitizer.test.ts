import { describe, expect, it } from 'vitest';
import {
  findDuplicateAgentMessage,
  looksLikeContextlessReply,
  sanitizeAgentResponse,
  stripEchoedPrompt,
  stripProviderArtifacts,
} from '@/lib/responseSanitizer';
import type { Message } from '@/types/domain';

function agentMessage(id: string, content: string, authorNameSnapshot = 'Grace'): Message {
  return { id, authorType: 'agent', authorId: `agent-${authorNameSnapshot.toLowerCase()}`, authorNameSnapshot, content, createdAt: 1 };
}

describe('response sanitizer', () => {
  it('strips citation markup copied from external chat UIs', () => {
    expect(stripProviderArtifacts('Product scope is narrow. :chatgpt-content-reference{index="0"} Next.'))
      .toBe('Product scope is narrow. Next.');
    expect(stripProviderArtifacts('Voice is inbound only :contentReference[oaicite:4]{index=4}.'))
      .toBe('Voice is inbound only.');
    expect(stripProviderArtifacts('Retries happen【4:0†source】 on failure [oaicite:2].'))
      .toBe('Retries happen on failure.');
    expect(stripProviderArtifacts('Telegram uses a secret token citeturn0search0.'))
      .toBe('Telegram uses a secret token.');
  });

  it('leaves ordinary markdown and links untouched', () => {
    const content = '**Plan:** see [docs](https://example.com) — step {1}.';
    expect(stripProviderArtifacts(content)).toBe(content);
  });

  it('removes a verbatim echo of the user request, but only as a whole prefix', () => {
    const request = 'Prepare a complete proposal with costs and break-even.';
    expect(stripEchoedPrompt(`${request}\n\n**Recommendation:** start small.`, request)).toBe('**Recommendation:** start small.');
    expect(stripEchoedPrompt('I will prepare a complete proposal.', request)).toBe('I will prepare a complete proposal.');
    expect(stripEchoedPrompt(request, request)).toBe(request);
  });

  it('sanitizes against the latest user message in the room', () => {
    const messages: Message[] = [
      { id: 'u1', authorType: 'user', content: 'Revise the current final decision proposal.', createdAt: 1 },
    ];
    expect(sanitizeAgentResponse('Revise the current final decision proposal.\nRevised: NO-GO :chatgpt-content-reference{index="1"}', messages))
      .toBe('Revised: NO-GO');
  });

  it('detects the same reply added twice, ignoring whitespace and citation noise', () => {
    const messages = [agentMessage('m1', 'From the CPA view I agree with the seven-person core team.')];
    expect(findDuplicateAgentMessage(messages, 'From the CPA view  I agree with the seven-person core team. :chatgpt-content-reference{index="0"}'))
      .toMatchObject({ id: 'm1' });
    expect(findDuplicateAgentMessage(messages, 'From the CPA view the ledger controls are incomplete.')).toBeUndefined();
  });
});

describe('contextless reply detection', () => {
  it('flags a reply that asks for the problem statement instead of answering', () => {
    const leo = `Leo here. I own server-side domain logic, APIs, persistence, concurrency, integration behavior, performance, and reliable service implementation.

Send me the feature or problem statement and I'll produce the backend deliverables: API contract, domain model, persistence/schema design, transaction and idempotency strategy, failure handling, integration behavior, and observability hooks.

Useful inputs if available:
- Actors and core use cases
- Entities and relationships`;
    expect(looksLikeContextlessReply(leo)).toBe(true);
    expect(looksLikeContextlessReply('سلام، من مهندس بک‌اند هستم. لطفاً شرح مسئله را ارسال کنید.')).toBe(true);
  });

  it('does not flag a real contribution, short or long', () => {
    expect(looksLikeContextlessReply('The CRM gateway must be idempotent: key every write by provider_event_id and reject replays.')).toBe(false);
    const long = `${'Architecture detail. '.repeat(100)}Please share the CRM vendor so we can confirm limits.`;
    expect(looksLikeContextlessReply(long)).toBe(false);
  });
});
