"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X, Search, User, AlertCircle, Loader2, MapPin, FileDown, FileSpreadsheet,
  CheckCircle2, XCircle, GraduationCap, ChevronRight, AlertTriangle,
} from "lucide-react";
import PlayerPagosModal, { type PagosTarget, type InscripcionSospechosa } from "@/components/PlayerPagosModal";
import {
  type AdeudoRow, type AdeudosConfig, exportAdeudosToPdf, exportAdeudosToExcel,
  money, MESES_CORTOS, esBeca100, parseMeses, becaPct, becaLabel,
} from "@/lib/adeudos-export";

export type AdeudosFilter =
  | "activos" | "bajas" | "pendiente-inscripcion" | "pendiente-mensualidad"
  | "al-corriente" | "keepers" | "keepers-debe" | "keepers-corriente" | "futsal-corriente" | "becado-sin-inscripcion" | "posible-baja" | "debe" | "futsal-debe"
  | "futsal-sin-pagos" | "futsal-1-mes" | "futsal-2-meses" | "futsal-3-mas" | "debe-mes" | "todos";

export interface AdeudosModalConfig {
  title: string;
  subtitle?: string;
  filtro: AdeudosFilter;
  sedeId?: number;
  categoria?: string;
  /** Mes concreto para el corte `debe-mes` (desglose del adeudo). */
  mes?: number;
  /** 0 = solo sedes normales, 1 = solo clinics. Sin valor, ambas. */
  clinics?: 0 | 1;
  /** Segmento de plantilla: 'normal' (sin keepers/futsal/excluidos/venta pública),
   *  'keepers', 'futsal', 'clinicsfutsal', 'ventapublico' o 'excluido' (clinics). Solo aplica a los
   *  cortes de plantilla (activos/bajas). */
  grupo?: 'normal' | 'keepers' | 'futsal' | 'clinicsfutsal' | 'ventapublico' | 'excluido';
  /** Temporada a consultar; si se omite se usa la seleccionada en la página.
   *  Permite que los cortes de "temporada anterior" apunten a esa otra temporada. */
  temporadaId?: number;
  temporadaNombre?: string;
  /** Descartar posibles bajas: los excluye de todos los cortes de esta temporada. */
  descartarPB?: boolean;
  /** Regla de la temporada en curso: solo los inscritos generan adeudo (los no
   *  inscritos salen del "Con adeudo" y su monto queda en 0). */
  soloInscritos?: boolean;
}

const ACCENT: Record<AdeudosFilter, string> = {
  activos: "bg-emerald-500",
  bajas: "bg-rose-500",
  "pendiente-inscripcion": "bg-amber-500",
  "pendiente-mensualidad": "bg-orange-500",
  "al-corriente": "bg-teal-500",
  keepers: "bg-cyan-500",
  "keepers-debe": "bg-rose-500",
  "keepers-corriente": "bg-cyan-500",
  "futsal-corriente": "bg-fuchsia-500",
  "becado-sin-inscripcion": "bg-purple-500",
  "posible-baja": "bg-red-600",
  debe: "bg-rose-500",
  "futsal-debe": "bg-fuchsia-500",
  "futsal-sin-pagos": "bg-fuchsia-700",
  "futsal-1-mes": "bg-fuchsia-600",
  "futsal-2-meses": "bg-fuchsia-500",
  "futsal-3-mas": "bg-fuchsia-400",
  "debe-mes": "bg-orange-500",
  todos: "bg-blue-500",
};

export default function AdeudosModal({
  config,
  temporadaId,
  temporadaNombre,
  onClose,
  onDataChanged,
}: {
  config: AdeudosModalConfig | null;
  temporadaId: number | null;
  temporadaNombre?: string;
  onClose: () => void;
  onDataChanged?: () => void;
}) {
  const [players, setPlayers] = useState<AdeudoRow[]>([]);
  const [cfg, setCfg] = useState<AdeudosConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pagosTarget, setPagosTarget] = useState<PagosTarget | null>(null);
  const [sospechosa, setSospechosa] = useState<InscripcionSospechosa | null>(null);

  // Abre el detalle del jugador; si trae inscripción sospechosa la pasa al modal.
  const abrirDetalle = (p: AdeudoRow) => {
    setPagosTarget({ idJugador: p.IdJugador, jugador: p.Jugador });
    setSospechosa(
      p.PosibleInscTempAnterior === 1 && p.SospIdPago && cfg
        ? {
            idPago: Number(p.SospIdPago),
            fecha: String(p.SospFecha ?? ""),
            tempNombreActual: String(p.SospTempNombre ?? "otra temporada"),
            temporadaDestinoId: cfg.seasonId,
            temporadaDestinoNombre: cfg.temporadaNombre,
          }
        : null
    );
  };
  const [recarga, setRecarga] = useState(0);
  // Grupo de beca desplegado (por porcentaje). null = todos colapsados.
  const [grupoAbierto, setGrupoAbierto] = useState<number | null>(null);

  useEffect(() => { setQuery(""); setGrupoAbierto(null); }, [config]);

  // Temporada efectiva: la del corte si la trae, si no la seleccionada en la página.
  const temporadaEfectiva = config?.temporadaId ?? temporadaId;
  const nombreEfectivo = config?.temporadaNombre ?? temporadaNombre;

  useEffect(() => {
    if (!config) return;
    let alive = true;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({ filtro: config.filtro });
    if (config.sedeId !== undefined) params.set("sedeId", String(config.sedeId));
    if (config.categoria) params.set("categoria", config.categoria);
    if (config.mes !== undefined) params.set("mes", String(config.mes));
    if (config.clinics !== undefined) params.set("clinics", String(config.clinics));
    if (config.grupo) params.set("grupo", config.grupo);
    if (config.descartarPB) params.set("descartarPB", "1");
    if (config.soloInscritos) params.set("soloInscritos", "1");
    if (temporadaEfectiva) params.set("temporadaId", String(temporadaEfectiva));

    (async () => {
      try {
        const res = await fetch(`/api/adeudos/players?${params}`, { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        if (json.success) {
          setPlayers(json.data);
          setCfg(json.config);
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
  }, [config, temporadaEfectiva, recarga]);

  useEffect(() => {
    if (!config || pagosTarget) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [config, pagosTarget, onClose]);

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

  const totalAdeudo = useMemo(
    () => filtered.reduce((s, p) => s + (Number(p.Adeudo) || 0), 0),
    [filtered]
  );

  /* Agrupado por beca: primero "Sin beca" y luego cada porcentaje distinto,
     ascendente, con el total de adeudo de cada grupo. */
  const grupos = useMemo(() => {
    const map = new Map<number, AdeudoRow[]>();
    for (const p of filtered) {
      const pct = becaPct(p.Beca);
      const arr = map.get(pct);
      if (arr) arr.push(p);
      else map.set(pct, [p]);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([pct, jugadores]) => ({
        pct,
        label: becaLabel(pct),
        jugadores,
        total: jugadores.reduce((s, p) => s + (Number(p.Adeudo) || 0), 0),
      }));
  }, [filtered]);

  // Las exportaciones siguen el mismo orden agrupado que se ve en pantalla.
  const ordenados = useMemo(() => grupos.flatMap((g) => g.jugadores), [grupos]);

  if (!config) return null;

  const showSede = config.sedeId === undefined;
  const exportSubtitle = config.subtitle ?? nombreEfectivo ?? "";
  const canExport = !isLoading && !error && filtered.length > 0 && cfg !== null;
  const meses: number[] = cfg
    ? Array.from({ length: cfg.endMonth - cfg.startMonth + 1 }, (_, i) => cfg.startMonth + i)
    : [];
  const expBtn = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <>
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[150] p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0f172a] border border-white/15 rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-white/10 bg-white/5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${ACCENT[config.filtro]}`} />
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
              onClick={() => cfg && exportAdeudosToPdf(ordenados, cfg, config.title, exportSubtitle)}
              disabled={!canExport}
              className={`${expBtn} bg-blue-600/15 hover:bg-blue-600/25 border-blue-500/30 text-blue-200`}
            >
              <FileDown size={13} /> PDF
            </button>
            <button
              onClick={() => cfg && exportAdeudosToExcel(ordenados, cfg, config.title, exportSubtitle)}
              disabled={!canExport}
              className={`${expBtn} bg-emerald-600/15 hover:bg-emerald-600/25 border-emerald-500/30 text-emerald-200`}
            >
              <FileSpreadsheet size={13} /> Excel
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
            <div className="space-y-3">
              {grupos.map((g) => {
                /* Con búsqueda activa se despliegan todos para no ocultar coincidencias;
                   si solo hay un grupo tampoco tiene sentido dejarlo colapsado. */
                const abierto =
                  query.trim() !== "" || grupos.length === 1 || grupoAbierto === g.pct;
                const tono =
                  g.pct === 0
                    ? { bg: "bg-slate-800/90 hover:bg-slate-700/90", border: "border-white/15", icon: "text-slate-400", text: "text-slate-100" }
                    : g.pct >= 100
                      ? { bg: "bg-purple-950/90 hover:bg-purple-900/90", border: "border-purple-500/30", icon: "text-purple-300", text: "text-purple-200" }
                      : { bg: "bg-amber-950/90 hover:bg-amber-900/90", border: "border-amber-500/30", icon: "text-amber-300", text: "text-amber-200" };

                return (
                <div key={g.pct}>
                  {/* Tarjeta del grupo: al hacer clic despliega sus jugadores.
                      Queda fija (sticky) para seguir visible al bajar la lista. */}
                  <button
                    type="button"
                    onClick={() => setGrupoAbierto(grupoAbierto === g.pct ? null : g.pct)}
                    title={abierto ? "Ocultar jugadores de este grupo" : "Ver jugadores de este grupo"}
                    className={`sticky top-0 z-20 w-full px-3.5 py-3 rounded-xl border backdrop-blur-md flex items-center justify-between gap-3 transition-colors text-left ${tono.bg} ${tono.border}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ChevronRight
                        size={16}
                        className={`${tono.icon} flex-shrink-0 transition-transform ${abierto ? "rotate-90" : ""}`}
                      />
                      <GraduationCap size={16} className={`${tono.icon} flex-shrink-0`} />
                      <span className={`text-sm font-black uppercase tracking-wide ${tono.text}`}>
                        {g.label}
                      </span>
                      <span className="text-[11px] font-black text-slate-200 bg-black/40 px-2 py-0.5 rounded-md whitespace-nowrap">
                        {g.jugadores.length} {g.jugadores.length === 1 ? "jugador" : "jugadores"}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5 flex-shrink-0">
                      <span className="text-[8px] uppercase font-black text-slate-400 tracking-wider">Total</span>
                      {g.pct >= 100 ? (
                        <span className="text-[11px] font-black text-purple-300">Sin adeudo</span>
                      ) : (
                        <span className={`text-base font-black ${g.total > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                          {money(g.total)}
                        </span>
                      )}
                    </div>
                  </button>

                  {abierto && (
                  <div className="mt-2 bg-white/5 border border-white/10 rounded-2xl divide-y divide-white/5 overflow-hidden">
                    {g.jugadores.map((p) => {
                      // El servidor ya resuelve la beca total; esBeca100 queda de respaldo.
                      const beca100 = p.BecaTotal !== undefined ? !!p.BecaTotal : esBeca100(p.Beca);
                      const pagados = parseMeses(p.MesesPagados);
                      return (
                <button
                  key={p.IdJugador}
                  type="button"
                  onClick={() => abrirDetalle(p)}
                  title="Ver pagos del jugador"
                  className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-white/[0.08] transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-200 truncate">{p.Jugador}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">ID {p.IdJugador}</span>
                      {p.Categoria && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/25">
                          {p.Categoria}
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
                      {p.Status !== 0 && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/25">BAJA</span>
                      )}
                      {p.EsPromoInscripcion === 1 && (
                        <span
                          title="Pagó la inscripción de la temporada siguiente en el último mes de esta: la inscripción de esta temporada queda cubierta por la promoción"
                          className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                        >
                          PROMOCIÓN INSCRIPCIÓN
                        </span>
                      )}
                      {p.PosibleInscTempAnterior === 1 && (
                        <span
                          title="Tiene una inscripción de la temporada anterior pagada cerca del inicio de esta; podría ser la de esta temporada"
                          className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 inline-flex items-center gap-1"
                        >
                          <AlertTriangle size={9} /> posible insc. ya pagada
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Inscripción */}
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[7px] uppercase font-black text-slate-500 tracking-wider">Inscrip.</span>
                      {p.EsFutsal ? (
                        <span className="text-[9px] font-black text-slate-500">N/A</span>
                      ) : p.InscripcionPagada || beca100 ? (
                        <CheckCircle2 size={16} className="text-emerald-500" />
                      ) : (
                        <XCircle size={16} className="text-rose-500" />
                      )}
                    </div>

                    {/* Cuadritos de meses */}
                    {meses.length > 0 && (
                      <div className="hidden sm:flex flex-col items-start gap-0.5">
                        <span className="text-[7px] uppercase font-black text-slate-500 tracking-wider">Mensualidades</span>
                        <div className="flex gap-0.5">
                          {meses.map((mm) => {
                            const pagado = beca100 || pagados.includes(mm);
                            const futuro = cfg !== null && mm > cfg.hastaMonth;
                            return (
                              <div
                                key={mm}
                                title={`${MESES_CORTOS[mm - 1]} — ${pagado ? "pagado" : futuro ? "por vencer" : "pendiente"}`}
                                className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold border ${
                                  pagado
                                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                    : futuro
                                      ? "bg-slate-500/5 text-slate-500 border-transparent"
                                      : p.EsFutsal
                                        ? "bg-slate-500/10 text-slate-400 border-white/5"
                                        : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                }`}
                              >
                                {MESES_CORTOS[mm - 1].charAt(0)}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Adeudo / Meses pagados para futsal */}
                    <div className="flex flex-col items-end gap-0.5 min-w-[74px]">
                      <span className="text-[7px] uppercase font-black text-slate-500 tracking-wider">
                        {p.EsFutsal ? "Pagos" : "Adeudo"}
                      </span>
                      {p.EsFutsal ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30">
                          {p.PagosCount === 0 ? "Sin pagos" : `${p.PagosCount} ${p.PagosCount === 1 ? "mes" : "meses"}`}
                        </span>
                      ) : beca100 ? (
                        <span
                          title="Beca 100%: no genera adeudo"
                          className="text-[9px] font-black px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30"
                        >
                          BECADO
                        </span>
                      ) : (
                        <span className={`text-sm font-black ${p.Adeudo > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                          {money(Number(p.Adeudo))}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                      );
                    })}
                  </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer con total de adeudo */}
        <div className="p-4 px-5 bg-white/5 border-t border-white/10 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            {isLoading ? "—" : `${filtered.length}${filtered.length !== players.length ? ` de ${players.length}` : ""} jugador(es)`}
          </p>
          <div className="text-right">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total adeudo</p>
            <p className="text-xl font-black text-rose-400">{money(totalAdeudo)}</p>
          </div>
        </div>
      </div>
    </div>

    <PlayerPagosModal
      target={pagosTarget}
      temporadaId={temporadaEfectiva}
      temporadaNombre={nombreEfectivo}
      inscripcionSospechosa={sospechosa}
      onClose={() => { setPagosTarget(null); setSospechosa(null); }}
      onDataChanged={() => { setRecarga((r) => r + 1); onDataChanged?.(); }}
    />
    </>
  );
}
