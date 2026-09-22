# Virtual Company Roundtable Bridge (browser extension)

Removes the manual copy step from the app's copy/paste round-trip. It reads
the latest reply on a supported AI chat site and delivers it straight into
the matching agent's **Agent Response** box in the Virtual Company
Roundtable app — you still review it and click **Add Response** yourself,
same as today.

## How it works

1. In the app, set each agent's external chat link as usual (Meeting →
   agent row → chat URL). That link is what this extension matches a tab
   against — it never guesses which agent a reply belongs to.
2. Open that URL in a real browser tab (not the desktop app; see
   [Limitations](#limitations)) and have your conversation there.
3. **ChatGPT**: captures automatically once a reply stops streaming.
4. **Gemini, DeepSeek, Qwen, Grok, Meta AI**: click the floating
   "↩ Send to Virtual Company" button (bottom-right of the page) once the
   reply has finished.
5. Switch to the Virtual Company Roundtable tab — if that agent is selected
   in the Agent Response tab, the box is filled in for you.

## Install (unpacked, for development)

1. `chrome://extensions` (or the equivalent in Edge/Brave) → enable
   **Developer mode**.
2. **Load unpacked** → select this `extension/` folder.
3. Open the Virtual Company Roundtable app in a tab
   (`http://localhost:5173` for `npm run dev`, or `http://localhost:8080`
   for the Docker Compose setup).

## Site coverage and accuracy

| Site | Capture | Confidence |
| --- | --- | --- |
| ChatGPT | Automatic | **Verified 2026-09-22** against a live, unauthenticated `chatgpt.com` session — see below. |
| Gemini | One click | **Verified 2026-09-22** against a live, unauthenticated `gemini.google.com` session — see below. |
| DeepSeek, Qwen, Grok, Meta AI | One click | Selectors are best-effort guesses, **not verified against a live session**, with a generic "last text block on the page" fallback. |

### What "verified" caught for ChatGPT

The first version of `chatgpt.js` shipped with an unverified selector
(`data-message-author-role`) that turned out not to exist at all — the real
attribute is `data-message-role="assistant"`. Testing live also found two
extraction bugs a selector guess alone wouldn't have caught:

- `innerText` on the message container included a `"ChatGPT said:"`
  accessibility label and, once, the raw JSON text of a `<script
  type="application/json">` hydration payload sitting inside it.
- In guest/unauthenticated mode specifically, the container also included a
  trailing ad ("Speechify …"); logged-in accounts should not see this, but
  it's excluded defensively either way.
- ChatGPT's `data-message-complete` attribute can flip to `true` while only
  a short preamble line has rendered and the real answer is still streaming
  in below it — confirmed live. `chatgpt.js` does not use it; completion is
  still detected by content settling (see `watchForQuietReply` in
  `shared.js`), which isn't affected by that timing.

All fixed in `content-scripts/site-adapters/chatgpt.js` and confirmed
end-to-end: a real reply ("purple elephant") was captured verbatim, with no
label, script payload, or ad text mixed in.

### What "verified" caught for Gemini

The original guessed selector, `model-response`, does match a real element
— but its `innerText` includes a visually-hidden `"Gemini said"`
accessibility label (`cdk-visually-hidden` keeps text in the accessibility
tree without hiding it from `innerText`, unlike `display:none`). The
`<message-content>` custom element nested inside `<model-response>` holds
exactly the markdown answer with none of that label text, and never
appears inside the user's own turn (`<user-query>`) — confirmed by
querying both. `gemini.js` now tries `message-content` first.

Guest/unauthenticated mode consistently returned a backend error
("Sorry, something went wrong…") rather than a real answer on every
attempt, so the DOM structure and extraction path were confirmed live, but
real answer wording/formatting on a logged-in account was not.

Claude built this without accounts on Gemini/DeepSeek/Qwen/Grok/Meta AI
(and both ChatGPT and Gemini were only reachable in guest/unauthenticated
mode), so DeepSeek/Qwen/Grok/Meta AI — and both ChatGPT's and Gemini's
behavior specifically on your logged-in account — still need real-world
confirmation. If a captured reply looks wrong (wrong text, includes UI
chrome, etc.):

1. Open DevTools on the site, inspect the element that wraps one assistant
   reply.
2. Open `content-scripts/site-adapters/<site>.js` and put that element's
   selector first in the `getLatestText` list (or fix `extractText` for
   ChatGPT if its logged-in DOM differs from the guest version tested here).
3. Reload the extension from `chrome://extensions`.

## Limitations

- **Desktop (Tauri) app**: a browser extension cannot inject into a Tauri
  native webview. This only works when the app is open as a regular browser
  tab (`npm run dev` or Docker), not the packaged desktop build.
- **Chat link must be exact**: the extension only fills the box when the
  captured tab's URL exactly matches the `chatUrl` stored for that agent
  (e.g. a fresh ChatGPT conversation gets a new URL — update the stored
  link when you start a new conversation with an agent).
- Auto-capture on ChatGPT, and the manual button on the other five sites,
  both depend on each site's current DOM. AI chat products change their UI
  without notice; if capture stops working, it likely needs a selector
  update as described above.
