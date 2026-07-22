"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X, Search, User, AlertCircle, Loader2, MapPin, FileDown, FileSpreadsheet,
  CheckCircle2, XCircle,
} from "lucide-react";
import PlayerPagosModal, { type PagosTarget } from "@/components/PlayerPagosModal";
import {
  type AdeudoRow, type AdeudosConfig, exportAdeudosToPdf, exportAdeudosToExcel,
  money, MESES_CORTOS, esBeca100, parseMeses,
} from "@/lib/adeudos-export";

export type AdeudosFilter =
  | "activos" | "bajas" | "pendiente-inscripcion" | "pendiente-mensualidad" | "al-corriente" | "debe" | "todos";

export interface AdeudosModalConfig {
  title: string;
  subtitle?: string;
  filtro: AdeudosFilter;
  sedeId?: number;
  categoria?: string;
}

const ACCENT: Record<AdeudosFilter, string> = {
  activos: "bg-emerald-500",
  bajas: "bg-rose-500",
  "pendiente-inscripcion": "bg-amber-500",
  "pendiente-mensualidad": "bg-orange-500",
  "al-corriente": "bg-teal-500",
  debe: "bg-rose-500",
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
  const [recarga, setRecarga] = useState(0);

  useEffect(() => { setQuery(""); }, [config]);

  useEffect(() => {
    if (!config) return;
    let alive = true;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({ filtro: config.filtro });
    if (config.sedeId !== undefined) params.set("sedeId", String(config.sedeId));
    if (config.categoria) params.set("categoria", config.categoria);
    if (temporadaId) params.set("temporadaId", String(temporadaId));

    (async () => {
      try {
        const res = await fetch(`/api/adeudos/players?${params}`);
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
  }, [config, temporadaId, recarga]);

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

  if (!config) return null;

  const showSede = config.sedeId === undefined;
  const exportSubtitle = config.subtitle ?? temporadaNombre ?? "";
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
              onClick={() => cfg && exportAdeudosToPdf(filtered, cfg, config.title, exportSubtitle)}
              disabled={!canExport}
              className={`${expBtn} bg-blue-600/15 hover:bg-blue-600/25 border-blue-500/30 text-blue-200`}
            >
              <FileDown size={13} /> PDF
            </button>
            <button
              onClick={() => cfg && exportAdeudosToExcel(filtered, cfg, config.title, exportSubtitle)}
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
            <div className="bg-white/5 border border-white/10 rounded-2xl divide-y divide-white/5 overflow-hidden">
              {filtered.map((p) => {
                const beca100 = esBeca100(p.Beca);
                const pagados = parseMeses(p.MesesPagados);
                return (
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
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">ID {p.IdJugador}</span>
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
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Inscripción */}
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[7px] uppercase font-black text-slate-500 tracking-wider">Inscrip.</span>
                      {p.InscripcionPagada || beca100 ? (
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

                    {/* Adeudo */}
                    <div className="flex flex-col items-end gap-0.5 min-w-[74px]">
                      <span className="text-[7px] uppercase font-black text-slate-500 tracking-wider">Adeudo</span>
                      <span className={`text-sm font-black ${p.Adeudo > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                        {money(Number(p.Adeudo))}
                      </span>
                    </div>
                  </div>
                </button>
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
      temporadaId={temporadaId}
      temporadaNombre={temporadaNombre}
      onClose={() => setPagosTarget(null)}
      onDataChanged={() => { setRecarga((r) => r + 1); onDataChanged?.(); }}
    />
    </>
  );
}
