"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Render de las respuestas del agente con estilo premium.
 * react-markdown construye elementos React (no usa dangerouslySetInnerHTML),
 * así que el contenido del modelo no puede inyectar HTML.
 */
export default function AgentMarkdown({ content, compact = false }: { content: string; compact?: boolean }) {
  const base = compact ? "text-xs" : "text-sm";

  return (
    <div className={`${base} leading-relaxed text-slate-200 break-words`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ── Títulos ──
          h1: ({ children }) => (
            <h1 className={`${compact ? "text-sm" : "text-base"} font-black text-white mt-4 first:mt-0 mb-2 pb-1.5 border-b border-white/10`}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className={`${compact ? "text-xs" : "text-sm"} font-black text-white mt-4 first:mt-0 mb-2 flex items-center gap-2`}>
              <span className="w-1 h-4 rounded-full bg-blue-500 flex-shrink-0" />
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-black text-blue-300 uppercase tracking-widest mt-3 first:mt-0 mb-1.5">{children}</h3>
          ),

          // ── Texto ──
          p: ({ children }) => <p className="mb-2.5 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-black text-white">{children}</strong>,
          em: ({ children }) => <em className="italic text-slate-300">{children}</em>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline underline-offset-2 hover:text-blue-300">
              {children}
            </a>
          ),
          hr: () => <hr className="my-3 border-white/10" />,

          // ── Listas ──
          ul: ({ children }) => <ul className="mb-2.5 last:mb-0 space-y-1 pl-1">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2.5 last:mb-0 space-y-1 pl-5 list-decimal marker:text-blue-400 marker:font-bold">{children}</ol>,
          li: ({ children }) => (
            <li className="flex gap-2 [ol_&]:list-item [ol_&]:flex-none">
              <span className="text-blue-400 mt-[3px] flex-shrink-0 [ol_&]:hidden">▸</span>
              <span className="min-w-0 flex-1">{children}</span>
            </li>
          ),

          // ── Tablas ──
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03]">
              <table className="w-full border-collapse text-left">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-white/[0.06]">{children}</thead>,
          th: ({ children }) => (
            <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-white/10 whitespace-nowrap">
              {children}
            </th>
          ),
          tbody: ({ children }) => <tbody className="divide-y divide-white/5">{children}</tbody>,
          tr: ({ children }) => <tr className="hover:bg-white/[0.04] transition-colors">{children}</tr>,
          td: ({ children }) => (
            <td className="px-3 py-2 text-slate-200 align-top tabular-nums">{children}</td>
          ),

          // ── Código ──
          code: ({ className, children }) => {
            const isBlock = (className ?? "").includes("language-");
            if (isBlock) {
              return (
                <code className="block bg-slate-950/70 border border-white/10 rounded-xl p-3 my-2 overflow-x-auto text-[11px] font-mono text-emerald-300/90 whitespace-pre">
                  {children}
                </code>
              );
            }
            return (
              <code className="px-1.5 py-0.5 rounded-md bg-white/10 border border-white/10 text-[0.9em] font-mono text-emerald-300">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,

          // ── Citas ──
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-blue-500/60 bg-blue-500/5 rounded-r-lg pl-3 pr-2 py-1.5 my-2 text-slate-300">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
