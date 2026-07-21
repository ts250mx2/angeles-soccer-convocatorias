"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/contexts/user-context";
import { useAgentChat } from "@/hooks/use-agent-chat";
import AgentAnswer from "@/components/AgentAnswer";
import {
  Bot, Send, Loader2, AlertCircle, Database, X, Minus, Trash2, Maximize2,
} from "lucide-react";

/**
 * Chat flotante del agente (esquina inferior derecha).
 * Solo se muestra a administradores y se oculta en la página completa del agente.
 */
export default function AgentChatWidget() {
  const { user, isInitialized } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, busy, send, clear } = useAgentChat();

  useEffect(() => {
    if (open) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, busy, open]);

  const isAdmin = (user?.AdminConvocatorias ?? 0) >= 2;
  // No lo mostramos si no hay sesión, no es admin, o ya está la página completa abierta.
  if (!isInitialized || !user || !isAdmin || pathname === "/agente") return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || busy) return;
    send(input);
    setInput("");
  };

  return (
    <div className="fixed bottom-5 right-5 z-[200] print:hidden">
      {/* ── Panel ── */}
      {open && (
        <div className="mb-3 w-[min(92vw,400px)] h-[min(72vh,560px)] flex flex-col bg-[#0f172a] border border-white/15 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 bg-white/5 border-b border-white/10">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-lg bg-blue-500/15 border border-blue-500/25">
                <Bot size={15} className="text-blue-300" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-white leading-tight">Agente</p>
                <p className="text-[10px] text-slate-500 truncate">Consulta la base en vivo</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={clear} disabled={busy} title="Limpiar"
                  className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-all disabled:opacity-40">
                  <Trash2 size={14} />
                </button>
              )}
              <button
                onClick={() => { setOpen(false); router.push("/agente"); }}
                title="Maximizar (abrir Agente Inteligente)"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all">
                <Maximize2 size={14} />
              </button>
              <button onClick={() => setOpen(false)} title="Minimizar"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all">
                <Minus size={16} />
              </button>
            </div>
          </div>

          {/* Mensajes */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-4">
                <Bot size={28} className="text-blue-400/60" />
                <p className="text-xs text-slate-400">
                  Pregúntame sobre inscripciones, adeudos, caja, ventas o copas.
                </p>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] min-w-0 ${m.role === "user" ? "" : "w-full"}`}>
                  {m.role === "assistant" && (m.queries?.length ?? 0) > 0 && (
                    <div className="mb-1.5 space-y-1">
                      {m.queries!.map((q, qi) => (
                        <details key={qi} className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                          <summary className="px-2 py-1 text-[9px] font-black text-slate-400 uppercase tracking-widest cursor-pointer flex items-center gap-1 hover:text-slate-200">
                            <Database size={10} /> Consulta {qi + 1}
                          </summary>
                          <pre className="px-2 pb-1.5 text-[9px] text-emerald-300/90 whitespace-pre-wrap break-all font-mono">{q}</pre>
                        </details>
                      ))}
                    </div>
                  )}

                  <div className={`rounded-2xl px-3 py-2 break-words ${
                    m.role === "user" ? "bg-blue-600 text-white text-xs leading-relaxed whitespace-pre-wrap" : "bg-white/5 border border-white/10"
                  }`}>
                    {m.role === "user" ? m.content : (
                      m.content
                        ? <AgentAnswer content={m.content} question={messages[i - 1]?.content ?? ""} compact />
                        : (busy && i === messages.length - 1 && !m.error
                            ? <span className="inline-flex items-center gap-1.5 text-slate-400 text-xs"><Loader2 size={12} className="animate-spin" /> Pensando...</span>
                            : null)
                    )}
                  </div>

                  {m.error && (
                    <div className="mt-1.5 flex items-start gap-1.5 bg-rose-500/10 border border-rose-500/25 text-rose-300 rounded-lg px-2 py-1.5 text-[10px]">
                      <AlertCircle size={12} className="flex-shrink-0 mt-0.5" /> {m.error}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <form onSubmit={submit} className="p-2.5 border-t border-white/10 bg-white/5 flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(e as unknown as React.FormEvent); }
              }}
              rows={1}
              placeholder="Escribe tu pregunta..."
              disabled={busy}
              className="flex-1 resize-none bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all placeholder:text-slate-500 disabled:opacity-60 max-h-28"
            />
            <button type="submit" disabled={busy || !input.trim()}
              className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </form>
        </div>
      )}

      {/* ── Botón flotante ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        title={open ? "Cerrar agente" : "Abrir agente"}
        className={`ml-auto flex items-center justify-center w-14 h-14 rounded-full shadow-2xl border transition-all hover:scale-105 active:scale-95 ${
          open
            ? "bg-white/10 border-white/20 text-slate-300 hover:text-white"
            : "bg-blue-600 border-blue-500 text-white shadow-blue-600/40"
        }`}
      >
        {open ? <X size={22} /> : <Bot size={24} />}
        {!open && busy && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#0f172a] animate-pulse" />
        )}
      </button>
    </div>
  );
}
