import { getRoomLanguage } from '@/lib/languages';
import type { Room } from '@/types/domain';

const labels: Record<string, Record<string, string>> = {
  en: { title: 'Meeting Minutes', room: 'Room', date: 'Generated', language: 'Language', participants: 'Participants', discussion: 'Discussion Highlights', decisions: 'Explicit Decisions', actions: 'Action Items', none: 'None explicitly recorded.' },
  fa: { title: 'صورتجلسه', room: 'اتاق', date: 'تاریخ تهیه', language: 'زبان', participants: 'شرکت‌کنندگان', discussion: 'خلاصه گفتگو', decisions: 'تصمیم‌های صریح', actions: 'اقدامات', none: 'موردی به‌صورت صریح ثبت نشده است.' },
  fr: { title: 'Compte rendu de réunion', room: 'Salle', date: 'Généré le', language: 'Langue', participants: 'Participants', discussion: 'Points clés', decisions: 'Décisions explicites', actions: 'Actions', none: 'Aucun élément explicitement enregistré.' },
  es: { title: 'Acta de reunión', room: 'Sala', date: 'Generado', language: 'Idioma', participants: 'Participantes', discussion: 'Puntos principales', decisions: 'Decisiones explícitas', actions: 'Acciones', none: 'No se registró ninguno explícitamente.' },
  ar: { title: 'محضر الاجتماع', room: 'الغرفة', date: 'تاريخ الإنشاء', language: 'اللغة', participants: 'المشاركون', discussion: 'أبرز النقاط', decisions: 'القرارات الصريحة', actions: 'بنود العمل', none: 'لم يتم تسجيل أي عنصر بشكل صريح.' },
};

function firstSentence(value: string, max = 240): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const sentence = normalized.match(/^.*?[.!?؟](?:\s|$)/)?.[0]?.trim() ?? normalized;
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence;
}

function explicitItems(content: string, kind: 'decision' | 'action'): string[] {
  const patterns = kind === 'decision'
    ? /^(?:decision|decided|تصمیم|تصمیم‌گیری|décision|decisión|قرار شد)\s*[:：-]\s*(.+)$/i
    : /^(?:action|action item|todo|اقدام|وظیفه|action à faire|acción|کار بعدی)\s*[:：-]\s*(.+)$/i;

  return content
    .split(/\r?\n/)
    .map(line => line.trim().replace(/^[-*•]\s*/, ''))
    .map(line => line.match(patterns)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

export function buildMeetingMinutes(room: Room): string {
  const language = getRoomLanguage(room.languageCode);
  const t = labels[language.code] ?? labels.en!;
  const participants = Array.from(new Set(room.messages.map(message => (
    message.authorType === 'user' ? 'User' : message.authorNameSnapshot ?? 'Agent'
  ))));
  const decisions = room.messages.flatMap(message => explicitItems(message.content, 'decision'));
  const actions = room.messages.flatMap(message => explicitItems(message.content, 'action'));
  const highlights = room.messages.map(message => {
    const author = message.authorType === 'user' ? 'User' : message.authorNameSnapshot ?? 'Agent';
    return `- ${author}: ${firstSentence(message.content)}`;
  });

  return [
    `# ${t.title}`,
    '',
    `**${t.room}:** ${room.name}`,
    `**${t.date}:** ${new Date().toLocaleString()}`,
    `**${t.language}:** ${language.nativeName}`,
    '',
    `## ${t.participants}`,
    participants.length > 0 ? participants.map(name => `- ${name}`).join('\n') : `- ${t.none}`,
    '',
    `## ${t.discussion}`,
    highlights.length > 0 ? highlights.join('\n') : `- ${t.none}`,
    '',
    `## ${t.decisions}`,
    decisions.length > 0 ? decisions.map(item => `- ${item}`).join('\n') : `- ${t.none}`,
    '',
    `## ${t.actions}`,
    actions.length > 0 ? actions.map(item => `- ${item}`).join('\n') : `- ${t.none}`,
  ].join('\n');
}
