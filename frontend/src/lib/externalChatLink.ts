export function normalizeExternalChatUrl(value: string): string {
  const clean = value.trim();
  if (!clean) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//iu.test(clean) ? clean : `https://${clean}`;
}

export function isValidExternalChatUrl(value: string): boolean {
  const normalized = normalizeExternalChatUrl(value);
  if (!normalized) return false;

  try {
    const url = new URL(normalized);
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}
