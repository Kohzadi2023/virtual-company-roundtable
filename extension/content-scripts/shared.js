// Shared helpers used by every site adapter (content-scripts/site-adapters/*.js)
// and wired up by content-scripts/inject.js. Loaded first via manifest.json so
// `window.__vcShared` exists before a site adapter or inject.js runs.

(() => {
  if (window.__vcShared) return;

  /**
   * Default text extraction for a matched "assistant turn" node: strips
   * <script>/<style> content. Verified against a live ChatGPT session that
   * innerText can otherwise include a <script type="application/json">
   * hydration payload sitting inside the message container — `innerText`
   * is supposed to skip script/style per spec, but don't rely on that.
   * Site adapters pass their own `extractText` when a site embeds other
   * noise (ChatGPT also has a "{Model} said:" label heading and, in guest
   * mode, an inline ad — see chatgpt.js).
   */
  function defaultExtractText(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll('script, style').forEach(el => el.remove());
    return clone.innerText.trim();
  }

  /**
   * Generic "grab the last substantial block of text on the page" fallback.
   * Used when a site adapter has no (or an unverified) site-specific selector.
   * It is intentionally last-resort: it has no idea what is a user turn vs an
   * assistant turn, so it is only trustworthy right after the user manually
   * confirms (by clicking the injected button) that the assistant has finished
   * replying — see site adapters for how each one layers a better selector
   * on top of this when one is known.
   */
  function genericLastAssistantText() {
    const root = document.querySelector('main') ?? document.body;
    const blocks = Array.from(root.querySelectorAll('p, div, article, section, li'))
      .filter(el => el.children.length === 0 && !el.closest('textarea, input, button, script, style, [contenteditable="true"]'))
      .filter(el => (el.innerText ?? '').trim().length > 15);
    const last = blocks.at(-1);
    return last ? defaultExtractText(last) : null;
  }

  /**
   * Tries each selector in order and returns the extracted text of the LAST
   * matching element (site adapters use this for their best-known
   * "assistant turn" selector), falling back to the generic heuristic.
   * `extractText` defaults to `defaultExtractText` but a site adapter can
   * pass its own for known site-specific noise (see chatgpt.js).
   */
  function lastMatchText(selectors, extractText = defaultExtractText) {
    for (const selector of selectors) {
      try {
        const nodes = document.querySelectorAll(selector);
        const last = nodes[nodes.length - 1];
        const text = last ? extractText(last) : null;
        if (text) return text;
      } catch {
        // Invalid/unsupported selector on this page — try the next one.
      }
    }
    return genericLastAssistantText();
  }

  /**
   * Auto-detection for sites where we're reasonably confident about the
   * "assistant turn" selector: watches `selector`'s matches and fires
   * `onSettled(text)` once a turn's content stops changing for `quietMs`
   * (a finished response has stopped streaming; a still-streaming one keeps
   * mutating). This is deliberately based on "content stopped changing",
   * not a single "done" attribute/button: verified live on ChatGPT that its
   * `data-message-complete` attribute can flip to true while only a short
   * preamble has rendered and the real answer is still streaming in below
   * it, so trusting that attribute alone would capture an incomplete reply.
   */
  function watchForQuietReply(selector, onSettled, quietMs = 1200, extractText = defaultExtractText) {
    let timer = null;
    let lastNode = null;
    let lastText = '';

    const observer = new MutationObserver(() => {
      const nodes = document.querySelectorAll(selector);
      const node = nodes[nodes.length - 1];
      if (!node) return;
      if (node !== lastNode) {
        lastNode = node;
        lastText = '';
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const text = extractText(node);
        if (text && text !== lastText) {
          lastText = text;
          onSettled(text);
        }
      }, quietMs);
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }

  /**
   * Injects a small floating "Send to Virtual Company" button (fixed
   * position, bottom-right) that calls `onClick` when pressed. A fixed
   * floating button is used instead of anchoring next to each site's own
   * input toolbar because that toolbar's markup varies far more, and more
   * often, than a page's basic layout.
   */
  function injectFloatingButton(onClick) {
    if (document.getElementById('vc-send-button')) return;
    const button = document.createElement('button');
    button.id = 'vc-send-button';
    button.type = 'button';
    button.textContent = '↩ Send to Virtual Company';
    Object.assign(button.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: '2147483647',
      padding: '10px 14px',
      borderRadius: '10px',
      border: 'none',
      background: '#2563eb',
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
      fontWeight: '600',
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      cursor: 'pointer',
    });
    button.addEventListener('click', () => {
      const original = button.textContent;
      button.textContent = '✓ Sent';
      setTimeout(() => { button.textContent = original; }, 1500);
      onClick();
    });
    document.body.appendChild(button);
  }

  window.__vcShared = { defaultExtractText, genericLastAssistantText, lastMatchText, watchForQuietReply, injectFloatingButton };
})();
