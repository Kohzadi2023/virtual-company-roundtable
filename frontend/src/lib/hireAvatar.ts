// Same portrait service the built-in agents use (see defaultCompany.ts).
const PORTRAIT_BASE = 'https://randomuser.me/api/portraits';
const PORTRAIT_COUNT = 100;

const FEMALE_FIRST_NAMES = new Set([
  'alice', 'amanda', 'amy', 'anna', 'ava', 'barbara', 'camila', 'carla', 'caroline', 'catherine',
  'claire', 'daniela', 'diana', 'elena', 'elizabeth', 'ella', 'emily', 'emma', 'eva', 'fatima',
  'grace', 'hannah', 'helen', 'isabella', 'jasmine', 'jennifer', 'jessica', 'julia', 'karen', 'kate',
  'laura', 'layla', 'lily', 'linda', 'lisa', 'maria', 'maya', 'megan', 'mia', 'mina',
  'nadia', 'natalie', 'nina', 'olivia', 'paula', 'priya', 'rachel', 'rebecca', 'rosa', 'ruth',
  'sara', 'sarah', 'sofia', 'sophia', 'susan', 'tara', 'victoria', 'yasmin', 'zoe',
]);

function hashName(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return hash;
}

/**
 * Stable portrait for an AI specialist created at runtime: the same name
 * always maps to the same photo, and the portrait set follows the first
 * name so "Evan" doesn't get a woman's photo. Best-effort only -- AgentAvatar
 * already falls back to the emoji if the image fails to load.
 */
export function avatarUrlForHire(agentName: string): string {
  const normalized = agentName.trim().toLocaleLowerCase();
  const firstName = normalized.split(/\s+/)[0] ?? '';
  const set = FEMALE_FIRST_NAMES.has(firstName) ? 'women' : 'men';
  return `${PORTRAIT_BASE}/${set}/${hashName(normalized) % PORTRAIT_COUNT}.jpg`;
}
