"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** La conversación se guarda en sessionStorage para que sobreviva al navegar
 *  entre el chat flotante y la página completa del agente. */
const STORAGE_KEY = "agent-chat-messages";

/** Modelo elegido: se recuerda entre sesiones en este navegador. */
const MODEL_KEY = "agent-chat-model";

export interface ModeloDisponible {
  key: string;
  label: string;
  descripcion: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Consultas SQL que el agente ejecutó para responder este turno */
  queries?: string[];
  error?: string;
}

/**
 * Lógica compartida del agente: historial, streaming NDJSON y selección de modelo.
 * La usan tanto la página completa como el chat flotante.
 */
export function useAgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const hydrated = useRef(false);
  const [modelos, setModelos] = useState<ModeloDisponible[]>([]);
  const [modelo, setModeloState] = useState<string>("sonnet");
  // El modelo viaja en cada petición; se lee del ref para no recrear `send`.
  const modeloRef = useRef(modelo);
  modeloRef.current = modelo;

  /* Los modelos utilizables los decide el servidor (según qué llaves estén
     configuradas), así que no se pueden fijar en el cliente. */
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch("/api/agent/modelos");
        const json = await res.json();
        if (!vivo || !json.success) return;
        setModelos(json.modelos);
        const guardado = localStorage.getItem(MODEL_KEY);
        const valido = json.modelos.some((m: ModeloDisponible) => m.key === guardado);
        setModeloState(valido && guardado ? guardado : json.porDefecto);
      } catch {
        /* sin lista: se usa el modelo por defecto del servidor */
      }
    })();
    return () => { vivo = false; };
  }, []);

  const setModelo = useCallback((key: string) => {
    setModeloState(key);
    try { localStorage.setItem(MODEL_KEY, key); } catch { /* noop */ }
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
        body: JSON.stringify({ prompt, history, model: modeloRef.current }),
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

  return { messages, busy, send, clear, modelos, modelo, setModelo };
}
