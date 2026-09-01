"use client";

import { useEffect, useState, useCallback } from "react";
import { useUser, usePuedeVer } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { presentarPdf } from "@/lib/pdf-preview";
import autoTable from "jspdf-autotable";
import {
  CalendarDays, RefreshCw, X, AlertCircle, MapPin, DollarSign, Calendar, Layers,
  FileSpreadsheet, FileText, ChevronRight, TrendingUp, TrendingDown, Wallet, Receipt, User,
} from "lucide-react";

interface DiaRow {
  dia: string; // YYYY-MM-DD
  ventas: number;
  numVentas: number;
  gastos: number;
  numGastos: number;
  neto: number;
}
interface Sede { IdSede: number; Sede: string; Total: number; }
type Period = "today" | "yesterday" | "week" | "month" | "custom";

interface VentaDet { IdPago: number; Dia: string; Fecha: string; Jugador: string; Producto: string; FormaPago: string; Recibo: string; Sede: string; Pago: number; }
interface GastoDet { IdEgreso: number; Dia: string; Fecha: string; Concepto: string; FormaPago: string; Sede: string; Total: number; }

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n || 0);
const fmt2 = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

const pad = (n: number) => String(n).padStart(2, "0");

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "yesterday", label: "Ayer" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
];

function periodRange(p: Period): { from: string; to: string } {
  const now = new Date();
  const d = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  if (p === "today") return { from: d(now), to: d(now) };
  if (p === "yesterday") { const y = new Date(now); y.setDate(y.getDate() - 1); return { from: d(y), to: d(y) }; }
  if (p === "week") { const off = (now.getDay() + 6) % 7; const mon = new Date(now); mon.setDate(now.getDate() - off); return { from: d(mon), to: d(now) }; }
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: d(first), to: d(now) };
}

// "2026-07-29" -> "mié 29 jul 2026" (se interpreta como local, sin corrimiento).
const diaLabel = (dia: string) => {
  const d = new Date(`${dia}T00:00:00`);
  if (isNaN(d.getTime())) return dia;
  return d.toLocaleDateString("es-MX", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
};
const fmtHora = (v: string) => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v ?? "");
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
};
const fmtFechaHora = (v: string) => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v ?? "");
  return d.toLocaleString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const sanitize = (s: string) => (s || "").replace(/[^\w-]+/g, "_").slice(0, 60);

export default function VentasPorDiaPage() {
  const { user } = useUser();
  const puedeVer = usePuedeVer("/ventas/por-dia");

  const initRange = periodRange("month");
  const [period, setPeriod] = useState<Period>("month");
  const [dateFrom, setDateFrom] = useState(initRange.from);
  const [dateTo, setDateTo] = useState(initRange.to);
  const [idSede, setIdSede] = useState<number | "all">("all");

  const [sedes, setSedes] = useState<Sede[]>([]);
  const [rows, setRows] = useState<DiaRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [exporting, setExporting] = useState(false);

  // Modal detalle del día
  const [detOpen, setDetOpen] = useState(false);
  const [detDia, setDetDia] = useState<string | null>(null);
  const [detLoading, setDetLoading] = useState(false);
  const [detVentas, setDetVentas] = useState<VentaDet[]>([]);
  const [detGastos, setDetGastos] = useState<GastoDet[]>([]);
  const [detError, setDetError] = useState<string | null>(null);

  const fetchData = useCallback(async (from: string, to: string, sede: number | "all") => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ dateFrom: from, dateTo: to });
      if (sede !== "all") params.set("idSede", String(sede));
      const res = await fetch(`/api/ventas/por-dia?${params}`);
      const json = await res.json();
      if (json.success) {
        setRows(json.data);
        setSedes(json.sedes || []);
        if (sede !== "all" && !(json.sedes || []).some((s: Sede) => s.IdSede === sede)) setIdSede("all");
        setLastUpdated(new Date());
      } else setError(json.message ?? "Error al cargar datos");
    } catch {
      setError("Error de conexión");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !puedeVer) return;
    fetchData(dateFrom, dateTo, idSede);
  }, [user, puedeVer]);

  useEffect(() => {
    if (!user || !puedeVer) return;
    fetchData(dateFrom, dateTo, idSede);
  }, [dateFrom, dateTo, idSede]);

  const handlePeriod = (p: Period) => {
    const { from, to } = periodRange(p);
    setPeriod(p);
    setDateFrom(from);
    setDateTo(to);
  };

  const openDetalle = useCallback(async (dia: string) => {
    setDetOpen(true);
    setDetDia(dia);
    setDetLoading(true);
    setDetVentas([]);
    setDetGastos([]);
    setDetError(null);
    try {
      const params = new URLSearchParams({ dia });
      if (idSede !== "all") params.set("idSede", String(idSede));
      const res = await fetch(`/api/ventas/por-dia/detalle?${params}`);
      const json = await res.json();
      if (json.success) { setDetVentas(json.ventas || []); setDetGastos(json.gastos || []); }
      else setDetError(json.message ?? "Error al cargar el detalle");
    } catch {
      setDetError("Error de conexión");
    } finally {
      setDetLoading(false);
    }
  }, [idSede]);

  const totalVentas = rows.reduce((s, r) => s + r.ventas, 0);
  const totalGastos = rows.reduce((s, r) => s + r.gastos, 0);
  const totalNeto = totalVentas - totalGastos;
  const totalNumVentas = rows.reduce((s, r) => s + r.numVentas, 0);
  const totalNumGastos = rows.reduce((s, r) => s + r.numGastos, 0);
  const grandTotalSedes = sedes.reduce((s, x) => s + x.Total, 0);
  const sedeLabel = idSede === "all" ? "Todas las sedes" : (sedes.find((s) => s.IdSede === idSede)?.Sede ?? "Sede");
  const rangoLabel = `${dateFrom} → ${dateTo}`;

  // ── Exportar resumen (grid por día) ──
  const exportResumenExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Ventas por día");
    ws.getCell("A1").value = `Ventas por día — ${sedeLabel} (${dateFrom} a ${dateTo})`;
    ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1E293B" } };
    ws.columns = [
      { key: "dia", width: 26 },
      { key: "nv", width: 12 },
      { key: "ventas", width: 16, style: { numFmt: '"$"#,##0.00' } },
      { key: "ng", width: 12 },
      { key: "gastos", width: 16, style: { numFmt: '"$"#,##0.00' } },
      { key: "neto", width: 16, style: { numFmt: '"$"#,##0.00' } },
    ];
    const header = ws.getRow(3);
    header.values = ["Día", "# Ventas", "Ventas", "# Gastos", "Gastos", "Neto"];
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } }; c.alignment = { horizontal: "center" }; });
    rows.forEach((r) => ws.addRow([diaLabel(r.dia), r.numVentas, r.ventas, r.numGastos, r.gastos, r.neto]));
    const tot = ws.addRow(["TOTAL", totalNumVentas, totalVentas, totalNumGastos, totalGastos, totalNeto]);
    tot.font = { bold: true };
    const buffer = await wb.xlsx.writeBuffer();
    triggerDownload(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `Ventas_por_dia_${dateFrom}_${dateTo}.xlsx`);
  };

  const exportResumenPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text("Ventas por día", 14, 16);
    doc.setFontSize(9); doc.setTextColor(100); doc.text(`${sedeLabel} · ${dateFrom} a ${dateTo}`, 14, 22);
    autoTable(doc, {
      startY: 27,
      head: [["Día", "# Ventas", "Ventas", "# Gastos", "Gastos", "Neto"]],
      body: rows.map((r) => [diaLabel(r.dia), String(r.numVentas), fmt2(r.ventas), String(r.numGastos), fmt2(r.gastos), fmt2(r.neto)]),
      foot: [["TOTAL", String(totalNumVentas), fmt2(totalVentas), String(totalNumGastos), fmt2(totalGastos), fmt2(totalNeto)]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [51, 65, 85] },
      footStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    });
    presentarPdf(doc, `Ventas_por_dia_${dateFrom}_${dateTo}.pdf`);
  };

  // ── Exportar detalle agrupado por día ──
  const fetchDetalleRango = async (): Promise<{ ventas: VentaDet[]; gastos: GastoDet[] } | null> => {
    const params = new URLSearchParams({ dateFrom, dateTo });
    if (idSede !== "all") params.set("idSede", String(idSede));
    const res = await fetch(`/api/ventas/por-dia/detalle?${params}`);
    const json = await res.json();
    return json.success ? { ventas: json.ventas || [], gastos: json.gastos || [] } : null;
  };

  const exportDetalleExcel = async () => {
    setExporting(true);
    try {
      const det = await fetchDetalleRango();
      if (!det) { setError("No se pudo obtener el detalle"); return; }
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Detalle por día");
      ws.getCell("A1").value = `Detalle por día — ${sedeLabel} (${dateFrom} a ${dateTo})`;
      ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1E293B" } };
      ws.columns = [{ width: 22 }, { width: 34 }, { width: 30 }, { width: 16 }, { width: 14 }, { width: 16 }];
      let ri = 3;
      const money = '"$"#,##0.00';
      for (const r of rows) {
        const vs = det.ventas.filter((v) => v.Dia === r.dia);
        const gs = det.gastos.filter((g) => g.Dia === r.dia);
        const title = ws.getRow(ri++);
        title.getCell(1).value = diaLabel(r.dia);
        title.getCell(3).value = `Ventas: ${fmt2(r.ventas)}   Gastos: ${fmt2(r.gastos)}   Neto: ${fmt2(r.neto)}`;
        title.font = { bold: true, color: { argb: "FF0F172A" } };
        title.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } }; });
        // Ventas
        const vh = ws.getRow(ri++);
        vh.values = ["Hora", "Jugador", "Producto", "Forma pago", "Recibo", "Monto"];
        vh.font = { bold: true, color: { argb: "FFFFFFFF" } };
        vh.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } }; });
        for (const v of vs) {
          const row = ws.getRow(ri++);
          row.values = [fmtHora(v.Fecha), v.Jugador, v.Producto, v.FormaPago, v.Recibo || "—", v.Pago];
          row.getCell(6).numFmt = money;
        }
        if (vs.length === 0) ws.getRow(ri++).getCell(2).value = "Sin ventas";
        // Gastos
        const gh = ws.getRow(ri++);
        gh.values = ["Hora", "Concepto", "", "Forma pago", "", "Monto"];
        gh.font = { bold: true, color: { argb: "FFFFFFFF" } };
        gh.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7C2D12" } }; });
        for (const g of gs) {
          const row = ws.getRow(ri++);
          row.values = [fmtHora(g.Fecha), g.Concepto, "", g.FormaPago, "", g.Total];
          row.getCell(6).numFmt = money;
        }
        if (gs.length === 0) ws.getRow(ri++).getCell(2).value = "Sin gastos";
        ri++; // fila en blanco entre días
      }
      const buffer = await wb.xlsx.writeBuffer();
      triggerDownload(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `Detalle_por_dia_${dateFrom}_${dateTo}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  const exportDetallePdf = async () => {
    setExporting(true);
    try {
      const det = await fetchDetalleRango();
      if (!det) { setError("No se pudo obtener el detalle"); return; }
      const doc = new jsPDF();
      doc.setFontSize(14); doc.text("Detalle de ventas por día", 14, 16);
      doc.setFontSize(9); doc.setTextColor(100); doc.text(`${sedeLabel} · ${dateFrom} a ${dateTo}`, 14, 22);
      let y = 28;
      const pageH = doc.internal.pageSize.getHeight();
      for (const r of rows) {
        const vs = det.ventas.filter((v) => v.Dia === r.dia);
        const gs = det.gastos.filter((g) => g.Dia === r.dia);
        if (y > pageH - 30) { doc.addPage(); y = 16; }
        doc.setFontSize(11); doc.setTextColor(15, 23, 42);
        doc.text(`${diaLabel(r.dia)}  ·  Ventas ${fmt2(r.ventas)} · Gastos ${fmt2(r.gastos)} · Neto ${fmt2(r.neto)}`, 14, y);
        y += 3;
        autoTable(doc, {
          startY: y,
          head: [["Hora", "Jugador", "Producto", "Forma", "Recibo", "Monto"]],
          body: vs.length ? vs.map((v) => [fmtHora(v.Fecha), v.Jugador, v.Producto, v.FormaPago, v.Recibo || "—", fmt2(v.Pago)]) : [["", "Sin ventas", "", "", "", ""]],
          styles: { fontSize: 7 }, headStyles: { fillColor: [51, 65, 85], fontSize: 7 },
          columnStyles: { 5: { halign: "right" } }, margin: { left: 14, right: 14 },
        });
        y = (doc as any).lastAutoTable.finalY + 2;
        if (y > pageH - 24) { doc.addPage(); y = 16; }
        autoTable(doc, {
          startY: y,
          head: [["Hora", "Concepto (gasto)", "Forma", "Monto"]],
          body: gs.length ? gs.map((g) => [fmtHora(g.Fecha), g.Concepto, g.FormaPago, fmt2(g.Total)]) : [["", "Sin gastos", "", ""]],
          styles: { fontSize: 7 }, headStyles: { fillColor: [124, 45, 18], fontSize: 7 },
          columnStyles: { 3: { halign: "right" } }, margin: { left: 14, right: 14 },
        });
        y = (doc as any).lastAutoTable.finalY + 6;
      }
      presentarPdf(doc, `Detalle_por_dia_${dateFrom}_${dateTo}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white">

        {/* ── Header ── */}
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 sticky top-0 z-20">
          <div>
            <h1 className="text-xl font-black flex items-center gap-2">
              <CalendarDays size={20} className="text-blue-400" />
              Ventas por Día
            </h1>
            <p className="text-xs text-blue-300 mt-0.5">{sedeLabel} · {rangoLabel}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {lastUpdated && (
              <span className="text-[10px] text-slate-500 hidden md:inline">
                Act.&nbsp;{lastUpdated.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <ExportGroup label="Resumen" disabled={isLoading || rows.length === 0 || exporting} onExcel={exportResumenExcel} onPdf={exportResumenPdf} />
            <ExportGroup label="Detalle" disabled={isLoading || rows.length === 0 || exporting} onExcel={exportDetalleExcel} onPdf={exportDetallePdf} />
            <button onClick={() => fetchData(dateFrom, dateTo, idSede)} disabled={isLoading}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all" title="Actualizar">
              <RefreshCw size={15} className={isLoading || exporting ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="p-6 md:p-8 space-y-6">

          {/* ── Filtros: período + rango de fechas ── */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex gap-2 bg-white/5 p-1 rounded-2xl border border-white/10 flex-wrap">
              {PERIODS.map((p) => (
                <button key={p.key} onClick={() => handlePeriod(p.key)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                    period === p.key ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-[1.03]" : "text-slate-400 hover:text-white hover:bg-white/8"
                  }`}>{p.label}</button>
              ))}
              <button onClick={() => setPeriod("custom")}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                  period === "custom" ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-[1.03]" : "text-slate-400 hover:text-white hover:bg-white/8"
                }`}><Calendar size={13} /> Personalizado</button>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Desde</label>
              <div className="relative">
                <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input type="date" value={dateFrom} max={dateTo} onChange={(e) => { setPeriod("custom"); setDateFrom(e.target.value); }}
                  className="bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all [color-scheme:dark]" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Hasta</label>
              <div className="relative">
                <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input type="date" value={dateTo} min={dateFrom} onChange={(e) => { setPeriod("custom"); setDateTo(e.target.value); }}
                  className="bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all [color-scheme:dark]" />
              </div>
            </div>
          </div>

          {/* ── Cards de sede ── */}
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setIdSede("all")}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${
                idSede === "all" ? "bg-blue-600/20 border-blue-500/40 scale-[1.02] shadow-lg shadow-blue-500/10" : "bg-white/5 border-white/10 hover:bg-white/8 hover:border-white/20"
              }`}>
              <div className={`p-2 rounded-xl border ${idSede === "all" ? "bg-blue-500/20 border-blue-500/30" : "bg-white/5 border-white/10"}`}>
                <Layers size={16} className={idSede === "all" ? "text-blue-300" : "text-slate-400"} />
              </div>
              <div><p className={`text-sm font-black ${idSede === "all" ? "text-white" : "text-slate-300"}`}>Todas</p>
                <p className="text-[10px] text-slate-500 tabular-nums">{fmt(grandTotalSedes)}</p></div>
            </button>
            {sedes.map((s) => {
              const active = idSede === s.IdSede;
              return (
                <button key={s.IdSede} onClick={() => setIdSede(s.IdSede)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${
                    active ? "bg-blue-600/20 border-blue-500/40 scale-[1.02] shadow-lg shadow-blue-500/10" : "bg-white/5 border-white/10 hover:bg-white/8 hover:border-white/20"
                  }`}>
                  <div className={`p-2 rounded-xl border ${active ? "bg-blue-500/20 border-blue-500/30" : "bg-white/5 border-white/10"}`}>
                    <MapPin size={16} className={active ? "text-blue-300" : "text-slate-400"} />
                  </div>
                  <div><p className={`text-sm font-black ${active ? "text-white" : "text-slate-300"}`}>{s.Sede}</p>
                    <p className="text-[10px] text-slate-500 tabular-nums">{fmt(s.Total)}</p></div>
                </button>
              );
            })}
          </div>

          {/* ── KPIs ── */}
          {!isLoading && rows.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total Ventas", value: fmt2(totalVentas), icon: <TrendingUp size={16} className="text-emerald-400" />, ibg: "bg-emerald-500/10 border-emerald-500/20" },
                { label: "Total Gastos", value: fmt2(totalGastos), icon: <TrendingDown size={16} className="text-rose-400" />, ibg: "bg-rose-500/10 border-rose-500/20" },
                { label: "Neto", value: fmt2(totalNeto), icon: <Wallet size={16} className="text-blue-400" />, ibg: "bg-blue-500/10 border-blue-500/20" },
                { label: "Días", value: rows.length.toString(), icon: <CalendarDays size={16} className="text-purple-400" />, ibg: "bg-purple-500/10 border-purple-500/20" },
              ].map((c) => (
                <div key={c.label} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-start gap-3">
                  <div className={`p-2 rounded-xl border flex-shrink-0 ${c.ibg}`}>{c.icon}</div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{c.label}</p>
                    <p className="text-base font-black text-white truncate tabular-nums">{c.value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Estados ── */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-28 gap-4">
              <div className="w-14 h-14 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
              <p className="text-sm text-slate-400 font-bold animate-pulse">Cargando ventas por día...</p>
            </div>
          )}
          {!isLoading && error && (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-rose-400">
              <AlertCircle size={44} className="opacity-60" />
              <p className="text-base font-black">{error}</p>
              <button onClick={() => fetchData(dateFrom, dateTo, idSede)} className="mt-2 px-5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm font-bold hover:bg-rose-500/20 transition-all">Reintentar</button>
            </div>
          )}
          {!isLoading && !error && rows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-500">
              <AlertCircle size={48} className="opacity-20" />
              <p className="text-lg font-black">Sin movimientos</p>
              <p className="text-sm opacity-60">No hay ventas ni gastos en el período seleccionado.</p>
            </div>
          )}

          {/* ── Grid por día ── */}
          {!isLoading && !error && rows.length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 text-[9px] uppercase font-black text-slate-500 tracking-widest border-b border-white/10">
                      <th className="px-4 py-3">Día</th>
                      <th className="px-4 py-3 text-right"># Ventas</th>
                      <th className="px-4 py-3 text-right">Ventas</th>
                      <th className="px-4 py-3 text-right"># Gastos</th>
                      <th className="px-4 py-3 text-right">Gastos</th>
                      <th className="px-4 py-3 text-right">Neto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {rows.map((r) => (
                      <tr key={r.dia} onClick={() => openDetalle(r.dia)}
                        className="hover:bg-white/5 transition-colors cursor-pointer group">
                        <td className="px-4 py-3 text-sm font-bold text-slate-200 group-hover:text-white capitalize flex items-center gap-1.5">
                          {diaLabel(r.dia)}
                          <ChevronRight size={13} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-all" />
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-bold text-slate-500 tabular-nums">{r.numVentas.toLocaleString("es-MX")}</td>
                        <td className="px-4 py-3 text-right text-sm font-black text-emerald-400 tabular-nums">{fmt2(r.ventas)}</td>
                        <td className="px-4 py-3 text-right text-xs font-bold text-slate-500 tabular-nums">{r.numGastos.toLocaleString("es-MX")}</td>
                        <td className="px-4 py-3 text-right text-sm font-black text-rose-400 tabular-nums">{fmt2(r.gastos)}</td>
                        <td className={`px-4 py-3 text-right text-sm font-black tabular-nums ${r.neto >= 0 ? "text-white" : "text-amber-400"}`}>{fmt2(r.neto)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-white/5 border-t border-white/10 text-sm font-black">
                      <td className="px-4 py-3 text-white uppercase tracking-wider">Total</td>
                      <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{totalNumVentas.toLocaleString("es-MX")}</td>
                      <td className="px-4 py-3 text-right text-emerald-400 tabular-nums">{fmt2(totalVentas)}</td>
                      <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{totalNumGastos.toLocaleString("es-MX")}</td>
                      <td className="px-4 py-3 text-right text-rose-400 tabular-nums">{fmt2(totalGastos)}</td>
                      <td className="px-4 py-3 text-right text-white tabular-nums">{fmt2(totalNeto)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-[11px] text-slate-500 px-4 py-2">Haz clic en un día para ver el detalle de ventas y gastos.</p>
            </div>
          )}
        </div>

        {/* ── Modal: detalle del día ── */}
        {detOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[130] p-4" onClick={() => setDetOpen(false)}>
            <div className="bg-[#0f172a] border border-white/15 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
              <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-600/20 p-2.5 rounded-xl border border-blue-500/20"><CalendarDays size={20} className="text-blue-400" /></div>
                  <div>
                    <h3 className="text-base font-black text-white capitalize">{detDia ? diaLabel(detDia) : ""}</h3>
                    <p className="text-[10px] text-slate-400">{sedeLabel}</p>
                  </div>
                </div>
                <button onClick={() => setDetOpen(false)} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all"><X size={18} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {detLoading ? (
                  <div className="h-56 flex flex-col items-center justify-center gap-4">
                    <RefreshCw className="animate-spin text-blue-500" size={28} />
                    <p className="text-sm text-slate-400 font-bold animate-pulse">Cargando detalle...</p>
                  </div>
                ) : detError ? (
                  <div className="h-56 flex flex-col items-center justify-center gap-3 text-rose-400">
                    <AlertCircle size={40} className="opacity-60" /><p className="text-base font-black">{detError}</p>
                  </div>
                ) : (
                  <>
                    {/* Ventas */}
                    <div>
                      <h4 className="text-xs font-black text-emerald-300 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <TrendingUp size={14} /> Ventas ({detVentas.length}) · {fmt2(detVentas.reduce((s, v) => s + v.Pago, 0))}
                      </h4>
                      {detVentas.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">Sin ventas este día.</p>
                      ) : (
                        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead><tr className="bg-white/5 text-[9px] uppercase font-black text-slate-500 tracking-widest border-b border-white/5">
                              <th className="px-4 py-2.5">Hora</th><th className="px-4 py-2.5">Jugador</th><th className="px-4 py-2.5">Producto</th>
                              <th className="px-4 py-2.5">Forma</th><th className="px-4 py-2.5">Recibo</th><th className="px-4 py-2.5 text-right">Monto</th>
                            </tr></thead>
                            <tbody className="divide-y divide-white/5 text-slate-300">
                              {detVentas.map((v) => (
                                <tr key={v.IdPago} className="hover:bg-white/5 transition-colors text-xs">
                                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-400 tabular-nums">{fmtHora(v.Fecha)}</td>
                                  <td className="px-4 py-2.5 font-bold text-white">{v.Jugador}</td>
                                  <td className="px-4 py-2.5 text-slate-400">{v.Producto}</td>
                                  <td className="px-4 py-2.5 whitespace-nowrap text-[10px] font-black text-slate-400">{v.FormaPago}</td>
                                  <td className="px-4 py-2.5 text-slate-500 tabular-nums">{v.Recibo || "—"}</td>
                                  <td className="px-4 py-2.5 text-right font-black text-emerald-400 tabular-nums whitespace-nowrap">{fmt2(v.Pago)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                    {/* Gastos */}
                    <div>
                      <h4 className="text-xs font-black text-rose-300 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <Receipt size={14} /> Gastos ({detGastos.length}) · {fmt2(detGastos.reduce((s, g) => s + g.Total, 0))}
                      </h4>
                      {detGastos.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">Sin gastos este día.</p>
                      ) : (
                        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead><tr className="bg-white/5 text-[9px] uppercase font-black text-slate-500 tracking-widest border-b border-white/5">
                              <th className="px-4 py-2.5">Hora</th><th className="px-4 py-2.5">Concepto</th><th className="px-4 py-2.5">Forma</th><th className="px-4 py-2.5 text-right">Monto</th>
                            </tr></thead>
                            <tbody className="divide-y divide-white/5 text-slate-300">
                              {detGastos.map((g) => (
                                <tr key={g.IdEgreso} className="hover:bg-white/5 transition-colors text-xs">
                                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-400 tabular-nums">{fmtHora(g.Fecha)}</td>
                                  <td className="px-4 py-2.5 font-bold text-white">{g.Concepto}</td>
                                  <td className="px-4 py-2.5 whitespace-nowrap text-[10px] font-black text-slate-400">{g.FormaPago}</td>
                                  <td className="px-4 py-2.5 text-right font-black text-rose-400 tabular-nums whitespace-nowrap">{fmt2(g.Total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="p-4 bg-white/5 border-t border-white/10 flex flex-wrap justify-between items-center gap-2 text-[11px] px-6">
                <span className="text-slate-500">{fmtFechaHora(detVentas[0]?.Fecha || "")}</span>
                <p className="font-black text-white">
                  Ventas <span className="text-emerald-400">{fmt2(detVentas.reduce((s, v) => s + v.Pago, 0))}</span> ·
                  Gastos <span className="text-rose-400"> {fmt2(detGastos.reduce((s, g) => s + g.Total, 0))}</span> ·
                  Neto <span className="text-white"> {fmt2(detVentas.reduce((s, v) => s + v.Pago, 0) - detGastos.reduce((s, g) => s + g.Total, 0))}</span>
                </p>
              </div>
            </div>
          </div>
        )}
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
