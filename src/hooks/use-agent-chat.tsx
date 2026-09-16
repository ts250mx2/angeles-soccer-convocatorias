"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/** La conversación se guarda en sessionStorage para que sobreviva al navegar
 *  entre el chat flotante y la página completa del agente. */
const STORAGE_KEY = "agent-chat-messages";

/** Con qué está corriendo el agente, según HL Console. Solo para enseñarlo. */
export interface ModeloEnUso {
  /** Nombre del agente en el portal de HL. */
  agente: string;
  proveedor: string;
  modelo: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Consultas SQL que el agente ejecutó para responder este turno */
  queries?: string[];
  error?: string;
}

/**
 * Estado del agente: historial, streaming NDJSON y con qué modelo corre.
 *
 * Vive en un contexto ÚNICO montado en DashboardLayout, no en un hook por
 * componente: el chat flotante y la página completa están montados a la vez
 * (el widget solo se oculta en /agente), así que con un estado por instancia
 * se desincronizaban —lo que escribías en uno no aparecía en el otro—. Con el
 * contexto son literalmente la misma conversación, el mismo modelo y el mismo
 * indicador de "respondiendo".
 *
 * El modelo ya no se ELIGE aquí: lo decide el agente en el portal de HL Console y la
 * pantalla solo lo enseña. Para cambiarlo se edita el agente en el portal; la app lo
 * toma sola al vencer su caché, sin tocar el .env ni volver a desplegar.
 */
function useAgentChatState() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const hydrated = useRef(false);
  const [enUso, setEnUso] = useState<ModeloEnUso | null>(null);

  /* Qué modelo está corriendo lo dice el servidor, que a su vez se lo pregunta a HL.
     Si HL no contesta se queda en null y la pantalla no pinta el rótulo: el chat tiene
     que abrirse igual, y el problema se dirá al mandar el primer mensaje. */
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch("/api/agent/modelos");
        const json = await res.json();
        if (!vivo || !json.success || !json.configurado) return;
        setEnUso({ agente: json.agente, proveedor: json.proveedor, modelo: json.modelo });
      } catch {
        /* sin rótulo; el chat funciona igual */
      }
    })();
    return () => { vivo = false; };
  }, []);

  // Rehidrata la conversación previa (al maximizar desde el chat flotante)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch {
      /* sessionStorage no disponible */
    }
    hydrated.current = true;
  }, []);

  // Persiste en cada cambio (solo después de rehidratar, para no pisar lo guardado)
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* cuota llena o no disponible */
    }
  }, [messages]);

  const clear = useCallback(() => {
    setMessages([]);
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
  }, []);

  const send = useCallback(async (text: string) => {
    const prompt = text.trim();
    if (!prompt) return;

    setBusy(true);
    let history: { role: "user" | "assistant"; content: string }[] = [];
    setMessages((prev) => {
      history = prev.map((m) => ({ role: m.role, content: m.content }));
      return [...prev, { role: "user", content: prompt }, { role: "assistant", content: "", queries: [] }];
    });

    const patchLast = (fn: (m: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        next[next.length - 1] = fn(next[next.length - 1]);
        return next;
      });
    };

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, history }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        patchLast((m) => ({ ...m, error: err?.error ?? "No se pudo contactar al agente." }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: any;
          try { evt = JSON.parse(line); } catch { continue; }
          if (evt.type === "text") {
            patchLast((m) => ({ ...m, content: m.content + evt.text }));
          } else if (evt.type === "tool") {
            patchLast((m) => ({ ...m, queries: [...(m.queries ?? []), evt.sql] }));
          } else if (evt.type === "error") {
            patchLast((m) => ({ ...m, error: evt.message }));
          }
        }
      }
    } catch {
      patchLast((m) => ({ ...m, error: "Error de conexión con el agente." }));
    } finally {
      setBusy(false);
    }
  }, []);

  return { messages, busy, send, clear, enUso };
}

type AgentChatValue = ReturnType<typeof useAgentChatState>;

const AgentChatContext = createContext<AgentChatValue | null>(null);

export function AgentChatProvider({ children }: { children: ReactNode }) {
  const value = useAgentChatState();
  return <AgentChatContext.Provider value={value}>{children}</AgentChatContext.Provider>;
}

export function useAgentChat(): AgentChatValue {
  const ctx = useContext(AgentChatContext);
  if (!ctx) throw new Error("useAgentChat debe usarse dentro de <AgentChatProvider>");
  return ctx;
}
