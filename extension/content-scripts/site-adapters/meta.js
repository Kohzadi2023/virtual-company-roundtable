// Meta AI (meta.ai). UNVERIFIED selector: this has not been checked against
// a live, logged-in session. Manual (one click) by design. If the captured
// text is wrong: open DevTools, find the element wrapping one assistant
// reply, and put its selector first below.
window.__vcSiteAdapter = {
  mode: 'manual',
  getLatestText: () => window.__vcShared.lastMatchText([
    '[class*="assistant" i]',
    '[data-testid*="assistant" i]',
  ]),
};
