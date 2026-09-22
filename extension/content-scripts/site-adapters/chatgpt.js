// ChatGPT (chatgpt.com / chat.openai.com).
//
// Verified live against an unauthenticated chatgpt.com session (2026-09-22):
// - The assistant turn attribute is `data-message-role="assistant"`, NOT
//   `data-message-author-role` (an earlier, unverified guess in this file).
// - Its first child is an `<h4>`/`<h5>`/`<h6>` accessibility label
//   ("ChatGPT said:") that must be excluded, not part of the reply.
// - `innerText` on the turn can include a `<script type="application/json">`
//   hydration payload's raw JSON text; must be stripped.
// - In guest/unauthenticated mode specifically, the turn can also contain a
//   trailing `<section>` ad ("Speechify …") — logged-in accounts should not
//   see this, but it's excluded defensively either way.
// - `data-message-complete` exists but can flip to true while only a short
//   preamble line has rendered and the real answer is still streaming below
//   it — confirmed live, so this adapter does NOT use it as the completion
//   signal. Completion is still detected by content settling (quietMs in
//   shared.js's watchForQuietReply), which is unaffected by that timing.
window.__vcSiteAdapter = {
  mode: 'auto',
  selector: '[data-message-role="assistant"]',
  quietMs: 1200,
  extractText(node) {
    const heading = node.querySelector(':scope > h4, :scope > h5, :scope > h6');
    const contentEl = heading ? heading.nextElementSibling : node;
    if (!contentEl) return '';
    const clone = contentEl.cloneNode(true);
    clone.querySelectorAll('script, style, section, [aria-label="Response actions"]').forEach(el => el.remove());
    return clone.innerText.trim();
  },
};
