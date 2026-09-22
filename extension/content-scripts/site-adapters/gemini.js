// Gemini (gemini.google.com).
//
// Verified live against an unauthenticated gemini.google.com session
// (2026-09-22): a real conversation turn structure was confirmed (guest
// mode consistently returned a backend error rather than a real reply, so
// wording couldn't be checked, but the DOM structure and extraction path
// were).
//
// `<model-response>` (the original guessed selector) matches, but its
// innerText includes a visually-hidden `"Gemini said"` accessibility label
// (an `<h6 class="cdk-visually-hidden …">` sibling of the real content —
// `cdk-visually-hidden` keeps text in the accessibility tree without
// hiding it from `innerText`, unlike `display:none`). The custom element
// `<message-content>` nested inside `<model-response>` holds exactly the
// markdown answer with none of that — confirmed it never appears inside
// the user's own turn (`<user-query>`), so "the last match" is always the
// assistant's reply. Still manual (one click), not auto-detected: the
// extraction path is now verified, but real answer wording/formatting
// (this only ever produced an error message in guest mode) is not.
window.__vcSiteAdapter = {
  mode: 'manual',
  getLatestText: () => window.__vcShared.lastMatchText(['message-content', 'model-response']),
};
