"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle, X, Users, CalendarCheck, MapPin, Cake, UserRoundPlus, Check } from "lucide-react";
import type { PlayerRow } from "@/lib/inscripciones-export";

/**
 * Los jugadores de una categoría, desplegados dentro de la propia tabla de formatos.
 *
 * Se abre desde la procedencia o desde el grupo destino de un renglón, y los dos se
 * pueden tener abiertos a la vez: la pregunta al autorizar es cómo quedan LOS DOS
 * grupos, no solo uno.
 *
 * Lo que lista son los INSCRITOS en la temporada elegida arriba: cuántos hay ya en ese
 * grupo este ciclo, no cuántos han pasado por él. Hay categorías que no manejan
 * inscripción —las de clinics— y grupos que apenas arrancan: ahí la lista sale vacía y
 * no por error, así que el vacío ofrece ver a los activos, que es el otro corte posible.
 *
 * En el grupo destino se suma el jugador del formato: el grupo se ve como va a quedar,
 * que es lo que hay que juzgar antes de autorizar. Cómo se le marca depende de si el
 * cambio ya se aplicó en la plantilla, que lo sabe el formato (su categoría de hoy), y
 * no de si aparece en esta lista: un jugador ya incorporado pero sin inscripción del
 * ciclo no sale en la consulta, y darlo por pendiente sería mentir. Cuente lo que
 * cuente, nunca se cuenta dos veces.
 */

type Modo = "inscritos" | "activos";

export interface JugadorPendiente {
  idJugador: number;
  jugador: string;
  sede: string | null;
}

export default function JugadoresDeCategoria({
  categoria, contexto, temporadaId, temporadaNombre, porIncorporar, yaAplicado, onCerrar,
}: {
  categoria: string;
  /** De dónde se abrió: "Procedencia" o "Grupo a incorporar". */
  contexto: string;
  temporadaId: number | null;
  temporadaNombre?: string | null;
  /** Jugador del formato que entra a este grupo. Solo en el grupo destino. */
  porIncorporar?: JugadorPendiente | null;
  /** ¿El cambio ya se aplicó en la plantilla? Lo decide el formato, no esta lista. */
  yaAplicado?: boolean;
  onCerrar: () => void;
}) {
  const [modo, setModo] = useState<Modo>("inscritos");
  const [jugadores, setJugadores] = useState<PlayerRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cambiar de categoría (otro renglón) vuelve a arrancar en los inscritos.
  useEffect(() => { setModo("inscritos"); }, [categoria]);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);

    const params = new URLSearchParams({ filtro: modo, categoria });
    if (temporadaId) params.set("temporadaId", String(temporadaId));

    (async () => {
      try {
        const res = await fetch(`/api/inscripciones/players?${params}`, { cache: "no-store" });
        const json = await res.json();
        if (!vivo) return;
        if (json.success) setJugadores(json.data);
        else setError(json.message ?? "Error al cargar los jugadores");
      } catch {
        if (vivo) setError("Error de conexión");
      } finally {
        if (vivo) setCargando(false);
      }
    })();

    return () => { vivo = false; };
  }, [categoria, temporadaId, modo]);

  const ciclo = temporadaNombre ? `ciclo ${temporadaNombre}` : "la temporada";
  /* Si el jugador ya viene en la consulta solo se le marca ahí; si no, se agrega al
     final. Lo segundo pasa en dos situaciones distintas: que todavía no se le haya
     movido de grupo, o que ya se le movió pero no tiene inscripción de este ciclo. */
  const yaEnLaLista = Boolean(porIncorporar && jugadores.some((j) => j.IdJugador === porIncorporar.idJugador));
  const aparte = porIncorporar && !yaEnLaLista ? porIncorporar : null;

  const cuenta = cargando
    ? "Cargando..."
    : [
        modo === "inscritos"
          ? `${jugadores.length} inscrito(s) en el ${ciclo}`
          : `${jugadores.length} activo(s), sin filtrar por inscripción`,
        aparte ? (yaAplicado ? "+1 ya incorporado, sin inscripción" : "+1 por incorporar") : null,
      ].filter(Boolean).join(" · ");

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="min-w-0">
          <p className="text-xs font-black text-white flex items-center gap-2">
            <Users size={13} className="text-blue-400" />
            Categoría {categoria}
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{contexto}</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">{cuenta}</p>
        </div>
        <button
          onClick={onCerrar}
          title="Cerrar el listado"
          className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <X size={15} />
        </button>
      </div>

      {cargando ? (
        <div className="flex items-center gap-2 py-6 text-slate-400">
          <Loader2 size={16} className="animate-spin text-blue-500" />
          <span className="text-xs font-bold">Cargando jugadores...</span>
        </div>
      ) : error ? (
        <p className="flex items-start gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
        </p>
      ) : (
        <>
          {(jugadores.length > 0 || aparte) && (
            <ul className="max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-white/[0.02] divide-y divide-white/5">
              {jugadores.map((j) => {
                const esElDelFormato = porIncorporar?.idJugador === j.IdJugador;
                return (
                  <li
                    key={j.IdJugador}
                    className={`flex items-center justify-between gap-3 px-3 py-2 ${
                      esElDelFormato ? "bg-emerald-500/10" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-200 truncate">{j.Jugador}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                          ID {j.IdJugador}
                        </span>
                        {j.SedeNombre && (
                          <span className="text-[10px] text-slate-500 flex items-center gap-1">
                            <MapPin size={9} /> {j.SedeNombre}
                          </span>
                        )}
                        {j.FechaNacimiento && (
                          <span className="text-[10px] text-slate-500 flex items-center gap-1" title="Fecha de nacimiento">
                            <Cake size={9} /> {j.FechaNacimiento}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {esElDelFormato && (
                        <span
                          title="Es el jugador de este formato: el cambio ya está aplicado en la plantilla"
                          className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1"
                        >
                          <Check size={9} /> YA INCORPORADO
                        </span>
                      )}
                      {j.Beca && String(j.Beca) !== "0" && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30">
                          BECA {j.Beca}
                        </span>
                      )}
                      {j.FechaInscripcion ? (
                        <span
                          title="Fecha del pago de inscripción"
                          className="text-[10px] text-emerald-300 flex items-center gap-1"
                        >
                          <CalendarCheck size={10} /> {j.FechaInscripcion}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-600">Sin inscripción</span>
                      )}
                    </div>
                  </li>
                );
              })}

              {/* El jugador del formato, que no venía en la consulta: así se ve el grupo
                  como queda, y con la marca que de verdad le toca. */}
              {aparte && (
                <li className={`flex items-center justify-between gap-3 px-3 py-2 ${
                  yaAplicado ? "bg-emerald-500/10" : "bg-blue-500/10"
                }`}>
                  <div className="min-w-0">
                    <p className={`text-xs font-bold truncate ${yaAplicado ? "text-emerald-100" : "text-blue-100"}`}>
                      {aparte.jugador}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                        ID {aparte.idJugador}
                      </span>
                      {aparte.sede && (
                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                          <MapPin size={9} /> {aparte.sede}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500">Sin inscripción</span>
                    </div>
                  </div>
                  {yaAplicado ? (
                    <span
                      title="El jugador ya está en este grupo, pero no tiene inscripción capturada en el ciclo, así que no sale en la lista de inscritos."
                      className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 flex-shrink-0"
                    >
                      <Check size={9} /> YA INCORPORADO
                    </span>
                  ) : (
                    <span
                      title="Es el jugador de este formato. Todavía no está en el grupo: el cambio se aplica en el sistema de escritorio."
                      className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-blue-500/25 text-blue-200 border border-blue-400/50 flex items-center gap-1 flex-shrink-0"
                    >
                      <UserRoundPlus size={9} /> POR INCORPORAR
                    </span>
                  )}
                </li>
              )}
            </ul>
          )}

          {jugadores.length === 0 && (
            <div className={`rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-3 py-3 text-center ${aparte ? "mt-2" : ""}`}>
              <p className="text-[11px] font-bold text-slate-300">
                {modo === "inscritos"
                  ? `Ningún jugador de ${categoria} tiene inscripción capturada en el ${ciclo}`
                  : `La categoría ${categoria} no tiene jugadores activos`}
              </p>
              {modo === "inscritos" && (
                <>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Pasa en las categorías de clinics, que no manejan inscripción, y en los
                    grupos que apenas arrancan el ciclo.
                  </p>
                  <button
                    onClick={() => setModo("activos")}
                    className="mt-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/15 text-[11px] font-bold text-slate-200 hover:bg-white/10 transition-colors"
                  >
                    Ver a los activos de la categoría
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
