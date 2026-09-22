// DeepSeek (chat.deepseek.com). UNVERIFIED selector: this has not been
// checked against a live, logged-in session. Manual (one click) by design.
// If the captured text is wrong: open DevTools on chat.deepseek.com, find
// the element wrapping one assistant reply, and put its selector first in
// the list below (window.__vcShared.lastMatchText tries each in order and
// falls back to a generic "last text block on the page" heuristic).
window.__vcSiteAdapter = {
  mode: 'manual',
  getLatestText: () => window.__vcShared.lastMatchText([
    '.ds-message--assistant',
    '[class*="assistant" i]',
  ]),
};
