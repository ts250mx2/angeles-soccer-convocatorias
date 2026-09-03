"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin, Receipt, CalendarRange, Search, X, Loader2, AlertCircle, Banknote, ChevronRight,
  FileDown, FileSpreadsheet,
} from "lucide-react";
import { useUser } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import {
  exportEgresosResumenToPdf, exportEgresosResumenToExcel,
  exportEgresosDetalleToPdf, exportEgresosDetalleToExcel,
  type SedeEgresos, type FormaPagoEgresos, type EgresoRow,
} from "@/lib/gastos-export";
import { PERIODOS, PERIODO_POR_OMISION, type Periodo } from "@/lib/gastos-periodo";


/** Botón de exportación; mismo estilo que el resto de la plataforma. */
const EXP_BTN = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed";
const EXP_PDF = `${EXP_BTN} bg-blue-600/15 hover:bg-blue-600/25 border-blue-500/30 text-blue-200`;
const EXP_XLS = `${EXP_BTN} bg-emerald-600/15 hover:bg-emerald-600/25 border-emerald-500/30 text-emerald-200`;

const money = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
const moneyExacto = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

export default function EgresosPage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();

  const [periodo, setPeriodo] = useState<Periodo>(PERIODO_POR_OMISION);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pendienteDesde, setPendienteDesde] = useState("");
  const [pendienteHasta, setPendienteHasta] = useState("");
  const [mostrarFechas, setMostrarFechas] = useState(false);

  const [porSede, setPorSede] = useState<SedeEgresos[]>([]);
  const [porFormaPago, setPorFormaPago] = useState<FormaPagoEgresos[]>([]);
  const [total, setTotal] = useState(0);
  const [movimientos, setMovimientos] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sede abierta en el panel de detalle. null = cerrado.
  const [detalleSede, setDetalleSede] = useState<SedeEgresos | null>(null);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    if (isInitialized && !user) router.push("/login");
  }, [user, isInitialized, router]);

  /** Query string del período; lo comparten el resumen y el detalle. */
  const qs = useCallback(() => {
    const p = new URLSearchParams({ periodo });
    if (periodo === "custom" && desde && hasta) {
      p.set("desde", desde);
      p.set("hasta", hasta);
    }
    return p.toString();
  }, [periodo, desde, hasta]);

  useEffect(() => {
    if (!isInitialized || !user) return;
    // En rango personalizado no se consulta hasta tener ambas fechas.
    if (periodo === "custom" && (!desde || !hasta)) return;

    let vivo = true;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/gastos/egresos?${qs()}`, { cache: "no-store" });
        const json = await res.json();
        if (!vivo) return;
        if (json.success) {
          setPorSede(json.porSede);
          setPorFormaPago(json.porFormaPago);
          setTotal(json.total);
          setMovimientos(json.movimientos);
        } else {
          setError(json.message ?? "No se pudieron cargar los egresos");
        }
      } catch {
        if (vivo) setError("Error de conexión");
      } finally {
        if (vivo) setIsLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, [isInitialized, user, qs, periodo, desde, hasta]);

  const aplicarFechas = () => {
    if (!pendienteDesde || !pendienteHasta) return;
    setDesde(pendienteDesde);
    setHasta(pendienteHasta);
    setPeriodo("custom");
    setMostrarFechas(false);
  };

  const etiquetaPeriodo = periodo === "custom" && desde && hasta
    ? `${desde} → ${hasta}`
    : PERIODOS.find((p) => p.key === periodo)?.label ?? "";

  const maxSede = Math.max(...porSede.map((s) => s.Total), 1);

  // Lo que ya está en pantalla; no hace falta volver a consultar para exportarlo.
  const resumen = { porSede, porFormaPago, total, movimientos };
  const puedeExportar = !isLoading && !error && porSede.length > 0;

  const exportarExcel = async () => {
    setExportando(true);
    try {
      await exportEgresosResumenToExcel(resumen, etiquetaPeriodo);
    } finally {
      setExportando(false);
    }
  };

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white p-6 md:p-8 relative">
        <div className="max-w-7xl mx-auto space-y-8">

          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
            <div>
              <h1 className="text-3xl font-black text-white mb-2">Egresos por Sede</h1>
              <p className="text-slate-400">Gastos registrados — {etiquetaPeriodo}</p>
            </div>
            <div className="flex flex-col items-start md:items-end gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => exportEgresosResumenToPdf(resumen, etiquetaPeriodo)}
                  disabled={!puedeExportar}
                  title="Resumen por sede y por forma de pago en PDF"
                  className={EXP_PDF}
                >
                  <FileDown size={13} /> PDF
                </button>
                <button
                  onClick={exportarExcel}
                  disabled={!puedeExportar || exportando}
                  title="Resumen por sede y por forma de pago en Excel"
                  className={EXP_XLS}
                >
                  {exportando ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} Excel
                </button>
              </div>
              <div className="flex gap-2 bg-white/5 p-1 rounded-2xl border border-white/10 flex-wrap">
                {PERIODOS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => {
                      if (p.key === "custom") { setMostrarFechas(true); return; }
                      setPeriodo(p.key);
                      setMostrarFechas(false);
                    }}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      periodo === p.key
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                        : "text-slate-400 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {p.key === "custom" && <CalendarRange size={13} />}
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {mostrarFechas && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Desde</label>
                <input
                  type="date"
                  value={pendienteDesde}
                  onChange={(e) => setPendienteDesde(e.target.value)}
                  className="bg-slate-900/80 border border-white/15 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-blue-500/60 [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Hasta</label>
                <input
                  type="date"
                  value={pendienteHasta}
                  onChange={(e) => setPendienteHasta(e.target.value)}
                  className="bg-slate-900/80 border border-white/15 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-blue-500/60 [color-scheme:dark]"
                />
              </div>
              <button
                onClick={aplicarFechas}
                disabled={!pendienteDesde || !pendienteHasta}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Aplicar
              </button>
              <button
                onClick={() => setMostrarFechas(false)}
                className="px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 text-xs font-bold transition-all"
              >
                Cancelar
              </button>
            </div>
          )}

          {/* ── Totales ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-rose-500/20 p-1.5 rounded-lg"><Receipt size={16} className="text-rose-400" /></div>
                <p className="text-[10px] uppercase tracking-wider text-rose-400 font-bold">Total de egresos</p>
              </div>
              <p className="text-3xl font-black text-white leading-none" title={moneyExacto(total)}>{money(total)}</p>
              <p className="text-[10px] text-slate-500 mt-2">{movimientos.toLocaleString("es-MX")} movimiento(s)</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-emerald-500/15 p-1.5 rounded-lg"><Banknote size={16} className="text-emerald-400" /></div>
                <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">Por forma de pago</p>
              </div>
              <div className="space-y-1">
                {porFormaPago.length === 0 ? (
                  <p className="text-xs text-slate-500">Sin datos</p>
                ) : porFormaPago.slice(0, 3).map((f) => (
                  <div key={f.IdFormaPago} className="flex justify-between items-baseline gap-2">
                    <span className="text-[11px] text-slate-400 truncate">{f.FormaPago}</span>
                    <span className="text-xs font-black text-white whitespace-nowrap">{money(f.Total)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-blue-500/15 p-1.5 rounded-lg"><MapPin size={16} className="text-blue-400" /></div>
                <p className="text-[10px] uppercase tracking-wider text-blue-400 font-bold">Sedes con gasto</p>
              </div>
              <p className="text-3xl font-black text-white leading-none">{porSede.length}</p>
              <p className="text-[10px] text-slate-500 mt-2">en el período seleccionado</p>
            </div>
          </div>

          {/* ── Sedes ── */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 bg-white/5 rounded-2xl animate-pulse border border-white/10" />
              ))}
            </div>
          ) : error ? (
            <div className="bg-rose-500/10 border border-rose-500/25 rounded-2xl p-8 text-center">
              <AlertCircle size={32} className="mx-auto text-rose-400 mb-3 opacity-70" />
              <p className="text-sm font-black text-rose-300">{error}</p>
            </div>
          ) : porSede.length === 0 ? (
            <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/20">
              <Receipt size={48} className="mx-auto text-slate-500 mb-4 opacity-20" />
              <h3 className="text-xl font-bold text-slate-300">Sin egresos en este período</h3>
              <p className="text-slate-500 mt-2">Prueba con otro período o un rango de fechas distinto.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {porSede.map((s) => (
                <button
                  key={s.IdSede}
                  type="button"
                  onClick={() => setDetalleSede(s)}
                  title="Ver el detalle de los egresos de esta sede"
                  className="group text-left bg-white/5 hover:bg-white/[0.09] border border-white/10 hover:border-rose-500/30 rounded-2xl p-5 transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="bg-rose-500/10 text-rose-400 p-2 rounded-xl border border-rose-500/10 group-hover:bg-rose-500 group-hover:text-white transition-all">
                      <MapPin size={16} />
                    </div>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                      {s.Movimientos} mov.
                    </span>
                  </div>
                  <h3 className="text-sm font-black text-slate-200 group-hover:text-white transition-colors line-clamp-1 mb-1">
                    {s.Sede}
                  </h3>
                  <p className="text-2xl font-black text-rose-400 leading-none" title={moneyExacto(s.Total)}>
                    {money(s.Total)}
                  </p>
                  <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-rose-600 to-rose-400 rounded-full transition-all duration-700"
                      style={{ width: `${(s.Total / maxSede) * 100}%` }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500">
                    <span>Efectivo {money(s.Efectivo)}</span>
                    {s.Otros > 0 && <span>Otros {money(s.Otros)}</span>}
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-rose-400/80 group-hover:text-rose-300">
                    <span className="text-[10px] font-black uppercase tracking-widest">Ver detalle</span>
                    <ChevronRight size={14} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {detalleSede && (
          <DetalleEgresos
            sede={detalleSede}
            queryPeriodo={qs()}
            etiquetaPeriodo={etiquetaPeriodo}
            onClose={() => setDetalleSede(null)}
          />
        )}
      </main>
    </DashboardLayout>
  );
}

/** Panel con los renglones de egreso de una sede en el período seleccionado. */
function DetalleEgresos({ sede, queryPeriodo, etiquetaPeriodo, onClose }: {
  sede: SedeEgresos;
  queryPeriodo: string;
  etiquetaPeriodo: string;
  onClose: () => void;
}) {
  const [filas, setFilas] = useState<EgresoRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncado, setTruncado] = useState(false);
  const [query, setQuery] = useState("");
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    let vivo = true;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/gastos/egresos/detalle?${queryPeriodo}&idSede=${sede.IdSede}`, { cache: "no-store" });
        const json = await res.json();
        if (!vivo) return;
        if (json.success) {
          setFilas(json.data);
          setTruncado(!!json.truncado);
        } else {
          setError(json.message ?? "No se pudo cargar el detalle");
        }
      } catch {
        if (vivo) setError("Error de conexión");
      } finally {
        if (vivo) setIsLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, [sede.IdSede, queryPeriodo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const filtradas = q
    ? filas.filter((f) =>
        f.Concepto.toLowerCase().includes(q) ||
        f.PagarA.toLowerCase().includes(q) ||
        f.Factura.toLowerCase().includes(q))
    : filas;
  const totalVisible = filtradas.reduce((s, f) => s + f.Total, 0);

  // Se exporta lo que está a la vista: si hay búsqueda activa, solo lo filtrado.
  const tituloExport = `Egresos ${sede.Sede}`;
  const subtituloExport = q ? `${etiquetaPeriodo} · Filtro: "${query.trim()}"` : etiquetaPeriodo;
  const puedeExportar = !isLoading && !error && filtradas.length > 0;

  const exportarExcel = async () => {
    setExportando(true);
    try {
      await exportEgresosDetalleToExcel(filtradas, tituloExport, subtituloExport);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[150] p-4" onClick={onClose}>
      <div
        className="bg-[#0f172a] border border-white/15 rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-white/10 bg-white/5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                {sede.Sede}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Egresos · {etiquetaPeriodo}</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all flex-shrink-0">
              <X size={20} />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={() => exportEgresosDetalleToPdf(filtradas, tituloExport, subtituloExport)}
              disabled={!puedeExportar}
              title="Detalle de los movimientos a la vista en PDF"
              className={EXP_PDF}
            >
              <FileDown size={13} /> PDF
            </button>
            <button
              onClick={exportarExcel}
              disabled={!puedeExportar || exportando}
              title="Detalle de los movimientos a la vista en Excel"
              className={EXP_XLS}
            >
              {exportando ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} Excel
            </button>
          </div>
        </div>

        {!isLoading && !error && filas.length > 0 && (
          <div className="px-5 pt-4">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar concepto, proveedor o factura..."
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all placeholder:text-slate-500"
              />
            </div>
            {truncado && (
              <p className="text-[10px] text-amber-300/80 mt-2">
                El listado se recortó a los 3,000 movimientos más recientes; acota el período para verlos todos.
              </p>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="h-48 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 size={28} className="animate-spin text-blue-500" />
              <p className="text-sm font-bold">Cargando egresos...</p>
            </div>
          ) : error ? (
            <div className="h-48 flex flex-col items-center justify-center gap-3 text-rose-400">
              <AlertCircle size={36} className="opacity-60" />
              <p className="text-sm font-black">{error}</p>
            </div>
          ) : filtradas.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center gap-3 text-slate-500">
              <Receipt size={40} className="opacity-20" />
              <p className="text-base font-black">Sin egresos</p>
              {query && <p className="text-xs opacity-60">No hay coincidencias para &quot;{query}&quot;</p>}
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-2xl divide-y divide-white/5 overflow-hidden">
              {filtradas.map((f) => (
                <div key={f.IdEgreso} className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-white/[0.06] transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-200">{f.Concepto}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{f.Fecha}</span>
                      {f.PagarA !== "—" && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/25">
                          {f.PagarA}
                        </span>
                      )}
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/10">
                        {f.FormaPago}
                      </span>
                      {f.Factura !== "—" && (
                        <span className="text-[10px] text-slate-500">Fact. {f.Factura}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-black text-rose-400 whitespace-nowrap flex-shrink-0" title={moneyExacto(f.Total)}>
                    {money(f.Total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 px-5 bg-white/5 border-t border-white/10 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            {isLoading ? "—" : `${filtradas.length}${filtradas.length !== filas.length ? ` de ${filas.length}` : ""} movimiento(s)`}
          </p>
          <div className="text-right">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total</p>
            <p className="text-xl font-black text-rose-400">{moneyExacto(totalVisible)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
