"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser, usePuedeVer } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import {
  ShoppingCart, Search, RefreshCw, Calendar, X,
  Wallet, CreditCard, Receipt, MapPin, TrendingUp,
  FileDown, FileSpreadsheet, Loader2,
} from "lucide-react";
import { exportVentasToPdf, exportVentasToExcel, type TotalesPeriodo } from "@/lib/ventas-export";

type Period = "today" | "yesterday" | "week" | "month" | "all";

/** Botón de exportación; mismo estilo que el resto de la plataforma. */
const EXP_BTN = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed";
const EXP_PDF = `${EXP_BTN} bg-blue-600/15 hover:bg-blue-600/25 border-blue-500/30 text-blue-200`;
const EXP_XLS = `${EXP_BTN} bg-emerald-600/15 hover:bg-emerald-600/25 border-emerald-500/30 text-emerald-200`;

/** Tope de filas que pide la exportación (la tabla en pantalla usa el de la API). */
const TOPE_EXPORT = 20000;

const ETIQUETA_PERIODO: Record<Exclude<Period, "all">, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  week: "Esta semana",
  month: "Este mes",
};

interface Sale {
  IdVenta: number;
  FechaVenta: string;
  IdJugador: number | null;
  Jugador: string;
  ConceptoVenta: string;
  IdFormaPago: number;
  Referencia: string;
  Subtotal: number;
  Iva: number;
  Total: number;
  Status: number;
  IdSede: number | null;
  Sede: string | null;
  FormaPago: string;
  Recibo: string;
}

interface Sede {
  IdSede: number;
  Sede: string;
}

/** Cuánto entró por cada forma de pago en TODO el período, no solo en lo listado. */
interface ResumenFormaPago {
  FormaPago: string;
  Ventas: number;
  Total: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

export default function VentasPage() {
  const router = useRouter();
  const { user, isInitialized, season } = useUser();
  const puedeVer = usePuedeVer("/ventas");

  // Sales List State
  const [sales, setSales] = useState<Sale[]>([]);
  /* El listado viene topado, así que los KPIs y el conteo salen de este resumen, que
     el servidor calcula sobre el período completo. */
  const [resumen, setResumen] = useState<ResumenFormaPago[]>([]);
  const [totalVentas, setTotalVentas] = useState(0);
  const [totalImporte, setTotalImporte] = useState(0);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSedeFilter, setSelectedSedeFilter] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingFrom, setPendingFrom] = useState("");
  const [pendingTo, setPendingTo] = useState("");
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    if (isInitialized && !user) router.push("/login");
  }, [user, isInitialized, router]);

  // Fetch Sedes (para el filtro)
  const fetchSedes = useCallback(async () => {
    try {
      const res = await fetch("/api/ventas/sedes");
      const json = await res.json();
      if (json.success) setSedes(json.data);
    } catch (e) {
      console.error("Error loading sedes:", e);
    }
  }, []);

  // Fetch Sales History
  const fetchSales = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (selectedSedeFilter) params.set("idSede", selectedSedeFilter);
      if (searchQuery) params.set("q", searchQuery);
      if (period === "all" && dateFrom && dateTo) {
        params.set("dateFrom", dateFrom);
        params.set("dateTo", dateTo);
      }

      const res = await fetch(`/api/ventas?${params}`);
      const json = await res.json();
      if (json.success) {
        setSales(json.data);
        setResumen(Array.isArray(json.resumen) ? json.resumen : []);
        setTotalVentas(Number(json.totalVentas) || 0);
        setTotalImporte(Number(json.totalImporte) || 0);
        setLastUpdated(new Date());
      }
    } catch (e) {
      console.error("Error loading sales history:", e);
    } finally {
      setIsLoading(false);
    }
  }, [period, selectedSedeFilter, searchQuery, dateFrom, dateTo]);

  // Sin el permiso, DashboardLayout pinta "Sin acceso": no hay nada que pedir.
  useEffect(() => {
    if (user && puedeVer) {
      fetchSedes();
      fetchSales();
    }
  }, [user, puedeVer, fetchSales, fetchSedes]);

  const handlePeriodChange = (p: Period) => {
    if (p === "all") {
      setPendingFrom(dateFrom || new Date().toISOString().split("T")[0]);
      setPendingTo(dateTo || new Date().toISOString().split("T")[0]);
      setShowDatePicker(true);
      return;
    }
    setPeriod(p);
  };

  const applyCustomDates = () => {
    setDateFrom(pendingFrom);
    setDateTo(pendingTo);
    setPeriod("all");
    setShowDatePicker(false);
    fetchSales();
  };

  /* Qué está viendo el usuario, en una línea: es el subtítulo del documento, así
     que quien lo reciba sabe con qué filtros se sacó y no lo confunde con "todo". */
  const etiquetaPeriodo =
    period === "all"
      ? (dateFrom && dateTo ? `Del ${dateFrom} al ${dateTo}` : "Rango de fechas")
      : ETIQUETA_PERIODO[period];
  const nombreSede = selectedSedeFilter
    ? (sedes.find((s) => String(s.IdSede) === selectedSedeFilter)?.Sede ?? "Sede")
    : "Todas las sedes";
  const subtituloExport = [
    etiquetaPeriodo,
    nombreSede,
    searchQuery.trim() ? `Búsqueda: "${searchQuery.trim()}"` : null,
    season ? `Temporada ${season}` : null,
  ].filter(Boolean).join(" · ");

  const puedeExportar = !isLoading && sales.length > 0;

  /* La tabla muestra solo las 200 ventas más recientes, pero un documento sí debe
     traer el período completo: se vuelve a pedir con los mismos filtros y un tope
     alto. Si aun así viniera recortado, el subtítulo lo dice en vez de callarlo. */
  const cargarParaExportar = useCallback(async (): Promise<{ filas: Sale[]; totales: TotalesPeriodo }> => {
    const params = new URLSearchParams({ period, limit: String(TOPE_EXPORT) });
    if (selectedSedeFilter) params.set("idSede", selectedSedeFilter);
    if (searchQuery) params.set("q", searchQuery);
    if (period === "all" && dateFrom && dateTo) {
      params.set("dateFrom", dateFrom);
      params.set("dateTo", dateTo);
    }
    const comoTotales = (r: ResumenFormaPago[], ventas: number, importe: number): TotalesPeriodo => ({
      ventas,
      importe,
      formas: r.map((x) => ({ forma: x.FormaPago, movimientos: x.Ventas, total: x.Total })),
    });
    try {
      const res = await fetch(`/api/ventas?${params}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        /* Los totales salen del resumen del servidor, que no lleva tope: si se
           calcularan sobre las filas —que sí lo llevan— el documento reportaría
           menos dinero del que hay y contradiría a los indicadores de la pantalla. */
        return {
          filas: json.data,
          totales: comoTotales(
            Array.isArray(json.resumen) ? json.resumen : [],
            Number(json.totalVentas) || 0,
            Number(json.totalImporte) || 0,
          ),
        };
      }
    } catch (e) {
      console.error("Error loading sales for export:", e);
    }
    /* Si la recarga falla se exporta lo que ya está en pantalla, pero con los totales
       del último resumen bueno: corresponden a estos mismos filtros. */
    return { filas: sales, totales: comoTotales(resumen, totalVentas, totalImporte) };
  }, [period, selectedSedeFilter, searchQuery, dateFrom, dateTo, sales, resumen, totalVentas, totalImporte]);

  const exportar = async (formato: "pdf" | "excel") => {
    setExportando(true);
    try {
      const { filas, totales } = await cargarParaExportar();
      if (formato === "pdf") exportVentasToPdf(filas, subtituloExport, totales);
      else await exportVentasToExcel(filas, subtituloExport, totales);
    } finally {
      setExportando(false);
    }
  };

  /* KPIs del período COMPLETO. Antes se sumaban las filas de la tabla, que vienen
     topadas: con más ventas que el tope, la pantalla reportaba una fracción del
     dinero real y no coincidía con el documento exportado. */
  const importeDe = (forma: string) =>
    resumen.filter(r => r.FormaPago === forma).reduce((acc, r) => acc + r.Total, 0);
  const totalRecaudado = totalImporte;
  const totalEfectivo = importeDe("EFECTIVO");
  const totalTarjeta = importeDe("TARJETA");
  const totalTransferencia = importeDe("TRANSFERENCIA");
  // La tabla se quedó corta respecto de lo que hay en el período.
  const listadoRecortado = totalVentas > sales.length;

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white">

        {/* HEADER */}
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600/20 p-2.5 rounded-xl border border-blue-500/20">
              <ShoppingCart size={20} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-black">Historial de Ventas</h1>
              <p className="text-xs text-blue-300">{season ? `Temporada ${season}` : "Administración de Ventas"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-[10px] text-slate-500 hidden sm:inline">
                Act. {lastUpdated.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {/* Bajan lo mismo que se ve en la tabla, con los filtros ya aplicados. */}
            <button
              onClick={() => exportar("pdf")}
              disabled={!puedeExportar || exportando}
              title="Descargar en PDF: totales del período completo y el detalle de las ventas más recientes"
              className={EXP_PDF}
            >
              {exportando ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />} PDF
            </button>
            <button
              onClick={() => exportar("excel")}
              disabled={!puedeExportar || exportando}
              title="Descargar en Excel: totales del período completo y el detalle, con los filtros aplicados"
              className={EXP_XLS}
            >
              {exportando ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} Excel
            </button>
            <button
              onClick={fetchSales}
              disabled={isLoading}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all"
            >
              <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* CONTAINER */}
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">

          {/* KPI CARDS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Ventas Totales", value: fmt(totalRecaudado), desc: `${totalVentas.toLocaleString("es-MX")} transacciones`, icon: <TrendingUp size={16} className="text-emerald-400" />, bg: "bg-emerald-500/10 border-emerald-500/20" },
              { label: "Efectivo", value: fmt(totalEfectivo), desc: "Colección física", icon: <Wallet size={16} className="text-blue-400" />, bg: "bg-blue-500/10 border-blue-500/20" },
              { label: "Tarjeta", value: fmt(totalTarjeta), desc: "Pagos terminal", icon: <CreditCard size={16} className="text-purple-400" />, bg: "bg-purple-500/10 border-purple-500/20" },
              { label: "Transferencia", value: fmt(totalTransferencia), desc: "Depósitos bancarios", icon: <Receipt size={16} className="text-amber-400" />, bg: "bg-amber-500/10 border-amber-500/20" }
            ].map(kpi => (
              <div key={kpi.label} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-start gap-3 relative overflow-hidden group">
                <div className="absolute -inset-10 bg-white/1 rounded-full blur-xl group-hover:scale-125 transition-transform duration-300 pointer-events-none" />
                <div className={`p-2 rounded-xl border flex-shrink-0 ${kpi.bg}`}>{kpi.icon}</div>
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{kpi.label}</p>
                  <p className="text-base font-black text-white mt-0.5 tabular-nums">{kpi.value}</p>
                  <p className="text-[10px] text-slate-400">{kpi.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* FILTERS PANEL */}
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            {/* Search Input & Sede */}
            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <div className="relative group flex-1 sm:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-400 transition-colors" size={16} />
                <input
                  type="text"
                  placeholder="Buscar comprador (jugador)..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && fetchSales()}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 outline-none focus:bg-white/10 focus:border-blue-500/50 transition-all text-sm text-white placeholder-slate-400"
                />
              </div>
              <select
                value={selectedSedeFilter}
                onChange={e => setSelectedSedeFilter(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 outline-none focus:bg-white/10 focus:border-blue-500/50 text-sm text-slate-300 transition-all [color-scheme:dark]"
              >
                <option value="">Todas las Sedes</option>
                {sedes.map(s => (
                  <option key={s.IdSede} value={s.IdSede}>{s.Sede}</option>
                ))}
              </select>
            </div>

            {/* Quick Period Filters */}
            <div className="flex gap-1.5 bg-white/5 p-1 rounded-xl border border-white/10 flex-wrap">
              {[
                { key: "today", label: "Hoy" },
                { key: "yesterday", label: "Ayer" },
                { key: "week", label: "Esta Semana" },
                { key: "month", label: "Este Mes" },
                { key: "all", label: "Fechas..." }
              ].map(p => (
                <button
                  key={p.key}
                  onClick={() => handlePeriodChange(p.key as Period)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                    period === p.key || (p.key === "all" && period === "all")
                      ? "bg-blue-600 text-white shadow shadow-blue-500/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* DATE PICKER MODAL (FOR CUSTOM RANGE) */}
          {showDatePicker && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[130] p-4">
              <div className="bg-slate-900 border border-white/15 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <Calendar size={16} className="text-blue-400" />
                    Rango de Fechas
                  </h3>
                  <button onClick={() => setShowDatePicker(false)} className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-all">
                    <X size={18} />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Desde</label>
                    <input type="date" value={pendingFrom} onChange={e => setPendingFrom(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all [color-scheme:dark]" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Hasta</label>
                    <input type="date" value={pendingTo} onChange={e => setPendingTo(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all [color-scheme:dark]" />
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={() => setShowDatePicker(false)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 text-sm font-bold hover:bg-white/5 transition-all">Cancelar</button>
                  {/* Sin las dos fechas la API no filtra por fecha y devolveria el
                      historico completo, rotulado como si fuera un rango. */}
                  <button
                    onClick={applyCustomDates}
                    disabled={!pendingFrom || !pendingTo}
                    className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black transition-all shadow-lg shadow-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* HISTORY LIST TABLE */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
              <div className="w-10 h-10 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
              <p className="text-xs font-bold text-slate-500 animate-pulse">Cargando historial de ventas...</p>
            </div>
          ) : sales.length === 0 ? (
            <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">
              <ShoppingCart size={40} className="mx-auto text-slate-600 mb-4" />
              <h3 className="text-base font-bold text-slate-300">No hay ventas registradas</h3>
              <p className="text-xs text-slate-500 mt-2">No se encontraron ventas para los filtros aplicados en este período.</p>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              {/* La tabla viene topada a propósito; decirlo evita que se lea como si
                  fueran todas las ventas del período. Los KPIs de arriba y la
                  exportación sí cubren el período completo. */}
              {listadoRecortado && (
                <p className="px-5 py-2.5 text-[11px] text-amber-200 bg-amber-500/10 border-b border-amber-500/20">
                  Mostrando las {sales.length.toLocaleString("es-MX")} ventas más recientes de{" "}
                  {totalVentas.toLocaleString("es-MX")}. Los indicadores de arriba y los totales de
                  PDF y Excel sí cubren el período completo; en los documentos el detalle también
                  se acota, y ellos mismos lo indican.
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 text-[9px] uppercase font-black text-slate-500 tracking-widest border-b border-white/10">
                      <th className="px-5 py-4">Fecha</th>
                      <th className="px-5 py-4">Comprador</th>
                      <th className="px-5 py-4">Concepto / Producto</th>
                      <th className="px-5 py-4">Sede</th>
                      <th className="px-5 py-4">Pago</th>
                      <th className="px-5 py-4">Folio / Recibo</th>
                      <th className="px-5 py-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {sales.map(s => (
                      <tr key={s.IdVenta} className="hover:bg-white/5 transition-colors">
                        <td className="px-5 py-3.5 text-xs whitespace-nowrap tabular-nums text-slate-400">
                          {new Date(s.FechaVenta).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                          <span className="block text-[10px] text-slate-600 mt-0.5">
                            {new Date(s.FechaVenta).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-xs font-bold text-white truncate max-w-[200px]">{s.Jugador}</p>
                          <span className="text-[10px] text-slate-500">
                            {s.IdJugador ? `Alumno ID: #${s.IdJugador}` : "Venta Externa"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-xs text-white line-clamp-1 max-w-[250px]">{s.ConceptoVenta}</p>
                        </td>
                        <td className="px-5 py-3.5 text-xs whitespace-nowrap">
                          <span className="flex items-center gap-1 text-slate-400">
                            <MapPin size={12} className="text-slate-600" />
                            {s.Sede || "—"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black border tracking-wide whitespace-nowrap ${
                            s.FormaPago === "EFECTIVO"
                              ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                              : s.FormaPago === "TARJETA"
                                ? "bg-purple-500/10 border-purple-500/20 text-purple-400"
                                : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                          }`}>
                            {s.FormaPago}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs tabular-nums text-slate-400">
                          {s.Recibo ? `Recibo: ${s.Recibo}` : s.Referencia ? `Ref: ${s.Referencia}` : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-right font-black text-emerald-400 text-xs tabular-nums whitespace-nowrap">
                          {fmt(s.Total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      </main>
    </DashboardLayout>
  );
}
