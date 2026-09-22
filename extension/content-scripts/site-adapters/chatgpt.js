// ChatGPT (chatgpt.com / chat.openai.com). `data-message-author-role` has
// been ChatGPT's stable convention for marking each turn for a long time,
// so this runs fully automatically: no button, captures as soon as a reply
// stops changing.
window.__vcSiteAdapter = {
  mode: 'auto',
  selector: '[data-message-author-role="assistant"]',
  quietMs: 1200,
};
