// Relays a captured reply from an AI-site content script to every open
// Virtual Company Roundtable tab. Content scripts on different tabs can't
// message each other directly, so this service worker is the only piece
// that needs to know both "who can send a capture" and "who can receive one".

const VC_APP_URL_PATTERNS = [
  'http://localhost:5173/*',
  'http://127.0.0.1:5173/*',
  'http://localhost:8080/*',
  'http://127.0.0.1:8080/*',
];

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'vc-capture') return false;

  chrome.tabs.query({ url: VC_APP_URL_PATTERNS }, tabs => {
    const deliver = {
      type: 'vc-deliver',
      chatUrl: message.chatUrl,
      content: message.content,
      capturedAt: Date.now(),
    };
    for (const tab of tabs) {
      if (tab.id == null) continue;
      chrome.tabs.sendMessage(tab.id, deliver, () => {
        // No Virtual Company tab listening yet on this one — ignore.
        void chrome.runtime.lastError;
      });
    }
    sendResponse({ delivered: tabs.length });
  });

  return true; // keep the message channel open for the async sendResponse above
});
