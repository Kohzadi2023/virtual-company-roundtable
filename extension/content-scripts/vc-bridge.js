// Runs only on the Virtual Company Roundtable app's own tab. Its only job is
// to turn an extension message into a plain DOM CustomEvent the app already
// knows how to listen for (see frontend/src/lib/extensionBridge.ts) — the
// app has no idea a browser extension exists beyond that one event name.

chrome.runtime.onMessage.addListener(message => {
  if (message?.type !== 'vc-deliver') return;
  window.dispatchEvent(new CustomEvent('virtual-company:extension-response', {
    detail: {
      chatUrl: message.chatUrl,
      content: message.content,
      capturedAt: message.capturedAt,
    },
  }));
});
