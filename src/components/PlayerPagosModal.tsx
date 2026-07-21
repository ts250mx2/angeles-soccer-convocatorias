"use client";

import { useEffect, useState } from "react";
import {
  X, Loader2, AlertCircle, Receipt, FileDown, FileSpreadsheet, CalendarCheck,
} from "lucide-react";
import {
  type PagoRow, exportPagosToPdf, exportPagosToExcel, money, fecha, mesLabel,
} from "@/lib/inscripciones-export";

interface JugadorInfo {
  IdJugador: number;
  Jugador: string;
  Categoria: string;
  Status: number;
  Beca: string | null;
  SedeNombre: string;
}

export interface PagosTarget {
  idJugador: number;
  jugador: string;
}

export default function PlayerPagosModal({
  target,
  temporadaId,
  temporadaNombre,
  onClose,
}: {
  target: PagosTarget | null;
  temporadaId: number | null;
  temporadaNombre?: string;
  onClose: () => void;
}) {
  const [jugador, setJugador] = useState<JugadorInfo | null>(null);
  const [pagos, setPagos] = useState<PagoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [fechaInscripcion, setFechaInscripcion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Por defecto se muestra la temporada en curso; el histórico completo es opcional.
  const [soloTemporada, setSoloTemporada] = useState(true);

  useEffect(() => {
    if (target) setSoloTemporada(true);
  }, [target]);

  useEffect(() => {
    if (!target) return;
    let alive = true;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({ idJugador: String(target.idJugador) });
    if (soloTemporada && temporadaId) params.set("temporadaId", String(temporadaId));

    (async () => {
      try {
        const res = await fetch(`/api/inscripciones/pagos?${params}`);
        const json = await res.json();
        if (!alive) return;
        if (json.success) {
          setJugador(json.data.jugador);
          setPagos(json.data.pagos);
          setTotal(Number(json.data.total ?? 0));
          setFechaInscripcion(json.data.fechaInscripcion ?? null);
        } else {
          setError(json.message ?? "Error al cargar los pagos");
        }
      } catch {
        if (alive) setError("Error de conexión");
      } finally {
        if (alive) setIsLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [target, temporadaId, soloTemporada]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  if (!target) return null;

  const scopeLabel = soloTemporada && temporadaNombre ? temporadaNombre : "Histórico completo";
  const subtitle = [jugador?.SedeNombre, jugador?.Categoria, scopeLabel].filter(Boolean).join(" · ");
  const nombre = jugador?.Jugador ?? target.jugador;
  const canExport = !isLoading && !error && pagos.length > 0;

  const btn = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-[160] p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0f172a] border border-white/15 rounded-3xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-white/10 bg-white/5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Receipt size={18} className="text-blue-400 flex-shrink-0" />
                <span className="truncate">{nombre}</span>
              </h3>
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
              {fechaInscripcion && (
                <p className="text-[10px] text-emerald-400/90 font-semibold mt-1 flex items-center gap-1">
                  <CalendarCheck size={11} />
                  Inscripción: {fecha(fechaInscripcion)}
                </p>
              )}
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all flex-shrink-0">
              <X size={20} />
            </button>
          </div>

          {/* Alcance + exportación */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {temporadaId && (
              <div className="flex bg-white/5 border border-white/10 rounded-lg p-0.5">
                <button
                  onClick={() => setSoloTemporada(true)}
                  className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all ${
                    soloTemporada ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {temporadaNombre ?? "Temporada"}
                </button>
                <button
                  onClick={() => setSoloTemporada(false)}
                  className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all ${
                    !soloTemporada ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Todo el histórico
                </button>
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => exportPagosToPdf(pagos, nombre, subtitle, total)}
                disabled={!canExport}
                className={`${btn} bg-blue-600/15 hover:bg-blue-600/25 border-blue-500/30 text-blue-200`}
              >
                <FileDown size={13} /> PDF
              </button>
              <button
                onClick={() => exportPagosToExcel(pagos, nombre, subtitle, total)}
                disabled={!canExport}
                className={`${btn} bg-emerald-600/15 hover:bg-emerald-600/25 border-emerald-500/30 text-emerald-200`}
              >
                <FileSpreadsheet size={13} /> Excel
              </button>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="flex-1 overflow-auto p-5">
          {isLoading ? (
            <div className="h-48 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 size={28} className="animate-spin text-blue-500" />
              <p className="text-sm font-bold">Cargando pagos...</p>
            </div>
          ) : error ? (
            <div className="h-48 flex flex-col items-center justify-center gap-3 text-rose-400">
              <AlertCircle size={36} className="opacity-60" />
              <p className="text-sm font-black">{error}</p>
            </div>
          ) : pagos.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center gap-3 text-slate-500">
              <Receipt size={40} className="opacity-20" />
              <p className="text-base font-black">Sin pagos registrados</p>
              <p className="text-xs opacity-60">
                {soloTemporada ? "No hay pagos en esta temporada" : "Este jugador no tiene pagos"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="bg-white/[0.07]">
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-3 py-2.5 text-left">Recibo</th>
                    <th className="px-3 py-2.5 text-left">Fecha</th>
                    <th className="px-3 py-2.5 text-left">Concepto</th>
                    <th className="px-3 py-2.5 text-left">Tipo</th>
                    <th className="px-3 py-2.5 text-left">Mes</th>
                    <th className="px-3 py-2.5 text-left">Forma</th>
                    <th className="px-3 py-2.5 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {pagos.map((p) => (
                    <tr key={p.IdPago} className="hover:bg-white/[0.04] transition-colors">
                      <td className="px-3 py-2 text-slate-500 text-xs font-mono">{p.Recibo || p.IdPago}</td>
                      <td className="px-3 py-2 text-slate-300 text-xs whitespace-nowrap">{fecha(p.FechaPago)}</td>
                      <td className="px-3 py-2 text-slate-200 font-semibold text-xs">{p.Producto}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border whitespace-nowrap ${
                          p.IdTipoProducto === 2
                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
                            : p.IdTipoProducto === 1
                              ? "bg-blue-500/15 text-blue-300 border-blue-500/25"
                              : "bg-white/5 text-slate-400 border-white/10"
                        }`}>
                          {p.TipoProducto}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">{mesLabel(p.Mes, p.Anio)}</td>
                      <td className="px-3 py-2 text-slate-400 text-xs">{p.FormaPago}</td>
                      <td className="px-3 py-2 text-right text-emerald-400 font-black whitespace-nowrap">{money(Number(p.Pago))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer con el total */}
        <div className="p-4 px-5 bg-white/5 border-t border-white/10 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            {isLoading ? "—" : `${pagos.length} pago(s)`}
          </p>
          <div className="text-right">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total pagado</p>
            <p className="text-xl font-black text-emerald-400">{money(total)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
