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
| ChatGPT | Automatic | Selector (`[data-message-author-role="assistant"]`) is ChatGPT's long-standing convention. |
| Gemini | One click | Selector is a best-effort guess (`model-response`), **not verified against a live session**. |
| DeepSeek, Qwen, Grok, Meta AI | One click | Selectors are best-effort guesses, **not verified against a live session**, with a generic "last text block on the page" fallback. |

Claude built this without accounts on Gemini/DeepSeek/Qwen/Grok/Meta AI, so
those five adapters could not be checked against real, logged-in pages. If a
captured reply looks wrong (wrong text, includes UI chrome, etc.):

1. Open DevTools on the site, inspect the element that wraps one assistant
   reply.
2. Open `content-scripts/site-adapters/<site>.js` and put that element's
   selector first in the `getLatestText` list.
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
