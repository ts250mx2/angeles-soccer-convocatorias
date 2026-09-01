"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Loader2, Search, X } from "lucide-react";
import type { Candidato } from "@/lib/plantilla-equipo";

/**
 * Traer a un jugador de otro equipo al que se está armando.
 *
 * No es un movimiento de pantalla: cambia el equipo del jugador en su ficha, y de ahí
 * cuelgan Convocatorias, Adeudos y los listados por categoría. Por eso se pide
 * confirmación siempre, y por eso el aviso de que no le cuadra el año va ANTES de
 * apretar, no después.
 *
 * El aviso no bloquea. Subir a un niño de categoría es una decisión legítima del club
 * —el que destaca juega con los grandes—; lo que no puede pasar es que se haga por
 * equivocación y nadie se entere hasta el día del partido.
 */

type CandidatoConAviso = Candidato & { advertencias: string[] };

export default function TransferirJugador({
  idEquipo,
  equipo,
  onCerrar,
  onTransferido,
}: {
  idEquipo: number;
  equipo: string;
  onCerrar: () => void;
  /** Se llama al terminar, para recargar la plantilla. */
  onTransferido: (mensaje: string) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [candidatos, setCandidatos] = useState<CandidatoConAviso[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [transfiriendo, setTransfiriendo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !transfiriendo) onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar, transfiriendo]);

  /* Se busca al dejar de teclear, no en cada letra: son casi dos mil jugadores activos
     y cada pulsación sería un viaje al servidor. Dos letras es el mínimo con el que la
     búsqueda deja de devolver medio club. */
  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) {
      setCandidatos([]);
      return;
    }
    let vivo = true;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ idEquipo: String(idEquipo), q });
        const res = await fetch(`/api/administracion-deportiva/transferir?${params}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!vivo) return;
        if (json.success) setCandidatos(json.data);
        else setError(json.message ?? "No se pudo buscar");
      } catch {
        if (vivo) setError("Error de conexión al buscar");
      } finally {
        if (vivo) setBuscando(false);
      }
    }, 400);
    return () => { vivo = false; clearTimeout(t); };
  }, [busqueda, idEquipo]);

  const transferir = async (c: CandidatoConAviso) => {
    const deDonde = c.equipoActual ? `de ${c.equipoActual}` : "que no tiene equipo";
    const aviso = c.advertencias.length > 0 ? `\n\nOJO:\n· ${c.advertencias.join("\n· ")}` : "";
    if (!confirm(`¿Traer a ${c.jugador} ${deDonde} a ${equipo}?${aviso}`)) return;

    setTransfiriendo(c.idJugador);
    setError(null);
    try {
      const res = await fetch("/api/administracion-deportiva/transferir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idEquipo, idJugador: c.idJugador }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? "No se pudo transferir");
        return;
      }
      onTransferido(
        `${json.jugador} pasó ${json.equipoAnterior ? `de ${json.equipoAnterior} ` : ""}a ${json.equipoNuevo}.`,
      );
    } catch {
      setError("Error de conexión al transferir");
    } finally {
      setTransfiriendo(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-start justify-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto">
      <div className="w-full max-w-2xl my-8 bg-[#0f172a] border border-white/15 rounded-3xl shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-white/10">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <ArrowRightLeft size={17} className="text-emerald-400" /> Traer jugador
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Pasa a un jugador de su equipo actual a <span className="font-bold text-slate-300">{equipo}</span>.
              Le cambia la categoría en su ficha.
            </p>
          </div>
          <button
            onClick={onCerrar}
            disabled={transfiriendo !== null}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm font-bold flex items-start gap-2">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}

          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o número de jugador..."
              className="w-full bg-slate-800/70 border border-slate-600 focus:border-blue-400 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white outline-none transition-colors placeholder-slate-600"
            />
          </div>

          {busqueda.trim().length < 2 ? (
            <p className="text-[11px] text-slate-500 py-6 text-center">
              Escribe al menos dos letras del nombre.
            </p>
          ) : buscando ? (
            <p className="text-[11px] text-slate-400 py-6 text-center flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Buscando...
            </p>
          ) : candidatos.length === 0 ? (
            <p className="text-[11px] text-slate-500 py-6 text-center">
              Nadie con ese nombre fuera de este equipo.
            </p>
          ) : (
            <ul className="space-y-1.5 max-h-[45vh] overflow-y-auto">
              {candidatos.map((c) => (
                <li
                  key={c.idJugador}
                  className={`rounded-xl border p-3 transition-colors ${
                    c.advertencias.length > 0
                      ? "bg-amber-500/[0.07] border-amber-500/30"
                      : "bg-white/5 border-white/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-100">{c.jugador}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {[
                          c.equipoActual ? `Hoy en ${c.equipoActual}` : "Sin equipo",
                          c.sedeActual,
                          c.anioNacimiento ? `Nació en ${c.anioNacimiento}` : null,
                        ].filter(Boolean).join(" · ")}
                      </p>
                      {c.advertencias.map((a) => (
                        <p key={a} className="text-[10px] font-bold text-amber-300 mt-1 flex items-start gap-1.5 leading-snug">
                          <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" /> {a}
                        </p>
                      ))}
                    </div>
                    <button
                      onClick={() => transferir(c)}
                      disabled={transfiriendo !== null}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-white/10 disabled:text-slate-500 text-white text-[11px] font-black transition-colors"
                    >
                      {transfiriendo === c.idJugador
                        ? <Loader2 size={12} className="animate-spin" />
                        : <ArrowRightLeft size={12} />}
                      Traer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
