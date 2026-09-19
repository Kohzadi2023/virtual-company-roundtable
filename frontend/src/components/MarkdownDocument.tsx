import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownDocumentProps {
  content: string;
  dir?: 'ltr' | 'rtl';
}

export function MarkdownDocument({ content, dir = 'ltr' }: MarkdownDocumentProps) {
  return (
    <article dir={dir} className="mx-auto w-full max-w-4xl px-1 pb-8 text-start text-[13px] leading-7 text-slate-700">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-5 border-b border-slate-200 pb-3 text-2xl font-bold tracking-tight text-slate-950">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-7 text-lg font-bold tracking-tight text-slate-900">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-5 text-base font-bold text-slate-900">{children}</h3>
          ),
          p: ({ children }) => <p dir="auto" className="my-2.5 leading-7">{children}</p>,
          strong: ({ children }) => <strong className="font-bold text-slate-900">{children}</strong>,
          em: ({ children }) => <em className="italic text-slate-700">{children}</em>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 ps-6">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 ps-6">{children}</ol>,
          li: ({ children }) => <li dir="auto" className="ps-1 leading-6">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote dir="auto" className="my-4 border-s-4 border-blue-300 bg-blue-50/60 px-4 py-2 text-slate-600">{children}</blockquote>
          ),
          hr: () => <hr className="my-6 border-slate-200" />,
          table: ({ children }) => (
            <div className="my-4 w-full overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
              <table className="w-full min-w-[640px] border-collapse bg-white text-start text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-slate-50 text-slate-700">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-slate-100">{children}</tbody>,
          tr: ({ children }) => <tr className="divide-x divide-slate-200">{children}</tr>,
          th: ({ children }) => (
            <th dir="auto" className="whitespace-nowrap px-3 py-2.5 text-start font-bold text-slate-800">{children}</th>
          ),
          td: ({ children }) => (
            <td dir="auto" className="align-top px-3 py-2.5 leading-5 text-slate-600">{children}</td>
          ),
          pre: ({ children }) => (
            <pre className="my-4 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">{children}</pre>
          ),
          code: ({ children, className }) => (
            <code className={className ?? 'rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.92em] text-slate-800'}>{children}</code>
          ),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="font-medium text-blue-600 underline decoration-blue-200 underline-offset-2 hover:text-blue-700">{children}</a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
