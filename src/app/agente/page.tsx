"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import { useAgentChat } from "@/hooks/use-agent-chat";
import AgentAnswer from "@/components/AgentAnswer";
import {
  Bot, Send, Loader2, AlertCircle, Database, User as UserIcon, Trash2, ShieldAlert,
} from "lucide-react";

const SUGERENCIAS = [
  "¿Cuántos jugadores activos hay por sede en la temporada actual?",
  "¿Cuánto se ha vendido por tipo de producto este mes?",
  "¿Qué sede tiene más adeudos de inscripción?",
  "Muéstrame los cortes de caja de la última semana",
];

export default function AgentePage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();

  const isAdmin = (user?.AdminConvocatorias ?? 0) >= 2;

  const { messages, busy, send, clear, modelos, modelo, setModelo } = useAgentChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Solo administradores
  useEffect(() => {
    if (!isInitialized) return;
    if (!user) { router.push("/login"); return; }
    if ((user.AdminConvocatorias ?? 0) < 2) { router.push("/"); }
  }, [user, isInitialized, router]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // Envía y limpia el input (la lógica de streaming vive en useAgentChat)
  const submit = (text: string) => {
    if (!text.trim() || busy) return;
    send(text);
    setInput("");
  };

  // Pantalla para no administradores (además del redirect)
  if (isInitialized && user && !isAdmin) {
    return (
      <DashboardLayout>
        <main className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 p-8">
          <ShieldAlert size={44} className="text-amber-400 opacity-70" />
          <h1 className="text-lg font-black text-white">Acceso restringido</h1>
          <p className="text-sm">El agente está disponible solo para administradores.</p>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <main className="flex-1 flex flex-col text-white min-h-0">

        {/* ── Header ── */}
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-blue-500/15 border border-blue-500/25">
              <Bot size={20} className="text-blue-300" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-black">Agente Inteligente</h1>
              <p className="text-xs text-blue-300 mt-0.5 truncate">Pregunta lo que sea sobre todos los módulos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Selector de modelo: solo aparece si el servidor ofrece más de uno.
                Cambiarlo no borra la conversación: el historial se le manda igual. */}
            {modelos.length > 1 ? (
              <select
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                disabled={busy}
                title={modelos.find((m) => m.key === modelo)?.descripcion}
                className="appearance-none px-3 py-1.5 pr-8 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-slate-200 outline-none cursor-pointer hover:bg-white/10 focus:border-blue-500/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed [color-scheme:dark]"
              >
                {modelos.map((m) => (
                  <option key={m.key} value={m.key} className="bg-slate-900 text-white">
                    {m.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-slate-300">
                {modelos[0]?.label ?? "Sonnet 5"}
              </span>
            )}
            {messages.length > 0 && (
              <button onClick={clear} disabled={busy}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all disabled:opacity-50"
                title="Limpiar conversación">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>

        {/* ── Conversación ── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-3xl mx-auto space-y-5">
            {messages.length === 0 && (
              <div className="py-12 text-center">
                <div className="inline-flex p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 mb-4">
                  <Bot size={32} className="text-blue-400" />
                </div>
                <h2 className="text-lg font-black text-white">¿En qué te ayudo?</h2>
                <p className="text-sm text-slate-400 mt-1 mb-6">
                  Consulto la base de datos en vivo para responderte.
                </p>
                <div className="grid sm:grid-cols-2 gap-2 max-w-xl mx-auto">
                  {SUGERENCIAS.map((s) => (
                    <button key={s} onClick={() => submit(s)}
                      className="text-left text-xs text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-500/40 rounded-xl px-4 py-3 transition-all">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
                {m.role === "assistant" && (
                  <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center flex-shrink-0">
                    <Bot size={16} className="text-blue-300" />
                  </div>
                )}
                <div className={`min-w-0 ${m.role === "user" ? "max-w-[85%]" : "flex-1"}`}>
                  {/* Consultas ejecutadas */}
                  {m.role === "assistant" && (m.queries?.length ?? 0) > 0 && (
                    <div className="mb-2 space-y-1">
                      {m.queries!.map((q, qi) => (
                        <details key={qi} className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                          <summary className="px-3 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer flex items-center gap-1.5 hover:text-slate-200">
                            <Database size={11} /> Consulta {qi + 1}
                          </summary>
                          <pre className="px-3 pb-2 text-[10px] text-emerald-300/90 whitespace-pre-wrap break-all font-mono">{q}</pre>
                        </details>
                      ))}
                    </div>
                  )}

                  <div className={`rounded-2xl px-4 py-3 break-words ${
                    m.role === "user"
                      ? "bg-blue-600 text-white text-sm leading-relaxed whitespace-pre-wrap"
                      : "bg-white/5 border border-white/10"
                  }`}>
                    {m.role === "user" ? m.content : (
                      m.content
                        ? <AgentAnswer content={m.content} question={messages[i - 1]?.content ?? ""} />
                        : (busy && i === messages.length - 1 && !m.error
                            ? <span className="inline-flex items-center gap-2 text-slate-400 text-sm"><Loader2 size={14} className="animate-spin" /> Pensando...</span>
                            : null)
                    )}
                  </div>

                  {m.error && (
                    <div className="mt-2 flex items-start gap-2 bg-rose-500/10 border border-rose-500/25 text-rose-300 rounded-xl px-3 py-2 text-xs">
                      <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {m.error}
                    </div>
                  )}
                </div>
                {m.role === "user" && (
                  <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0">
                    <UserIcon size={16} className="text-slate-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Input ── */}
        <div className="border-t border-white/10 bg-white/5 backdrop-blur-xl p-4">
          <form
            onSubmit={(e) => { e.preventDefault(); submit(input); }}
            className="max-w-3xl mx-auto flex items-end gap-2"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(input); }
              }}
              rows={1}
              placeholder="Pregunta sobre inscripciones, adeudos, caja, ventas, copas…"
              disabled={busy}
              className="flex-1 resize-none bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all placeholder:text-slate-500 disabled:opacity-60 max-h-40"
            />
            <button type="submit" disabled={busy || !input.trim()}
              className="p-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </form>
          <p className="max-w-3xl mx-auto text-[10px] text-slate-500 mt-2">
            El agente solo puede <span className="font-bold">leer</span> datos (consultas SELECT); nunca modifica información.
          </p>
        </div>
      </main>
    </DashboardLayout>
  );
}
