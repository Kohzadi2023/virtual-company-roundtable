const SUPPORTED_HOSTS = [
  'chatgpt.com',
  'chat.openai.com',
  'gemini.google.com',
  'chat.deepseek.com',
  'qwen.ai',
  'tongyi.aliyun.com',
  'grok.com',
  'x.com',
  'meta.ai',
];

function hostIsSupported(hostname) {
  return SUPPORTED_HOSTS.some(host => hostname === host || hostname.endsWith(`.${host}`));
}

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const statusEl = document.getElementById('status');
  if (!tab?.url) {
    statusEl.textContent = 'No active tab.';
    return;
  }
  let hostname = '';
  try {
    hostname = new URL(tab.url).hostname;
  } catch {
    // Not a normal http(s) URL (e.g. a chrome:// page) — leave hostname empty.
  }
  if (hostIsSupported(hostname)) {
    statusEl.textContent = `Watching this tab (${hostname}).`;
    statusEl.className = 'status on';
  } else {
    statusEl.textContent = 'This tab is not a supported AI chat site.';
    statusEl.className = 'status off';
  }
});
