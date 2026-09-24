import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div dir="auto" className="message-markdown text-start text-[15px] leading-7 text-slate-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p dir="auto" className="my-1.5 text-start">{children}</p>,
          li: ({ children }) => <li dir="auto" className="my-0.5 text-start">{children}</li>,
          ul: ({ children }) => <ul className="my-1.5 list-disc space-y-0.5 ps-6">{children}</ul>,
          ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-0.5 ps-6">{children}</ol>,
          strong: ({ children }) => <strong className="font-bold text-slate-900">{children}</strong>,
          blockquote: ({ children }) => <blockquote dir="auto" className="my-2 border-s-2 border-blue-400 ps-3 text-start text-slate-600">{children}</blockquote>,
          code: ({ children, className }) => {
            const block = Boolean(className);
            return block ? (
              <code dir="ltr" className={`block overflow-x-auto rounded-lg bg-slate-900 p-3 text-start font-mono text-xs text-slate-100 ${className ?? ''}`}>{children}</code>
            ) : (
              <code dir="ltr" className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800">{children}</code>
            );
          },
          pre: ({ children }) => <pre dir="ltr" className="my-2 overflow-x-auto text-start">{children}</pre>,
          a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="font-medium text-blue-600 underline underline-offset-2">{children}</a>,
          h1: ({ children }) => <h1 dir="auto" className="my-2 text-start text-lg font-bold text-slate-900">{children}</h1>,
          h2: ({ children }) => <h2 dir="auto" className="my-2 text-start text-base font-bold text-slate-900">{children}</h2>,
          h3: ({ children }) => <h3 dir="auto" className="my-1.5 text-start text-sm font-bold text-slate-900">{children}</h3>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
