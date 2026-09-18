function fallbackCopyText(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.inset = '0 auto auto 0';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } finally {
    textarea.remove();
  }

  if (!copied) throw new Error('Clipboard copy failed');
}

export async function copyText(text: string): Promise<void> {
  if (!text) throw new Error('Nothing to copy');

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some browsers expose the Clipboard API but reject writes when the
      // page is not trusted or clipboard permission is unavailable.
      // Fall through to the synchronous textarea implementation.
    }
  }

  fallbackCopyText(text);
}
