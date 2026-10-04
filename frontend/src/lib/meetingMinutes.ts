import { decisionEvidenceForMessage, decisionVoteIdForMessage, findLatestDecisionProposal } from '@/lib/decisionVoting';
import { getRoomLanguage } from '@/lib/languages';
import { duplicateFingerprint, stripProviderArtifacts } from '@/lib/responseSanitizer';
import type { DecisionRecord, Message, Room, VoteChoice } from '@/types/domain';

const labels: Record<string, Record<string, string>> = {
  en: { title: 'Meeting Minutes', room: 'Room', date: 'Generated', sourceMessages: 'Source Messages', language: 'Language', participants: 'Participants', discussion: 'Discussion Highlights', decisions: 'Explicit Decisions', actions: 'Action Items', none: 'None explicitly recorded.', positions: 'Stated Verdicts', proposal: 'Decision proposal', vote: 'Vote', status: 'Status' },
  fa: { title: 'صورتجلسه', room: 'اتاق', date: 'تاریخ تهیه', sourceMessages: 'تعداد پیام‌های منبع', language: 'زبان', participants: 'شرکت‌کنندگان', discussion: 'خلاصه گفتگو', decisions: 'تصمیم‌های صریح', actions: 'اقدامات', none: 'موردی به‌صورت صریح ثبت نشده است.', positions: 'مواضع اعلام‌شده', proposal: 'پیشنهاد تصمیم', vote: 'رأی‌گیری', status: 'وضعیت' },
  fr: { title: 'Compte rendu de réunion', room: 'Salle', date: 'Généré le', sourceMessages: 'Messages sources', language: 'Langue', participants: 'Participants', discussion: 'Points clés', decisions: 'Décisions explicites', actions: 'Actions', none: 'Aucun élément explicitement enregistré.', positions: 'Verdicts exprimés', proposal: 'Proposition de décision', vote: 'Vote', status: 'Statut' },
  es: { title: 'Acta de reunión', room: 'Sala', date: 'Generado', sourceMessages: 'Mensajes de origen', language: 'Idioma', participants: 'Participantes', discussion: 'Puntos principales', decisions: 'Decisiones explícitas', actions: 'Acciones', none: 'No se registró ninguno explícitamente.', positions: 'Veredictos expresados', proposal: 'Propuesta de decisión', vote: 'Votación', status: 'Estado' },
  ar: { title: 'محضر الاجتماع', room: 'الغرفة', date: 'تاريخ الإنشاء', sourceMessages: 'رسائل المصدر', language: 'اللغة', participants: 'المشاركون', discussion: 'أبرز النقاط', decisions: 'القرارات الصريحة', actions: 'بنود العمل', none: 'لم يتم تسجيل أي عنصر بشكل صريح.', positions: 'المواقف المعلنة', proposal: 'مقترح القرار', vote: 'التصويت', status: 'الحالة' },
  de: { title: 'Besprechungsprotokoll', room: 'Raum', date: 'Erstellt', sourceMessages: 'Quellnachrichten', language: 'Sprache', participants: 'Teilnehmende', discussion: 'Diskussionspunkte', decisions: 'Explizite Entscheidungen', actions: 'Aufgaben', none: 'Keine ausdrücklich erfassten Punkte.', positions: 'Geäußerte Einschätzungen', proposal: 'Entscheidungsvorschlag', vote: 'Abstimmung', status: 'Status' },
  tr: { title: 'Toplantı Tutanağı', room: 'Oda', date: 'Oluşturulma', sourceMessages: 'Kaynak Mesajlar', language: 'Dil', participants: 'Katılımcılar', discussion: 'Görüşme Özeti', decisions: 'Açık Kararlar', actions: 'Aksiyon Maddeleri', none: 'Açıkça kaydedilmiş bir madde yok.', positions: 'Belirtilen Kararlar', proposal: 'Karar önerisi', vote: 'Oylama', status: 'Durum' },
  it: { title: 'Verbale della riunione', room: 'Stanza', date: 'Generato', sourceMessages: 'Messaggi sorgente', language: 'Lingua', participants: 'Partecipanti', discussion: 'Punti principali', decisions: 'Decisioni esplicite', actions: 'Azioni', none: 'Nessun elemento registrato esplicitamente.', positions: 'Verdetti espressi', proposal: 'Proposta di decisione', vote: 'Votazione', status: 'Stato' },
};

/**
 * Message text as a reader should see it: no provider citation markup, no
 * machine-readable workflow blocks (VC_* JSON), no fenced code.
 */
function readableContent(value: string): string {
  return stripProviderArtifacts(value)
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/\r?\n/)
    .filter(line => !/^\s*VC_[A-Z_]+\s*$/.test(line))
    .join('\n');
}

/** A line that only labels the message (a heading, or an all-bold "Name · Role — Topic" banner). */
function isBannerLine(line: string): boolean {
  const trimmed = line.trim();
  return /^#{1,6}\s/.test(trimmed) || /^\*\*[^*]+\*\*:?$/.test(trimmed);
}

function firstSentence(value: string, max = 240): string {
  const lines = readableContent(value).split(/\r?\n/).filter(line => line.trim());
  const firstBody = lines.findIndex(line => !isBannerLine(line));
  const normalized = (firstBody >= 0 ? lines.slice(firstBody) : lines)
    .map(line => line.trim().replace(/^(?:[-*•>]|\d+[.)])\s+/, ''))
    .join(' ')
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sentence = normalized.match(/^.*?[.!?؟](?:\s|$)/)?.[0]?.trim() ?? normalized;
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence;
}

export function explicitItems(content: string, kind: 'decision' | 'action'): string[] {
  const patterns = kind === 'decision'
    ? /^(?:decision|decided|تصمیم|تصمیم‌گیری|décision|decisión|قرار شد|entscheidung|karar|decisione)\s*[:：-]\s*(.+)$/i
    : /^(?:action|action item|todo|اقدام|وظیفه|action à faire|acción|کار بعدی|aufgabe|aktion|aksiyon|görev|azione|attività)\s*[:：-]\s*(.+)$/i;

  return readableContent(content)
    .split(/\r?\n/)
    .map(line => line.trim().replace(/^[-*•]\s*/, '').replace(/\*\*/g, ''))
    .map(line => line.match(patterns)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

// "Production launch: NO-GO", "**Pilot: DEFER / BLOCKED**", "Voice pilot: CONDITIONAL GO (Ontario only)".
// Verdict tokens are matched case-sensitively: models write them in capitals,
// and matching "go" in ordinary prose would produce noise.
const VERDICT_LINE = /^(.{2,80}?)\s*[:：]\s*(NO[-_ ]?GO|CONDITIONAL[-_ ]GO|GO|DEFER(?:\s*\/\s*BLOCKED)?|BLOCKED)(?![A-Za-z])\s*(\([^)\n]{1,40}\))?/;

export interface StatedVerdict {
  subject: string;
  verdict: string;
  authors: string[];
}

export function statedVerdicts(messages: readonly Message[]): StatedVerdict[] {
  const byKey = new Map<string, StatedVerdict>();
  for (const message of messages) {
    if (message.authorType !== 'agent') continue;
    const author = message.authorNameSnapshot ?? 'Agent';
    for (const rawLine of readableContent(message.content).split(/\r?\n/)) {
      const line = rawLine.trim().replace(/^[-*•>]\s*/, '').replace(/\*\*|__|`/g, '').trim();
      const match = line.match(VERDICT_LINE);
      if (!match?.[1] || !match[2]) continue;
      const subject = match[1].trim();
      // Workflow state leaking into prose ("Decision readiness: READY") is not a position.
      if (/readiness|آمادگی جلسه/i.test(subject)) continue;
      const token = match[2].replace(/\s*\/\s*/, ' / ').replace(/^(NO|CONDITIONAL)[-_ ]?GO$/, '$1-GO');
      const verdict = match[3] ? `${token} ${match[3]}` : token;
      const key = `${subject.toLocaleLowerCase()}|${verdict.toLocaleLowerCase()}`;
      const entry = byKey.get(key) ?? { subject, verdict, authors: [] };
      if (!entry.authors.includes(author)) entry.authors.push(author);
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()].sort((left, right) => right.authors.length - left.authors.length);
}

export function uniqueMessages(messages: readonly Message[]): Message[] {
  const seen = new Set<string>();
  return messages.filter(message => {
    const key = `${message.authorType}|${duplicateFingerprint(message.content)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function proposalLines(room: Room, decisions: readonly DecisionRecord[], t: Record<string, string>): string[] {
  const record = findLatestDecisionProposal(room.messages);
  if (!record) return [];
  const { proposal } = record;
  const decision = decisions.find(item => item.roomId === room.id && item.evidence === decisionEvidenceForMessage(record.message.id));
  const votes = Object.values(room.votes?.find(item => item.id === decisionVoteIdForMessage(record.message.id))?.votes ?? {});
  const tally = (['agree', 'concern', 'disagree', 'abstain'] as VoteChoice[])
    .map(choice => [choice, votes.filter(value => value === choice).length] as const)
    .filter(([, count]) => count > 0)
    .map(([choice, count]) => `${choice} ${count}`)
    .join(' · ');
  return [
    `- **${t.proposal} [${proposal.outcome.replaceAll('_', ' ')}]:** ${proposal.title} — ${proposal.details}`,
    ...(decision ? [`  - ${t.status}: ${decision.status}`] : []),
    ...(tally ? [`  - ${t.vote}: ${tally}`] : []),
  ];
}

export function buildMeetingMinutes(room: Room, decisionRecords: readonly DecisionRecord[] = []): string {
  const language = getRoomLanguage(room.languageCode);
  const t = labels[language.code] ?? labels.en!;
  const messages = uniqueMessages(room.messages);
  const participants = Array.from(new Set(messages.map(message => (
    message.authorType === 'user' ? 'User' : message.authorNameSnapshot ?? 'Agent'
  ))));
  const decisions = [
    ...proposalLines(room, decisionRecords, t),
    ...Array.from(new Set(messages.flatMap(message => explicitItems(message.content, 'decision')))).map(item => `- ${item}`),
  ];
  const actions = Array.from(new Set(messages.flatMap(message => explicitItems(message.content, 'action'))));
  const verdicts = statedVerdicts(messages);
  const highlights = messages.map(message => {
    const author = message.authorType === 'user' ? 'User' : message.authorNameSnapshot ?? 'Agent';
    return `- ${author}: ${firstSentence(message.content)}`;
  });

  return [
    `# ${t.title}`,
    '',
    `**${t.room}:** ${room.name}`,
    `**${t.date}:** ${new Date().toLocaleString()}`,
    `**${t.sourceMessages}:** ${room.messages.length}`,
    `**${t.language}:** ${language.nativeName}`,
    '',
    `## ${t.participants}`,
    participants.length > 0 ? participants.map(name => `- ${name}`).join('\n') : `- ${t.none}`,
    '',
    `## ${t.discussion}`,
    highlights.length > 0 ? highlights.join('\n') : `- ${t.none}`,
    '',
    `## ${t.decisions}`,
    decisions.length > 0 ? decisions.join('\n') : `- ${t.none}`,
    '',
    `## ${t.positions}`,
    verdicts.length > 0
      ? verdicts.map(item => `- ${item.subject}: **${item.verdict}** — ${item.authors.join(', ')} (${item.authors.length})`).join('\n')
      : `- ${t.none}`,
    '',
    `## ${t.actions}`,
    actions.length > 0 ? actions.map(item => `- ${item}`).join('\n') : `- ${t.none}`,
  ].join('\n');
}
