// Gemini (gemini.google.com). Manual (one click) rather than auto-detected:
// unlike ChatGPT this has not been checked against a live session, so we
// don't trust ourselves to fire automatically at the right moment. The
// `model-response` custom element name is Gemini's known convention for an
// assistant turn; if a captured reply looks wrong, verify in DevTools and
// update the selector below.
window.__vcSiteAdapter = {
  mode: 'manual',
  getLatestText: () => window.__vcShared.lastMatchText(['model-response', '[data-test-id="model-response"]']),
};
