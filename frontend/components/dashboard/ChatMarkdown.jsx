"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Respostas da IA em Markdown (títulos, listas, negrito, tabelas), no visual do painel.
// Sem HTML cru: o react-markdown ignora tags HTML por padrão.
const components = {
  h1: ({ children }) => <h3 className="mb-2 mt-4 font-display text-base font-semibold text-mist first:mt-0">{children}</h3>,
  h2: ({ children }) => (
    <h3 className="mb-2 mt-5 flex items-center gap-2 font-display text-[15px] font-semibold text-mist first:mt-0">
      <span className="h-4 w-1 rounded-full bg-gradient-to-b from-neon to-volt" />
      {children}
    </h3>
  ),
  h3: ({ children }) => <h4 className="mb-1.5 mt-4 font-display text-sm font-semibold text-neon first:mt-0">{children}</h4>,
  h4: ({ children }) => <h5 className="mb-1 mt-3 text-sm font-semibold text-mist first:mt-0">{children}</h5>,
  p: ({ children }) => <p className="my-2 leading-relaxed text-mist/90 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-mist">{children}</strong>,
  em: ({ children }) => <em className="text-mist-dim">{children}</em>,
  ul: ({ children }) => (
    <ul className="my-2 space-y-1.5 [&>li]:relative [&>li]:pl-4 [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:top-[9px] [&>li]:before:h-1.5 [&>li]:before:w-1.5 [&>li]:before:rounded-full [&>li]:before:bg-neon [&>li]:before:content-['']">{children}</ul>
  ),
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1.5 pl-5 marker:font-mono marker:text-neon">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed text-mist/90">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-r-lg border-l-2 border-volt bg-volt/5 px-3 py-2 text-mist-dim">{children}</blockquote>
  ),
  hr: () => <hr className="my-4 border-void-line" />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-neon underline underline-offset-2">{children}</a>
  ),
  code: ({ children }) => <code className="rounded bg-void-card px-1.5 py-0.5 font-mono text-[12px] text-volt-soft">{children}</code>,
  pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-lg border border-void-line bg-void-card p-3 text-[12px]">{children}</pre>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-void-line">
      <table className="w-full border-collapse text-left text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-void-card/80">{children}</thead>,
  th: ({ children }) => <th className="border-b border-void-line px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-wider text-mist-faint">{children}</th>,
  td: ({ children }) => <td className="border-b border-void-line/60 px-3 py-2 text-mist/90">{children}</td>,
};

export default function ChatMarkdown({ text }) {
  return (
    <div className="text-sm [&_tr:last-child_td]:border-b-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{text}</ReactMarkdown>
    </div>
  );
}
