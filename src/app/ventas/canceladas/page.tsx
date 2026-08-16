"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser, usePuedeVer } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Ban, Search, RefreshCw, Calendar, X,
  Wallet, CreditCard, Receipt, MapPin, TrendingDown, Layers,
  FileSpreadsheet, FileText,
} from "lucide-react";

type Period = "today" | "yesterday" | "week" | "month" | "all";

interface SaleCancelada {
  IdVenta: number;
  FechaVenta: string;
  IdJugador: number | null;
  Jugador: string;
  ConceptoVenta: string;
  Total: number;
  Status: number;
  IdSede: number | null;
  Sede: string | null;
  FormaPago: string;
  Recibo: string;
  Referencia: string;
}

interface Sede {
  IdSede: number;
  Sede: string;
  Num: number;
  Total: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const fmt0 = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n || 0);
const fmtFechaHora = (v: string) => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v ?? "");
  return d.toLocaleString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  week: "Esta Semana",
  month: "Este Mes",
  all: "Rango personalizado",
};

export default function VentasCanceladasPage() {
  const router = useRouter();
  const { user, isInitialized, season } = useUser();
  const puedeVer = usePuedeVer("/ventas/canceladas");

  // Cancelled Sales List State
  const [sales, setSales] = useState<SaleCancelada[]>([]);
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
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (isInitialized && !user) router.push("/login");
  }, [user, isInitialized, router]);

  // Fetch Cancelled Sales (el endpoint también regresa las sedes con cancelaciones
  // en el rango, para las tarjetas de filtro)
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

      const res = await fetch(`/api/ventas/canceladas?${params}`);
      const json = await res.json();
      if (json.success) {
        setSales(json.data);
        const nuevasSedes: Sede[] = json.sedes || [];
        setSedes(nuevasSedes);
        // Si la sede seleccionada ya no tiene cancelaciones en el rango, regresa a "Todas".
        if (selectedSedeFilter && !nuevasSedes.some(s => String(s.IdSede) === selectedSedeFilter)) {
          setSelectedSedeFilter("");
        }
        setLastUpdated(new Date());
      }
    } catch (e) {
      console.error("Error loading cancelled sales:", e);
    } finally {
      setIsLoading(false);
    }
  }, [period, selectedSedeFilter, searchQuery, dateFrom, dateTo]);

  // Sin el permiso, DashboardLayout pinta "Sin acceso": no hay nada que pedir.
  useEffect(() => {
    if (user && puedeVer) {
      fetchSales();
    }
  }, [user, puedeVer, fetchSales]);

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

  // KPIs Calculations
  const grandTotalSedes = sedes.reduce((acc, s) => acc + s.Total, 0);
  const totalNumSedes = sedes.reduce((acc, s) => acc + s.Num, 0);
  const totalCancelado = sales.reduce((acc, s) => acc + s.Total, 0);
  const totalEfectivo = sales.filter(s => s.FormaPago === "EFECTIVO").reduce((acc, s) => acc + s.Total, 0);
  const totalTarjeta = sales.filter(s => s.FormaPago === "TARJETA").reduce((acc, s) => acc + s.Total, 0);
  const totalTransferencia = sales.filter(s => s.FormaPago === "TRANSFERENCIA").reduce((acc, s) => acc + s.Total, 0);

  // ── Exportación ──
  const sedeLabel = selectedSedeFilter === ""
    ? "Todas las sedes"
    : (sedes.find(s => String(s.IdSede) === selectedSedeFilter)?.Sede ?? "Sede");
  const rangoLabel = period === "all" && dateFrom && dateTo
    ? `${dateFrom} a ${dateTo}`
    : PERIOD_LABELS[period];
  const fileSuffix = period === "all" && dateFrom && dateTo ? `${dateFrom}_${dateTo}` : period;
  const reciboRef = (s: SaleCancelada) => (s.Recibo ? `Recibo: ${s.Recibo}` : s.Referencia ? `Ref: ${s.Referencia}` : "—");

  const exportExcel = async () => {
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Ventas canceladas");
      ws.getCell("A1").value = `Ventas canceladas — ${sedeLabel} (${rangoLabel})`;
      ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF7F1D1D" } };
      ws.columns = [
        { key: "fecha", width: 18 },
        { key: "comprador", width: 32 },
        { key: "concepto", width: 34 },
        { key: "sede", width: 20 },
        { key: "forma", width: 16 },
        { key: "recibo", width: 18 },
        { key: "total", width: 14, style: { numFmt: '"$"#,##0.00' } },
      ];
      const header = ws.getRow(3);
      header.values = ["Fecha", "Comprador", "Concepto / Producto", "Sede", "Forma de pago", "Folio / Recibo", "Total"];
      header.font = { bold: true, color: { argb: "FFFFFFFF" } };
      header.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF991B1B" } };
        c.alignment = { horizontal: "center" };
      });
      sales.forEach((s) => {
        ws.addRow([fmtFechaHora(s.FechaVenta), s.Jugador, s.ConceptoVenta, s.Sede || "—", s.FormaPago, reciboRef(s), s.Total]);
      });
      const tot = ws.addRow([`TOTAL (${sales.length} cancelaciones)`, "", "", "", "", "", totalCancelado]);
      tot.font = { bold: true, color: { argb: "FF7F1D1D" } };
      const buffer = await wb.xlsx.writeBuffer();
      triggerDownload(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `Ventas_canceladas_${fileSuffix}.xlsx`
      );
    } finally {
      setExporting(false);
    }
  };

  const exportPdf = () => {
    setExporting(true);
    try {
      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.text("Ventas canceladas", 14, 16);
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`${sedeLabel} · ${rangoLabel}`, 14, 22);
      autoTable(doc, {
        startY: 27,
        head: [["Fecha", "Comprador", "Concepto / Producto", "Sede", "Forma", "Folio / Recibo", "Total"]],
        body: sales.map((s) => [fmtFechaHora(s.FechaVenta), s.Jugador, s.ConceptoVenta, s.Sede || "—", s.FormaPago, reciboRef(s), fmt(s.Total)]),
        foot: [[`TOTAL (${sales.length} cancelaciones)`, "", "", "", "", "", fmt(totalCancelado)]],
        styles: { fontSize: 7 },
        headStyles: { fillColor: [153, 27, 27], fontSize: 7 },
        footStyles: { fillColor: [69, 10, 10], textColor: 255, fontStyle: "bold" },
        columnStyles: { 6: { halign: "right" } },
        margin: { left: 14, right: 14 },
      });
      doc.save(`Ventas_canceladas_${fileSuffix}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white">

        {/* HEADER */}
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <div className="bg-red-600/20 p-2.5 rounded-xl border border-red-500/20">
              <Ban size={20} className="text-red-400" />
            </div>
            <div>
              <h1 className="text-xl font-black">Ventas Canceladas</h1>
              <p className="text-xs text-red-300">{season ? `Temporada ${season}` : "Administración de Ventas"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-[10px] text-slate-500">
                Act. {lastUpdated.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <ExportGroup label="Exportar" disabled={isLoading || sales.length === 0 || exporting} onExcel={exportExcel} onPdf={exportPdf} />
            <button
              onClick={fetchSales}
              disabled={isLoading}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all"
            >
              <RefreshCw size={15} className={isLoading || exporting ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* CONTAINER */}
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">

          {/* KPI CARDS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Cancelado", value: fmt(totalCancelado), desc: `${sales.length} cancelaciones`, icon: <TrendingDown size={16} className="text-red-400" />, bg: "bg-red-500/10 border-red-500/20" },
              { label: "Efectivo", value: fmt(totalEfectivo), desc: "Cancelado en efectivo", icon: <Wallet size={16} className="text-blue-400" />, bg: "bg-blue-500/10 border-blue-500/20" },
              { label: "Tarjeta", value: fmt(totalTarjeta), desc: "Cancelado con terminal", icon: <CreditCard size={16} className="text-purple-400" />, bg: "bg-purple-500/10 border-purple-500/20" },
              { label: "Transferencia", value: fmt(totalTransferencia), desc: "Cancelado por depósito", icon: <Receipt size={16} className="text-amber-400" />, bg: "bg-amber-500/10 border-amber-500/20" }
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
            {/* Search Input */}
            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <div className="relative group flex-1 sm:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-red-400 transition-colors" size={16} />
                <input
                  type="text"
                  placeholder="Buscar comprador (jugador)..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && fetchSales()}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 outline-none focus:bg-white/10 focus:border-red-500/50 transition-all text-sm text-white placeholder-slate-400"
                />
              </div>
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
                      ? "bg-red-600 text-white shadow shadow-red-500/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* SEDE CARDS */}
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setSelectedSedeFilter("")}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${
                selectedSedeFilter === "" ? "bg-red-600/20 border-red-500/40 scale-[1.02] shadow-lg shadow-red-500/10" : "bg-white/5 border-white/10 hover:bg-white/8 hover:border-white/20"
              }`}>
              <div className={`p-2 rounded-xl border ${selectedSedeFilter === "" ? "bg-red-500/20 border-red-500/30" : "bg-white/5 border-white/10"}`}>
                <Layers size={16} className={selectedSedeFilter === "" ? "text-red-300" : "text-slate-400"} />
              </div>
              <div>
                <p className={`text-sm font-black ${selectedSedeFilter === "" ? "text-white" : "text-slate-300"}`}>Todas</p>
                <p className="text-[10px] text-slate-500 tabular-nums">{fmt0(grandTotalSedes)} · {totalNumSedes} canc.</p>
              </div>
            </button>
            {sedes.map(s => {
              const active = selectedSedeFilter === String(s.IdSede);
              return (
                <button key={s.IdSede} onClick={() => setSelectedSedeFilter(String(s.IdSede))}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${
                    active ? "bg-red-600/20 border-red-500/40 scale-[1.02] shadow-lg shadow-red-500/10" : "bg-white/5 border-white/10 hover:bg-white/8 hover:border-white/20"
                  }`}>
                  <div className={`p-2 rounded-xl border ${active ? "bg-red-500/20 border-red-500/30" : "bg-white/5 border-white/10"}`}>
                    <MapPin size={16} className={active ? "text-red-300" : "text-slate-400"} />
                  </div>
                  <div>
                    <p className={`text-sm font-black ${active ? "text-white" : "text-slate-300"}`}>{s.Sede}</p>
                    <p className="text-[10px] text-slate-500 tabular-nums">{fmt0(s.Total)} · {s.Num} canc.</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* DATE PICKER MODAL (FOR CUSTOM RANGE) */}
          {showDatePicker && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[130] p-4">
              <div className="bg-slate-900 border border-white/15 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <Calendar size={16} className="text-red-400" />
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
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-red-500/60 focus:bg-white/10 transition-all [color-scheme:dark]" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Hasta</label>
                    <input type="date" value={pendingTo} onChange={e => setPendingTo(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-red-500/60 focus:bg-white/10 transition-all [color-scheme:dark]" />
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={() => setShowDatePicker(false)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 text-sm font-bold hover:bg-white/5 transition-all">Cancelar</button>
                  <button onClick={applyCustomDates} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-black transition-all shadow-lg shadow-red-500/20">Aplicar</button>
                </div>
              </div>
            </div>
          )}

          {/* CANCELLED SALES TABLE */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
              <div className="w-10 h-10 rounded-full border-4 border-red-500/20 border-t-red-500 animate-spin" />
              <p className="text-xs font-bold text-slate-500 animate-pulse">Cargando ventas canceladas...</p>
            </div>
          ) : sales.length === 0 ? (
            <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">
              <Ban size={40} className="mx-auto text-slate-600 mb-4" />
              <h3 className="text-base font-bold text-slate-300">No hay ventas canceladas</h3>
              <p className="text-xs text-slate-500 mt-2">No se encontraron cancelaciones para los filtros aplicados en este período.</p>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
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
                      <th className="px-5 py-4">Estatus</th>
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
                        <td className="px-5 py-3.5 text-xs">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border tracking-wide whitespace-nowrap bg-red-500/10 border-red-500/20 text-red-400">
                            <Ban size={10} />
                            CANCELADA
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-black text-red-400 text-xs tabular-nums whitespace-nowrap line-through decoration-red-400/50">
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

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Grupo de exportación: etiqueta + botón Excel + botón PDF.
function ExportGroup({ label, disabled, onExcel, onPdf }: { label: string; disabled?: boolean; onExcel: () => void; onPdf: () => void }) {
  return (
    <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl pl-2.5 pr-1 py-1">
      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 hidden sm:inline">{label}</span>
      <button onClick={onExcel} disabled={disabled} title={`${label}: Excel`}
        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-200 text-[11px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed">
        <FileSpreadsheet size={13} /> Excel
      </button>
      <button onClick={onPdf} disabled={disabled} title={`${label}: PDF`}
        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-200 text-[11px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed">
        <FileText size={13} /> PDF
      </button>
    </div>
  );
}
