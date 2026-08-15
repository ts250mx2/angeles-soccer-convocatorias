"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  X, Search, User, ChevronRight, AlertCircle, Loader2, MapPin,
  FileDown, FileSpreadsheet, CalendarCheck, CheckCircle2, XCircle, AlertTriangle, ListTree,
} from "lucide-react";
import PlayerPagosModal, { type PagosTarget } from "@/components/PlayerPagosModal";
import {
  type PlayerRow, type PlayersConfig, exportPlayersToPdf, exportPlayersToExcel,
  exportMovimientosToExcel,
  fecha, MESES_CORTOS, esBeca100, parseMesesPagados, MESES_ANTICIPO_SOSPECHOSO,
} from "@/lib/inscripciones-export";

export type PlayersFilter = "activos" | "inscritos" | "becados" | "bajas" | "sin-inscripcion" | "fuera-de-lugar" | "todos";

export interface PlayersModalConfig {
  title: string;
  subtitle?: string;
  filtro: PlayersFilter;
  sedeId?: number;
  /** Acota a una sola categoría (drill-down desde la vista de categorías). */
  categoria?: string;
  /** 0 = solo sedes normales, 1 = solo clinics. Sin valor, ambas. */
  clinics?: 0 | 1;
  /** Segmento de plantilla/inscritos: 'normal', 'keepers', 'futsal', 'clinicsfutsal' o 'ventapublico'. */
  grupo?: 'normal' | 'keepers' | 'futsal' | 'clinicsfutsal' | 'ventapublico';
  /** Corte de inscritos por primera inscripción: 'nueva' (primera) o 'reinscripcion'. */
  tipoInscripcion?: 'nueva' | 'reinscripcion';
  /** Ruta al drill-down por categorías; si viene, se muestra la liga "Por Categoría" */
  categoriaHref?: string;
}

const ACCENT: Record<PlayersFilter, { dot: string; text: string; chip: string }> = {
  activos: { dot: "bg-sky-500", text: "text-sky-400", chip: "bg-sky-500/10 border-sky-500/20 text-sky-300" },
  inscritos: { dot: "bg-emerald-500", text: "text-emerald-400", chip: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" },
  becados: { dot: "bg-purple-500", text: "text-purple-400", chip: "bg-purple-500/10 border-purple-500/20 text-purple-300" },
  bajas: { dot: "bg-rose-500", text: "text-rose-400", chip: "bg-rose-500/10 border-rose-500/20 text-rose-300" },
  "sin-inscripcion": { dot: "bg-amber-500", text: "text-amber-400", chip: "bg-amber-500/10 border-amber-500/20 text-amber-300" },
  // Error de captura, no un corte de negocio: por eso va en rojo, como una alerta.
  "fuera-de-lugar": { dot: "bg-red-500", text: "text-red-400", chip: "bg-red-500/10 border-red-500/25 text-red-300" },
  todos: { dot: "bg-blue-500", text: "text-blue-400", chip: "bg-blue-500/10 border-blue-500/20 text-blue-300" },
};

export default function PlayersModal({
  config,
  temporadaId,
  temporadaNombre,
  onClose,
  onDataChanged,
}: {
  config: PlayersModalConfig | null;
  temporadaId: number | null;
  temporadaNombre?: string;
  onClose: () => void;
  /** Se llama cuando un pago cambió, para refrescar también las tarjetas/KPIs de la página. */
  onDataChanged?: () => void;
}) {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [config_, setConfig] = useState<PlayersConfig | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pagosTarget, setPagosTarget] = useState<PagosTarget | null>(null);
  const [descargandoMov, setDescargandoMov] = useState(false);
  // Se incrementa cuando el modal de pagos modifica un pago, para refrescar la lista.
  const [recarga, setRecarga] = useState(0);

  // El buscador se limpia solo al abrir/cambiar el corte, no en cada recarga.
  useEffect(() => { setQuery(""); }, [config]);

  useEffect(() => {
    if (!config) return;
    let alive = true;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({ filtro: config.filtro });
    if (config.sedeId !== undefined) params.set("sedeId", String(config.sedeId));
    if (config.categoria) params.set("categoria", config.categoria);
    if (config.clinics !== undefined) params.set("clinics", String(config.clinics));
    if (config.grupo) params.set("grupo", config.grupo);
    if (config.tipoInscripcion) params.set("tipoInscripcion", config.tipoInscripcion);
    if (temporadaId) params.set("temporadaId", String(temporadaId));

    (async () => {
      try {
        const res = await fetch(`/api/inscripciones/players?${params}`, { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        if (json.success) {
          setPlayers(json.data);
          setConfig(json.config);
        } else {
          setError(json.message ?? "Error al cargar jugadores");
        }
      } catch {
        if (alive) setError("Error de conexión");
      } finally {
        if (alive) setIsLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [config, temporadaId, recarga]);

  // Cerrar con Escape (si el modal de pagos está encima, ese se cierra primero)
  useEffect(() => {
    if (!config || pagosTarget) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [config, pagosTarget, onClose]);

  /* Trae los movimientos de los jugadores que están en pantalla (respeta el buscador)
     y arma el Excel. Los ids van por POST porque pueden ser cientos. */
  const descargarMovimientos = async (lista: PlayerRow[], title: string, subtitle: string) => {
    if (lista.length === 0) return;
    setDescargandoMov(true);
    try {
      const res = await fetch("/api/inscripciones/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idJugadores: lista.map((p) => p.IdJugador),
          temporadaId: temporadaId ?? undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? "No se pudieron obtener los movimientos");
        return;
      }
      await exportMovimientosToExcel(json.data, lista, title, subtitle);
    } catch {
      setError("Error de conexión al obtener los movimientos");
    } finally {
      setDescargandoMov(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter(
      (p) =>
        p.Jugador?.toLowerCase().includes(q) ||
        p.Categoria?.toLowerCase().includes(q) ||
        p.SedeNombre?.toLowerCase().includes(q)
    );
  }, [players, query]);

  if (!config) return null;

  const accent = ACCENT[config.filtro];
  const showSede = config.sedeId === undefined;
  const exportSubtitle = config.subtitle ?? temporadaNombre ?? "";
  const canExport = !isLoading && !error && filtered.length > 0;
  const expBtn = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <>
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[150] p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0f172a] border border-white/15 rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-white/10 bg-white/5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${accent.dot}`} />
                {config.title}
              </h3>
              {config.subtitle && <p className="text-xs text-slate-400 mt-0.5">{config.subtitle}</p>}
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all flex-shrink-0">
              <X size={20} />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={() => exportPlayersToPdf(filtered, config.title, exportSubtitle, config_)}
              disabled={!canExport}
              className={`${expBtn} bg-blue-600/15 hover:bg-blue-600/25 border-blue-500/30 text-blue-200`}
            >
              <FileDown size={13} /> PDF
            </button>
            <button
              onClick={() => exportPlayersToExcel(filtered, config.title, exportSubtitle, config_)}
              disabled={!canExport}
              className={`${expBtn} bg-emerald-600/15 hover:bg-emerald-600/25 border-emerald-500/30 text-emerald-200`}
            >
              <FileSpreadsheet size={13} /> Excel
            </button>
            <button
              onClick={() => descargarMovimientos(filtered, config.title, exportSubtitle)}
              disabled={!canExport || descargandoMov}
              title="Excel con el detalle de pagos de cada jugador del listado"
              className={`${expBtn} bg-violet-600/15 hover:bg-violet-600/25 border-violet-500/30 text-violet-200`}
            >
              {descargandoMov ? <Loader2 size={13} className="animate-spin" /> : <ListTree size={13} />}
              Excel de Movimientos
            </button>
          </div>
        </div>

        {/* Buscador */}
        {!isLoading && !error && players.length > 0 && (
          <div className="px-5 pt-4">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar jugador, categoría o sede..."
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all placeholder:text-slate-500"
              />
            </div>
          </div>
        )}

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="h-48 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 size={28} className="animate-spin text-blue-500" />
              <p className="text-sm font-bold">Cargando jugadores...</p>
            </div>
          ) : error ? (
            <div className="h-48 flex flex-col items-center justify-center gap-3 text-rose-400">
              <AlertCircle size={36} className="opacity-60" />
              <p className="text-sm font-black">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center gap-3 text-slate-500">
              <User size={40} className="opacity-20" />
              <p className="text-base font-black">Sin jugadores</p>
              {query && <p className="text-xs opacity-60">No hay coincidencias para &quot;{query}&quot;</p>}
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-2xl divide-y divide-white/5 overflow-hidden">
              {filtered.map((p) => (
                <button
                  key={p.IdJugador}
                  type="button"
                  onClick={() => setPagosTarget({ idJugador: p.IdJugador, jugador: p.Jugador })}
                  title="Ver pagos del jugador"
                  className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-white/[0.08] transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-200 truncate">{p.Jugador}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        ID {p.IdJugador}
                      </span>
                      {p.FechaInscripcion && (
                        <span className="text-[10px] text-slate-500 flex items-center gap-1" title="Fecha de inscripción">
                          <CalendarCheck size={9} /> {fecha(p.FechaInscripcion)}
                        </span>
                      )}
                      {showSede && p.SedeNombre && (
                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                          <MapPin size={9} /> {p.SedeNombre}
                        </span>
                      )}
                      {p.Beca && String(p.Beca) !== "0" && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/25">
                          BECA {p.Beca}
                        </span>
                      )}
                      {config.filtro === "todos" && (
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border ${
                          p.Status === 0
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                            : "bg-rose-500/15 text-rose-400 border-rose-500/25"
                        }`}>
                          {p.Status === 0 ? "ACTIVO" : "BAJA"}
                        </span>
                      )}
                      {/* Mensualidades cobradas mucho antes del arranque: probable
                          año mal capturado. Se corrige en el modal de pagos. */}
                      {p.PagosAnticipados > 0 && (
                        <span
                          title={`${p.PagosAnticipados} ${p.PagosAnticipados === 1 ? "pago cobrado" : "pagos cobrados"} ${MESES_ANTICIPO_SOSPECHOSO}+ meses antes de que iniciara la temporada. Abre el detalle para corregir el año.`}
                          className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1"
                        >
                          <AlertTriangle size={9} />
                          {p.PagosAnticipados === 1 ? "PAGO ANTICIPADO" : `${p.PagosAnticipados} PAGOS ANTICIPADOS`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {(config_?.meses.length ?? 0) > 0 && (
                      <>
                        {/* Inscripción y mensualidades, igual que en adeudos */}
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[7px] uppercase font-black text-slate-500 tracking-wider">Inscrip.</span>
                          {p.InscripcionPagada || esBeca100(p.Beca) ? (
                            <CheckCircle2 size={16} className="text-emerald-500" />
                          ) : (
                            <XCircle size={16} className="text-rose-500" />
                          )}
                        </div>
                        <div className="hidden sm:flex flex-col items-start gap-0.5">
                          <span className="text-[7px] uppercase font-black text-slate-500 tracking-wider">Mensualidades</span>
                          <div className="flex gap-0.5">
                            {config_!.meses.map((m) => {
                              const pagado = esBeca100(p.Beca) || parseMesesPagados(p.MesesPagados).includes(m.codigo);
                              const futuro = config_!.mesActual !== null && m.codigo > config_!.mesActual;
                              const actual = m.codigo === config_!.mesActual;
                              return (
                                <div
                                  key={m.codigo}
                                  title={`${MESES_CORTOS[m.mes - 1]} ${m.anio} — ${pagado ? "pagado" : futuro ? "por vencer" : "pendiente"}`}
                                  className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold border ${
                                    pagado
                                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                      : futuro
                                        ? "bg-slate-500/5 text-slate-500 border-transparent"
                                        : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                  } ${actual ? "ring-1 ring-blue-500" : ""}`}
                                >
                                  {MESES_CORTOS[m.mes - 1].charAt(0)}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${accent.chip}`}>
                      {p.Categoria || "SIN CATEGORÍA"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 px-5 bg-white/5 border-t border-white/10 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            {isLoading ? "—" : `${filtered.length}${filtered.length !== players.length ? ` de ${players.length}` : ""} jugador(es)`}
          </p>
          {config.categoriaHref && (
            <Link
              href={config.categoriaHref}
              onClick={onClose}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black transition-all"
            >
              Por Categoría <ChevronRight size={14} />
            </Link>
          )}
        </div>
      </div>
    </div>

    {/* Va fuera del overlay anterior para que su clic-fuera no cierre también la lista */}
    <PlayerPagosModal
      target={pagosTarget}
      temporadaId={temporadaId}
      temporadaNombre={temporadaNombre}
      onClose={() => setPagosTarget(null)}
      onDataChanged={() => { setRecarga((r) => r + 1); onDataChanged?.(); }}
    />
    </>
  );
}
