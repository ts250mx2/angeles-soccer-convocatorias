"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import {
  DollarSign, CreditCard, Users, TrendingUp, TrendingDown,
  Calendar, BarChart3, RefreshCw, Trophy, Target, MapPin, X,
  ExternalLink, ChevronRight, Search, FileText
} from "lucide-react";

type Period = "today" | "yesterday" | "week" | "month" | "custom";

interface KPIData {
  totalRecaudado: number;
  totalPagos: number;
  jugadoresUnicos: number;
  promedioPago: number;
}
interface RowData { 
  IdLiga?: number; 
  Liga?: string; 
  IdSede?: number; 
  Sede?: string; 
  Categoria?: string; 
  Pagos: number; 
  Jugadores?: number; 
  Total: number; 
}
interface TimelineEntry { Fecha: string; Pagos: number; Total: number; }
interface DashboardData {
  period: Period;
  dateFrom: string | null;
  dateTo: string | null;
  season: { IdTemporada: number; Temporada: string } | null;
  kpi: KPIData;
  byLeague: RowData[];
  bySede: RowData[];
  byCategory: RowData[];
  timeline: TimelineEntry[];
  seasonSummary: { TotalPagosTemporada: number; JugadoresTemporada: number; TotalTemporada: number; };
}

interface PaymentDetail {
  IdPago: number;
  Pago: number;
  FechaPago: string;
  Recibo: string;
  Jugador: string;
  Categoria: string;
  Liga: string;
  Sede: string;
  Producto: string;
}

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "yesterday", label: "Ayer" },
  { key: "week", label: "Esta Semana" },
  { key: "month", label: "Este Mes" },
  { key: "custom", label: "Fechas..." },
];

const BAR_COLORS = [
  "from-blue-600 to-blue-400",
  "from-emerald-600 to-emerald-400",
  "from-purple-600 to-purple-400",
  "from-amber-600 to-amber-400",
  "from-rose-600 to-rose-400",
  "from-cyan-600 to-cyan-400",
];

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const fmtC = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact", maximumFractionDigits: 1 }).format(n);

// Reusable horizontal bar section
function BarSection({ title, icon, data, labelKey, colorBase, period, onClickItem }: {
  title: string; icon: React.ReactNode; data: RowData[]; labelKey: keyof RowData; colorBase?: string; period: string;
  onClickItem?: (item: RowData) => void;
}) {
  const max = Math.max(...data.map((d) => d.Total), 1);
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="bg-white/10 p-1.5 rounded-lg border border-white/10">{icon}</div>
        <h3 className="text-sm font-black text-white">{title}</h3>
        <span className="text-[10px] text-slate-500 ml-auto">{period}</span>
      </div>
      {data.length === 0 ? (
        <div className="py-10 text-center text-slate-500 text-sm">Sin datos para este período</div>
      ) : (
        <div className="space-y-3">
          {data.map((row, i) => {
            const label = String(row[labelKey] ?? "—");
            const pct = (row.Total / max) * 100;
            const color = colorBase ?? BAR_COLORS[i % BAR_COLORS.length];
            return (
              <div 
                key={label + i} 
                className="group cursor-pointer"
                onClick={() => onClickItem?.(row)}
              >
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 bg-gradient-to-r ${color}`} />
                    <span className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors truncate max-w-[160px]">{label}</span>
                    <ChevronRight size={10} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-all -ml-1" />
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[10px] text-slate-500">{row.Pagos} pagos</span>
                    <span className="text-xs font-black text-white">{fmtC(row.Total)}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isInitialized, season } = useUser();

  const today = new Date().toISOString().split("T")[0];
  const [period, setPeriod] = useState<Period>("month");
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingFrom, setPendingFrom] = useState(today);
  const [pendingTo, setPendingTo] = useState(today);

  // Drill down details state
  const [detailsModal, setDetailsModal] = useState<{ open: boolean, title: string, subtitle: string }>({ open: false, title: "", subtitle: "" });
  const [detailsData, setDetailsData] = useState<PaymentDetail[]>([]);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);

  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (isInitialized) {
      if (!user) {
        router.push("/login");
      } else if ((user.AdminConvocatorias ?? 0) < 2) {
        router.push("/inscripciones");
      }
    }
  }, [user, isInitialized, router]);

  const fetchKPIs = useCallback(async (p: Period, from?: string, to?: string) => {
    setIsLoading(true);
    try {
      let url = `/api/dashboard/kpis?period=${p}`;
      if (p === "custom" && from && to) url += `&dateFrom=${from}&dateTo=${to}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) { setData(json); setLastUpdated(new Date()); }
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }, []);

  const fetchDetails = async (filters: { idSede?: number, idLiga?: number, categoria?: string }, title: string, sub: string) => {
    setDetailsModal({ open: true, title, subtitle: sub });
    setIsDetailsLoading(true);
    setDetailsData([]);
    try {
      let url = `/api/dashboard/payments/details?period=${period}`;
      if (period === "custom") url += `&dateFrom=${dateFrom}&dateTo=${dateTo}`;
      if (filters.idSede) url += `&idSede=${filters.idSede}`;
      if (filters.idLiga) url += `&idLiga=${filters.idLiga}`;
      if (filters.categoria) url += `&categoria=${encodeURIComponent(filters.categoria)}`;
      
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) setDetailsData(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDetailsLoading(false);
    }
  };

  useEffect(() => {
    if (isInitialized && user) fetchKPIs(period, dateFrom, dateTo);
  }, [isInitialized, user, period, fetchKPIs]);

  const handlePeriodClick = (p: Period) => {
    if (p === "custom") { setShowDatePicker(true); setPendingFrom(dateFrom); setPendingTo(dateTo); return; }
    setPeriod(p);
  };

  const applyCustomDates = () => {
    setDateFrom(pendingFrom); setDateTo(pendingTo);
    setPeriod("custom"); setShowDatePicker(false);
    fetchKPIs("custom", pendingFrom, pendingTo);
  };

  const periodLabel = period === "custom" ? `${dateFrom} → ${dateTo}` : PERIODS.find(p => p.key === period)?.label ?? "";
  const timelineSlice = data?.timeline.slice(-14) ?? [];
  const maxTimeline = Math.max(...timelineSlice.map((t) => t.Total), 1);

  // KPI card config
  const kpiCards = [
    { label: "Total Recaudado", value: fmtC(data?.kpi.totalRecaudado ?? 0), sub: fmt(data?.kpi.totalRecaudado ?? 0), icon: <DollarSign size={18} className="text-blue-400" />, bg: "from-blue-600/20 to-blue-800/10", border: "border-blue-500/30", iconBg: "bg-blue-500/20 border-blue-500/20", accent: true },
    { label: "Pagos Registrados", value: (data?.kpi.totalPagos ?? 0).toLocaleString("es-MX"), sub: "transacciones", icon: <CreditCard size={18} className="text-emerald-400" />, bg: "bg-white/5", border: "border-white/10", iconBg: "bg-emerald-500/10 border-emerald-500/10", accent: false },
    { label: "Jugadores Pagantes", value: (data?.kpi.jugadoresUnicos ?? 0).toLocaleString("es-MX"), sub: "jugadores únicos", icon: <Users size={18} className="text-purple-400" />, bg: "bg-white/5", border: "border-white/10", iconBg: "bg-purple-500/10 border-purple-500/10", accent: false },
    { label: "Promedio por Pago", value: fmtC(data?.kpi.promedioPago ?? 0), sub: fmt(data?.kpi.promedioPago ?? 0), icon: <TrendingUp size={18} className="text-amber-400" />, bg: "bg-white/5", border: "border-white/10", iconBg: "bg-amber-500/10 border-amber-500/10", accent: false },
  ];

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white">
        {/* Header */}
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center sticky top-0 z-20">
          <div>
            <h1 className="text-xl font-black">Dashboard</h1>
            <p className="text-xs text-blue-300">{data?.season?.Temporada ? `Temporada ${data.season.Temporada}` : season ? `Temporada ${season}` : "Resumen ejecutivo"}</p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && <span className="text-[10px] text-slate-500">Act. {lastUpdated.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</span>}
            <button onClick={() => fetchKPIs(period, dateFrom, dateTo)} disabled={isLoading} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all" title="Actualizar">
              <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">

          {/* Period Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-black">Recaudación por Período</h2>
              <p className="text-xs text-slate-400 mt-0.5">Pagos de convocatorias — {periodLabel}</p>
            </div>
            <div className="flex gap-2 bg-white/5 p-1 rounded-2xl border border-white/10 flex-wrap">
              {PERIODS.map((p) => (
                <button key={p.key} onClick={() => handlePeriodClick(p.key)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                    period === p.key
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-[1.03]"
                      : "text-slate-400 hover:text-white hover:bg-white/8"
                  }`}>
                  {p.key === "custom" ? <Calendar size={13} /> : null}
                  {p.label}
                  {p.key === "custom" && period === "custom" && <span className="text-[9px] opacity-70 ml-1">{dateFrom.slice(5)} → {dateTo.slice(5)}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Date Picker Modal */}
          {showDatePicker && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-slate-900 border border-white/15 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-black text-white flex items-center gap-2"><Calendar size={16} className="text-blue-400" />Rango de Fechas</h3>
                  <button onClick={() => setShowDatePicker(false)} className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-all"><X size={18} /></button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Fecha Inicio</label>
                    <input type="date" value={pendingFrom} onChange={e => setPendingFrom(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all [color-scheme:dark]" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Fecha Fin</label>
                    <input type="date" value={pendingTo} onChange={e => setPendingTo(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all [color-scheme:dark]" />
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={() => setShowDatePicker(false)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 text-sm font-bold hover:bg-white/5 transition-all">Cancelar</button>
                  <button onClick={applyCustomDates} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black transition-all shadow-lg shadow-blue-500/20">Aplicar</button>
                </div>
              </div>
            </div>
          )}

          {/* Drill Down Details Modal */}
          {detailsModal.open && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[100] p-4">
              <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Modal Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                  <div className="flex items-center gap-4">
                    <div className="bg-blue-600/20 p-3 rounded-2xl border border-blue-500/20">
                      <FileText size={24} className="text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-white">{detailsModal.title}</h3>
                      <p className="text-xs text-slate-400">Detalle de pagos — {detailsModal.subtitle}</p>
                    </div>
                  </div>
                  <button onClick={() => setDetailsModal({ ...detailsModal, open: false })} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                    <X size={20} />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {isDetailsLoading ? (
                    <div className="h-full flex flex-col items-center justify-center gap-4">
                      <RefreshCw className="animate-spin text-blue-500" size={32} />
                      <p className="text-sm text-slate-400 font-bold animate-pulse">Obteniendo transacciones...</p>
                    </div>
                  ) : detailsData.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                      <Search size={48} className="opacity-20" />
                      <p className="text-lg font-bold">No se encontraron pagos</p>
                      <p className="text-sm opacity-60">No hay registros para este criterio en el período seleccionado.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-white/5">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-white/5 text-[10px] uppercase font-black text-slate-500 tracking-widest">
                            <th className="px-4 py-4">Fecha</th>
                            <th className="px-4 py-4">Jugador</th>
                            <th className="px-4 py-4">Categoría</th>
                            <th className="px-4 py-4">Sede / Liga</th>
                            <th className="px-4 py-4">Producto</th>
                            <th className="px-4 py-4 text-right">Monto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {detailsData.map((p) => (
                            <tr key={p.IdPago} className="hover:bg-white/5 transition-colors group">
                              <td className="px-4 py-4 whitespace-nowrap">
                                <p className="text-xs font-bold text-slate-300">
                                  {new Date(p.FechaPago).toLocaleDateString("es-MX", { day: '2-digit', month: 'short', year: 'numeric' })}
                                </p>
                                <p className="text-[10px] text-slate-500">{new Date(p.FechaPago).toLocaleTimeString("es-MX", { hour: '2-digit', minute: '2-digit' })}</p>
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-blue-500/10 flex items-center justify-center text-[10px] font-black text-blue-400 border border-blue-500/20">
                                    {p.Jugador.charAt(0)}
                                  </div>
                                  <div>
                                    <p className="text-xs font-black text-white">{p.Jugador}</p>
                                    <p className="text-[10px] text-slate-500">Recibo: {p.Recibo || 'N/A'}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                  {p.Categoria}
                                </span>
                              </td>
                              <td className="px-4 py-4">
                                <p className="text-[11px] font-bold text-slate-300">{p.Sede || 'Sin Sede'}</p>
                                <p className="text-[10px] text-slate-500">{p.Liga}</p>
                              </td>
                              <td className="px-4 py-4">
                                <p className="text-[11px] text-slate-400">{p.Producto}</p>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <p className="text-sm font-black text-emerald-400">{fmt(p.Pago)}</p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="p-4 bg-white/5 border-t border-white/5 flex justify-between items-center text-[11px] text-slate-500 px-8">
                  <p>Mostrando {detailsData.length} transacciones encontradas</p>
                  <p className="font-bold text-white">Total: {fmt(detailsData.reduce((acc, curr) => acc + curr.Pago, 0))}</p>
                </div>
              </div>
            </div>
          )}

          {/* KPI Cards */}
          {isLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-36 bg-white/5 rounded-2xl animate-pulse border border-white/10" />)}</div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {kpiCards.map((card) => (
                <div key={card.label} className={`relative group ${card.bg} border ${card.border} rounded-2xl p-5 overflow-hidden hover:shadow-lg transition-all`}>
                  <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/5 rounded-full blur-xl group-hover:bg-white/10 transition-all" />
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className={`${card.iconBg} p-2 rounded-xl border`}>{card.icon}</div>
                      {card.accent && <span className="text-[10px] font-black text-blue-400/70 uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">{periodLabel}</span>}
                    </div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">{card.label}</p>
                    <p className="text-3xl font-black text-white leading-none">{card.value}</p>
                    <p className="text-[10px] text-slate-500 mt-2">{card.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Timeline + Season */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div><h3 className="text-sm font-black text-white">Tendencia de Pagos (30 días)</h3><p className="text-[10px] text-slate-500 mt-0.5">Monto por día</p></div>
                <BarChart3 size={16} className="text-slate-500" />
              </div>
              {isLoading ? <div className="h-32 bg-white/5 rounded-xl animate-pulse" /> : timelineSlice.length > 0 ? (
                <div className="flex items-end gap-1 h-32">
                  {timelineSlice.map((entry, i) => {
                    const pct = Math.max((entry.Total / maxTimeline) * 100, 2);
                    const dateLabel = new Date(entry.Fecha + "T12:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1 group/bar">
                        <div className="w-full">
                          <div title={`${dateLabel}: ${fmt(entry.Total)}`} className="w-full rounded-t-sm bg-gradient-to-t from-blue-700 to-blue-400 opacity-70 group-hover/bar:opacity-100 transition-all cursor-default" style={{ height: `${pct * 1.28}px` }} />
                        </div>
                        {(i === 0 || i === Math.floor(timelineSlice.length / 2) || i === timelineSlice.length - 1) && (
                          <span className="text-[7px] text-slate-600 text-center leading-tight whitespace-nowrap">{dateLabel}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : <div className="h-32 flex items-center justify-center text-slate-500 text-sm">Sin datos en los últimos 30 días</div>}
            </div>

            <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-white/10 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="bg-blue-500/10 p-2 rounded-xl border border-blue-500/10"><Trophy size={16} className="text-blue-400" /></div>
                  <div><p className="text-xs font-black text-white">Temporada Completa</p><p className="text-[10px] text-slate-500">{data?.season?.Temporada || "Actual"}</p></div>
                </div>
                <div className="space-y-3">
                  {[
                    { label: "Total Recaudado", val: fmtC(data?.seasonSummary.TotalTemporada ?? 0), color: "text-white" },
                    { label: "Total Pagos", val: (data?.seasonSummary.TotalPagosTemporada ?? 0).toLocaleString("es-MX"), color: "text-emerald-400" },
                    { label: "Jugadores", val: (data?.seasonSummary.JugadoresTemporada ?? 0).toLocaleString("es-MX"), color: "text-purple-400" },
                  ].map(item => (
                    <div key={item.label} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                      <span className="text-[11px] text-slate-400 font-medium">{item.label}</span>
                      <span className={`text-sm font-black ${item.color}`}>{item.val}</span>
                    </div>
                  ))}
                </div>
              </div>
              {data && data.seasonSummary.TotalTemporada > 0 && (
                <div className="mt-4 pt-3 border-t border-white/5">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider">{periodLabel} / Temporada</span>
                    <span className="text-[10px] font-bold text-blue-400">{((data.kpi.totalRecaudado / data.seasonSummary.TotalTemporada) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-700" style={{ width: `${Math.min((data.kpi.totalRecaudado / data.seasonSummary.TotalTemporada) * 100, 100)}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom: By Sede + By League + By Category */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <BarSection
              title="Por Sede"
              icon={<MapPin size={14} className="text-rose-400" />}
              data={data?.bySede ?? []}
              labelKey="Sede"
              colorBase="from-rose-600 to-rose-400"
              period={periodLabel}
              onClickItem={(item) => fetchDetails({ idSede: item.IdSede }, item.Sede || 'Sede', periodLabel)}
            />
            <BarSection
              title="Por Liga"
              icon={<Trophy size={14} className="text-blue-400" />}
              data={data?.byLeague ?? []}
              labelKey="Liga"
              period={periodLabel}
              onClickItem={(item) => fetchDetails({ idLiga: item.IdLiga }, item.Liga || 'Liga', periodLabel)}
            />
            <BarSection
              title="Por Categoría"
              icon={<Users size={14} className="text-purple-400" />}
              data={data?.byCategory ?? []}
              labelKey="Categoria"
              colorBase="from-purple-600 to-purple-400"
              period={periodLabel}
              onClickItem={(item) => fetchDetails({ categoria: item.Categoria }, item.Categoria || 'Categoría', periodLabel)}
            />
          </div>

          {/* Empty state */}
          {!isLoading && data && data.kpi.totalPagos === 0 && (
            <div className="bg-white/5 border border-dashed border-white/10 rounded-2xl p-12 text-center">
              <TrendingDown size={40} className="mx-auto text-slate-600 mb-3" />
              <h3 className="text-lg font-bold text-slate-300">Sin pagos en este período</h3>
              <p className="text-sm text-slate-500 mt-1">Prueba seleccionando un período diferente o ajustando las fechas.</p>
            </div>
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}
