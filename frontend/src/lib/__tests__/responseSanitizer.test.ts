import { describe, expect, it } from 'vitest';
import {
  findDuplicateAgentMessage,
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
