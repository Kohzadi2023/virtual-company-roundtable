import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="message-markdown text-sm leading-7 text-slate-100">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p dir="auto" className="my-2 text-start">{children}</p>,
          li: ({ children }) => <li dir="auto" className="my-1 text-start">{children}</li>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 ps-6">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 ps-6">{children}</ol>,
          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
          blockquote: ({ children }) => <blockquote dir="auto" className="my-3 border-s-2 border-indigo-500 ps-3 text-start text-slate-300">{children}</blockquote>,
          code: ({ children, className }) => {
            const block = Boolean(className);
            return block ? (
              <code dir="ltr" className={`block overflow-x-auto rounded-lg bg-slate-950 p-3 text-start font-mono text-xs text-slate-200 ${className ?? ''}`}>{children}</code>
            ) : (
              <code dir="ltr" className="rounded bg-slate-950 px-1.5 py-0.5 font-mono text-xs text-slate-200">{children}</code>
            );
          },
          pre: ({ children }) => <pre dir="ltr" className="my-3 overflow-x-auto text-start">{children}</pre>,
          a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="text-sky-300 underline underline-offset-2">{children}</a>,
          h1: ({ children }) => <h1 dir="auto" className="my-3 text-start text-lg font-bold">{children}</h1>,
          h2: ({ children }) => <h2 dir="auto" className="my-3 text-start text-base font-bold">{children}</h2>,
          h3: ({ children }) => <h3 dir="auto" className="my-2 text-start text-sm font-bold">{children}</h3>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
