import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownDocument } from '@/components/MarkdownDocument';

/**
 * Opens the system print dialog for a Markdown document, from which the user
 * can save it as a PDF. It renders the same component the dialog previews, in
 * a hidden iframe that borrows this page's stylesheets, so the printout looks
 * like the preview without adding a PDF library.
 */
export function printMarkdown(markdown: string, options: { title: string; dir: 'ltr' | 'rtl' }): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);

  const frameDocument = iframe.contentDocument;
  const frameWindow = iframe.contentWindow;
  if (!frameDocument || !frameWindow) {
    iframe.remove();
    throw new Error('Printing is not available in this window.');
  }

  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map(node => node.outerHTML)
    .join('\n');
  const body = renderToStaticMarkup(createElement(MarkdownDocument, { content: markdown, dir: options.dir }));
  const printCss = '@page{margin:18mm}body{background:#fff}table{page-break-inside:auto}tr{page-break-inside:avoid}h2{page-break-after:avoid}';

  frameDocument.open();
  frameDocument.write(`<!doctype html><html dir="${options.dir}"><head><meta charset="utf-8"><title>${escapeHtml(options.title)}</title>${styles}<style>${printCss}</style></head><body>${body}</body></html>`);
  frameDocument.close();

  const cleanup = () => window.setTimeout(() => iframe.remove(), 1000);
  frameWindow.addEventListener('afterprint', cleanup, { once: true });
  // Stylesheets copied by <link> load asynchronously; printing before they do gives an unstyled page.
  const print = () => {
    frameWindow.focus();
    frameWindow.print();
  };
  if (frameDocument.readyState === 'complete') window.setTimeout(print, 150);
  else frameWindow.addEventListener('load', () => window.setTimeout(print, 150), { once: true });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
}
