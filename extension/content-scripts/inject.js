// Wires the current page's site adapter (window.__vcSiteAdapter, set by one
// of content-scripts/site-adapters/*.js) up to window.__vcShared's capture
// mechanics, then hands the captured text to the background service worker.

(() => {
  const shared = window.__vcShared;
  const adapter = window.__vcSiteAdapter;
  if (!shared || !adapter) return;

  function sendCapture(content) {
    const trimmed = content && content.trim();
    if (!trimmed) return;
    chrome.runtime.sendMessage({ type: 'vc-capture', chatUrl: location.href, content: trimmed });
  }

  if (adapter.mode === 'auto' && adapter.selector) {
    shared.watchForQuietReply(adapter.selector, sendCapture, adapter.quietMs);
  } else {
    shared.injectFloatingButton(() => {
      const text = adapter.getLatestText ? adapter.getLatestText() : shared.genericLastAssistantText();
      sendCapture(text);
    });
  }
})();
