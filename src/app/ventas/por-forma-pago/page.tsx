"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useUser, usePuedeVer } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import ExcelJS from "exceljs";
import {
  CreditCard, RefreshCw, X, AlertCircle, MapPin, DollarSign, Package,
  Calendar, ChevronRight, Layers, FileSpreadsheet, User, Receipt, Search,
} from "lucide-react";

interface FormaRow {
  IdFormaPago: number;
  FormaPago: string;
  Cantidad: number;
  Total: number;
}
interface Sede { IdSede: number; Sede: string; Total: number; }
type Period = "today" | "yesterday" | "week" | "month" | "custom";
interface DetalleRow {
  IdProducto: number;
  Producto: string;
  Cantidad: number;
  Total: number;
}
interface JugRow {
  IdPago: number;
  Fecha: string;
  Jugador: string;
  Producto: string;
  Mes: number;
  FormaPago: string;
  Recibo: string;
  Sede: string;
  Pago: number;
}

// Paleta por forma de pago (cada forma un color distinto; cicla si hay muchas).
const PALETTE = ["#10b981", "#3b82f6", "#f59e0b", "#a855f7", "#06b6d4", "#f43f5e", "#84cc16", "#ec4899", "#14b8a6", "#f97316", "#8b5cf6", "#eab308"];
const colorFor = (idx: number) => PALETTE[idx % PALETTE.length];

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

// Convierte un período rápido en un rango de fechas (hora local).
function periodRange(p: Period): { from: string; to: string } {
  const now = new Date();
  const d = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  if (p === "today") return { from: d(now), to: d(now) };
  if (p === "yesterday") { const y = new Date(now); y.setDate(y.getDate() - 1); return { from: d(y), to: d(y) }; }
  if (p === "week") { const off = (now.getDay() + 6) % 7; const mon = new Date(now); mon.setDate(now.getDate() - off); return { from: d(mon), to: d(now) }; }
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: d(first), to: d(now) };
}

const sanitize = (s: string) => (s || "").replace(/[^\w-]+/g, "_").slice(0, 60);

const fmtFechaHora = (v: string) => {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

interface XCol { header: string; key: string; width: number; money?: boolean; }
async function downloadExcel(sheet: string, title: string, cols: XCol[], data: Record<string, any>[], filename: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  const t = ws.getCell("A1");
  t.value = title;
  t.font = { bold: true, size: 14, color: { argb: "FF1E293B" } };
  ws.columns = cols.map((c) =>
    c.money ? { key: c.key, width: c.width, style: { numFmt: '"$"#,##0.00' } } : { key: c.key, width: c.width }
  );
  const header = ws.getRow(3);
  header.values = cols.map((c) => c.header);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  data.forEach((r) => {
    const row = ws.addRow(cols.map((c) => r[c.key]));
    row.eachCell((cell) => { cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } }; });
  });
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Treemap squarificado (rectángulos proporcionales al Total) ──
interface TreeInput { value: number; data: FormaRow; }
interface TreeRect { x: number; y: number; w: number; h: number; data: FormaRow; }

function squarify(items: TreeInput[], width: number, height: number): TreeRect[] {
  const valid = items.filter((i) => i.value > 0);
  const total = valid.reduce((s, i) => s + i.value, 0);
  if (total <= 0 || width <= 0 || height <= 0) return [];
  const scale = (width * height) / total;
  const nodes = valid.map((i) => ({ area: i.value * scale, data: i.data }));

  const result: TreeRect[] = [];
  let x = 0, y = 0, w = width, h = height;
  let row: { area: number; data: FormaRow }[] = [];
  let i = 0;

  const worst = (r: typeof row, len: number) => {
    if (r.length === 0 || len <= 0) return Infinity;
    let sum = 0, mn = Infinity, mx = 0;
    for (const it of r) { sum += it.area; if (it.area < mn) mn = it.area; if (it.area > mx) mx = it.area; }
    const s2 = sum * sum, l2 = len * len;
    return Math.max((l2 * mx) / s2, s2 / (l2 * mn));
  };

  const layoutRow = (r: typeof row) => {
    const len = Math.min(w, h);
    const rowArea = r.reduce((s, it) => s + it.area, 0);
    const thickness = rowArea / len;
    if (w >= h) {
      let oy = y;
      for (const it of r) { const rh = it.area / thickness; result.push({ x, y: oy, w: thickness, h: rh, data: it.data }); oy += rh; }
      x += thickness; w -= thickness;
    } else {
      let ox = x;
      for (const it of r) { const rw = it.area / thickness; result.push({ x: ox, y, w: rw, h: thickness, data: it.data }); ox += rw; }
      y += thickness; h -= thickness;
    }
  };

  while (i < nodes.length) {
    const len = Math.min(w, h);
    const next = nodes[i];
    if (row.length === 0 || worst(row, len) >= worst([...row, next], len)) { row.push(next); i++; }
    else { layoutRow(row); row = []; }
  }
  if (row.length) layoutRow(row);
  return result;
}

export default function VentasPorFormaPagoPage() {
  const { user } = useUser();
  const puedeVer = usePuedeVer("/ventas/por-forma-pago");

  const initRange = periodRange("month");
  const [period, setPeriod] = useState<Period>("month");
  const [dateFrom, setDateFrom] = useState(initRange.from);
  const [dateTo, setDateTo] = useState(initRange.to);
  const [idSede, setIdSede] = useState<number | "all">("all");

  const [sedes, setSedes] = useState<Sede[]>([]);
  const [rows, setRows] = useState<FormaRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Modal detalle (por producto)
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detalleForma, setDetalleForma] = useState<FormaRow | null>(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalleData, setDetalleData] = useState<DetalleRow[]>([]);
  const [detalleError, setDetalleError] = useState<string | null>(null);

  // Modal detalle por jugador (tercer nivel)
  const [jugOpen, setJugOpen] = useState(false);
  const [jugLoading, setJugLoading] = useState(false);
  const [jugData, setJugData] = useState<JugRow[]>([]);
  const [jugError, setJugError] = useState<string | null>(null);
  const [jugTitle, setJugTitle] = useState("");
  // Cuando el detalle es el "Total" del grid, el pie muestra el total/conteo real
  // (del grid) en vez de sumar solo las filas cargadas (que van limitadas).
  const [jugOverride, setJugOverride] = useState<{ total: number; count: number } | null>(null);
  const [jugQuery, setJugQuery] = useState("");

  // Treemap width — callback ref para re-medir cada vez que el contenedor (re)monta.
  const [treeW, setTreeW] = useState(0);
  const roRef = useRef<ResizeObserver | null>(null);
  const TREE_H = 380;

  const treeRefCb = useCallback((node: HTMLDivElement | null) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    if (node) {
      const measure = () => { const w = node.clientWidth; if (w > 0) setTreeW(w); };
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(node);
      roRef.current = ro;
    }
  }, []);

  const fetchData = useCallback(async (from: string, to: string, sede: number | "all") => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ dateFrom: from, dateTo: to });
      if (sede !== "all") params.set("idSede", String(sede));
      const res = await fetch(`/api/ventas/por-forma-pago?${params}`);
      const json = await res.json();
      if (json.success) {
        setRows(json.data);
        setSedes(json.sedes || []);
        // Si la sede seleccionada ya no tiene ventas en el período, volvemos a "Todas"
        if (sede !== "all" && !(json.sedes || []).some((s: Sede) => s.IdSede === sede)) {
          setIdSede("all");
        }
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

  const handlePeriod = (p: Period) => {
    const { from, to } = periodRange(p);
    setPeriod(p);
    setDateFrom(from);
    setDateTo(to);
  };

  useEffect(() => {
    if (!user || !puedeVer) return;
    fetchData(dateFrom, dateTo, idSede);
  }, [dateFrom, dateTo, idSede]);

  const openDetalle = useCallback(async (forma: FormaRow) => {
    setDetalleOpen(true);
    setDetalleForma(forma);
    setDetalleLoading(true);
    setDetalleData([]);
    setDetalleError(null);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo, idFormaPago: String(forma.IdFormaPago) });
      if (idSede !== "all") params.set("idSede", String(idSede));
      const res = await fetch(`/api/ventas/por-forma-pago/detalle?${params}`);
      const json = await res.json();
      if (json.success) { setDetalleData(json.data); }
      else setDetalleError(json.message ?? "Error al cargar el detalle");
    } catch {
      setDetalleError("Error de conexión");
    } finally {
      setDetalleLoading(false);
    }
  }, [dateFrom, dateTo, idSede]);

  // Carga el detalle por jugador con filtros arbitrarios (forma de pago, producto,
  // o ninguno para "Total"). `override` fija el total/conteo del pie.
  const fetchJugadores = useCallback(async (
    extra: Record<string, string>,
    title: string,
    override: { total: number; count: number } | null,
  ) => {
    setJugTitle(title);
    setJugOverride(override);
    setJugQuery("");
    setJugOpen(true);
    setJugLoading(true);
    setJugData([]);
    setJugError(null);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo, ...extra });
      if (idSede !== "all") params.set("idSede", String(idSede));
      const res = await fetch(`/api/ventas/por-forma-pago/jugadores?${params}`);
      const json = await res.json();
      if (json.success) setJugData(json.data);
      else setJugError(json.message ?? "Error al cargar el detalle por jugador");
    } catch {
      setJugError("Error de conexión");
    } finally {
      setJugLoading(false);
    }
  }, [dateFrom, dateTo, idSede]);

  const openJugadores = useCallback((d: DetalleRow, forma: FormaRow) => {
    fetchJugadores(
      { idFormaPago: String(forma.IdFormaPago), idProducto: String(d.IdProducto) },
      `${forma.FormaPago} · ${d.Producto}`,
      null,
    );
  }, [fetchJugadores]);

  // Búsqueda dentro del detalle por jugador: por jugador, producto o forma de pago.
  const jq = jugQuery.trim().toLowerCase();
  const filteredJug = jq
    ? jugData.filter((j) =>
        (j.Jugador ?? "").toLowerCase().includes(jq) ||
        (j.Producto ?? "").toLowerCase().includes(jq) ||
        (j.FormaPago ?? "").toLowerCase().includes(jq))
    : jugData;
  const jugTotal = filteredJug.reduce((s, j) => s + j.Pago, 0);

  // ── Exportaciones a Excel ──
  const exportResumen = () => {
    const cols: XCol[] = [
      { header: "Forma de pago", key: "forma", width: 30 },
      { header: "Cantidad", key: "cant", width: 12 },
      { header: "Total", key: "total", width: 18, money: true },
      { header: "%", key: "pct", width: 10 },
    ];
    const totalG = rows.reduce((s, r) => s + r.Total, 0);
    const data = rows.map((r) => ({ forma: r.FormaPago, cant: r.Cantidad, total: r.Total, pct: totalG > 0 ? Number(((r.Total / totalG) * 100).toFixed(1)) : 0 }));
    data.push({ forma: "TOTAL", cant: rows.reduce((s, r) => s + r.Cantidad, 0), total: totalG, pct: 100 });
    downloadExcel("Ventas por forma de pago", `Ventas por forma de pago — ${sedeLabel} (${dateFrom} a ${dateTo})`, cols, data, `Ventas_por_forma_pago_${dateFrom}_${dateTo}.xlsx`);
  };

  const exportDetalle = () => {
    if (!detalleForma) return;
    const cols: XCol[] = [
      { header: "Producto", key: "k", width: 45 },
      { header: "Cantidad", key: "cant", width: 12 },
      { header: "Total", key: "total", width: 18, money: true },
    ];
    const data = detalleData.map((d) => ({ k: d.Producto, cant: d.Cantidad, total: d.Total }));
    downloadExcel("Detalle", `${detalleForma.FormaPago} — ${sedeLabel} (${dateFrom} a ${dateTo})`, cols, data, `Detalle_${sanitize(detalleForma.FormaPago)}_${dateFrom}_${dateTo}.xlsx`);
  };

  const exportJugadores = () => {
    const cols: XCol[] = [
      { header: "Fecha", key: "fecha", width: 20 },
      { header: "Jugador", key: "jugador", width: 35 },
      { header: "Producto", key: "producto", width: 38 },
      { header: "Sede", key: "sede", width: 18 },
      { header: "Forma de pago", key: "forma", width: 18 },
      { header: "Recibo", key: "recibo", width: 14 },
      { header: "Monto", key: "monto", width: 16, money: true },
    ];
    const data = filteredJug.map((j) => ({ fecha: fmtFechaHora(j.Fecha), jugador: j.Jugador, producto: j.Producto, sede: j.Sede, forma: j.FormaPago, recibo: j.Recibo, monto: j.Pago }));
    downloadExcel("Detalle jugadores", `${jugTitle} — ${sedeLabel} (${dateFrom} a ${dateTo})`, cols, data, `Detalle_jugadores_${sanitize(jugTitle)}_${dateFrom}_${dateTo}.xlsx`);
  };

  const totalGeneral = rows.reduce((s, r) => s + r.Total, 0);
  const totalCantidad = rows.reduce((s, r) => s + r.Cantidad, 0);
  const grandTotalSedes = sedes.reduce((s, x) => s + x.Total, 0);
  const rects = treeW > 0 ? squarify(rows.map((r) => ({ value: r.Total, data: r })), treeW, TREE_H) : [];
  const sedeLabel = idSede === "all" ? "Todas las sedes" : (sedes.find((s) => s.IdSede === idSede)?.Sede ?? "Sede");
  const idxByForma = new Map(rows.map((r, i) => [r.IdFormaPago, i]));

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white">

        {/* ── Header ── */}
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center sticky top-0 z-20">
          <div>
            <h1 className="text-xl font-black flex items-center gap-2">
              <CreditCard size={20} className="text-blue-400" />
              Ventas por Forma de Pago
            </h1>
            <p className="text-xs text-blue-300 mt-0.5">{sedeLabel} · {dateFrom} → {dateTo}</p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-[10px] text-slate-500">
                Act.&nbsp;{lastUpdated.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button onClick={exportResumen} disabled={isLoading || rows.length === 0}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-200 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed" title="Exportar a Excel">
              <FileSpreadsheet size={15} /><span className="hidden sm:inline">Excel</span>
            </button>
            <button onClick={() => fetchData(dateFrom, dateTo, idSede)} disabled={isLoading}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all" title="Actualizar">
              <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="p-6 md:p-8 space-y-6">

          {/* ── Filtros: período + rango de fechas (mismo renglón) ── */}
          <div className="flex flex-wrap items-end gap-4">
            {/* Cards de período */}
            <div className="flex gap-2 bg-white/5 p-1 rounded-2xl border border-white/10 flex-wrap">
              {PERIODS.map((p) => (
                <button key={p.key} onClick={() => handlePeriod(p.key)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                    period === p.key ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-[1.03]" : "text-slate-400 hover:text-white hover:bg-white/8"
                  }`}>
                  {p.label}
                </button>
              ))}
              <button onClick={() => setPeriod("custom")}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                  period === "custom" ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-[1.03]" : "text-slate-400 hover:text-white hover:bg-white/8"
                }`}>
                <Calendar size={13} /> Personalizado
              </button>
            </div>

            {/* Rango de fechas manual */}
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

          {/* ── Cards de sede (solo con ventas en el período) ── */}
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setIdSede("all")}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${
                idSede === "all" ? "bg-blue-600/20 border-blue-500/40 scale-[1.02] shadow-lg shadow-blue-500/10" : "bg-white/5 border-white/10 hover:bg-white/8 hover:border-white/20"
              }`}>
              <div className={`p-2 rounded-xl border ${idSede === "all" ? "bg-blue-500/20 border-blue-500/30" : "bg-white/5 border-white/10"}`}>
                <Layers size={16} className={idSede === "all" ? "text-blue-300" : "text-slate-400"} />
              </div>
              <div>
                <p className={`text-sm font-black ${idSede === "all" ? "text-white" : "text-slate-300"}`}>Todas</p>
                <p className="text-[10px] text-slate-500 tabular-nums">{fmt(grandTotalSedes)}</p>
              </div>
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
                  <div>
                    <p className={`text-sm font-black ${active ? "text-white" : "text-slate-300"}`}>{s.Sede}</p>
                    <p className="text-[10px] text-slate-500 tabular-nums">{fmt(s.Total)}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── KPIs ── */}
          {!isLoading && rows.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: "Total Ventas", value: fmt2(totalGeneral), icon: <DollarSign size={16} className="text-emerald-400" />, ibg: "bg-emerald-500/10 border-emerald-500/20" },
                { label: "Operaciones", value: totalCantidad.toLocaleString("es-MX"), icon: <Package size={16} className="text-blue-400" />, ibg: "bg-blue-500/10 border-blue-500/20" },
                { label: "Formas de Pago", value: rows.length.toString(), icon: <CreditCard size={16} className="text-purple-400" />, ibg: "bg-purple-500/10 border-purple-500/20" },
              ].map((c) => (
                <div key={c.label} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-start gap-3">
                  <div className={`p-2 rounded-xl border flex-shrink-0 ${c.ibg}`}>{c.icon}</div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{c.label}</p>
                    <p className="text-base font-black text-white truncate">{c.value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Estados ── */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-28 gap-4">
              <div className="w-14 h-14 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
              <p className="text-sm text-slate-400 font-bold animate-pulse">Cargando ventas...</p>
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
              <p className="text-lg font-black">Sin ventas</p>
              <p className="text-sm opacity-60">No hay ventas en el período seleccionado.</p>
            </div>
          )}

          {/* ── Treemap + Grid ── */}
          {!isLoading && !error && rows.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Treemap (rectángulos) */}
              <div>
                <h2 className="text-sm font-black text-slate-300 uppercase tracking-widest mb-3">Distribución de ventas</h2>
                <div ref={treeRefCb} className="relative w-full rounded-2xl overflow-hidden bg-white/5 border border-white/10" style={{ height: TREE_H }}>
                  {rects.map((r, idx) => {
                    const color = colorFor(idx);
                    const pctVal = totalGeneral > 0 ? (r.data.Total / totalGeneral) * 100 : 0;
                    const showLabel = r.w > 62 && r.h > 34;
                    return (
                      <button key={r.data.IdFormaPago} onClick={() => openDetalle(r.data)}
                        className="absolute rounded-lg overflow-hidden text-left transition-all hover:ring-2 hover:ring-white/70 hover:z-10 focus:outline-none"
                        style={{ left: r.x + 2, top: r.y + 2, width: Math.max(0, r.w - 4), height: Math.max(0, r.h - 4), backgroundColor: color }}
                        title={`${r.data.FormaPago} · ${fmt2(r.data.Total)}`}>
                        {showLabel && (
                          <div className="flex flex-col h-full justify-between p-2.5">
                            <span className="text-[11px] font-black text-white leading-tight drop-shadow-md line-clamp-2">{r.data.FormaPago}</span>
                            <div className="drop-shadow-md">
                              <span className="block text-sm font-black text-white leading-none">{fmt(r.data.Total)}</span>
                              <span className="text-[10px] font-bold text-white/85">{pctVal.toFixed(1)}% · {r.data.Cantidad.toLocaleString("es-MX")}</span>
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Grid por forma de pago */}
              <div>
                <h2 className="text-sm font-black text-slate-300 uppercase tracking-widest mb-3">Ventas por forma de pago</h2>
                <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-white/10 bg-white/5">
                    <span>Forma de pago</span>
                    <span className="text-right w-16">Cant.</span>
                    <span className="text-right w-28">Total</span>
                  </div>
                  <div className="divide-y divide-white/5">
                    {rows.map((r, idx) => {
                      const color = colorFor(idx);
                      const pctVal = totalGeneral > 0 ? (r.Total / totalGeneral) * 100 : 0;
                      return (
                        <button key={r.IdFormaPago} onClick={() => openDetalle(r)}
                          className="w-full grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 items-center hover:bg-white/5 transition-colors text-left group">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-200 truncate group-hover:text-white">{r.FormaPago}</p>
                              <p className="text-[10px] text-slate-500">{pctVal.toFixed(1)}% del total</p>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-slate-400 text-right w-16 tabular-nums">{r.Cantidad.toLocaleString("es-MX")}</span>
                          <span className="text-sm font-black text-white text-right w-28 tabular-nums flex items-center justify-end gap-1">
                            {fmt(r.Total)}
                            <ChevronRight size={13} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-all" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchJugadores({}, "Todas las formas de pago", { total: totalGeneral, count: totalCantidad })}
                    title="Ver todas las ventas del total"
                    className="w-full grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 border-t border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-left group"
                  >
                    <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1">
                      Total <ChevronRight size={13} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-all" />
                    </span>
                    <span className="text-xs font-black text-slate-300 text-right w-16 tabular-nums">{totalCantidad.toLocaleString("es-MX")}</span>
                    <span className="text-sm font-black text-emerald-400 text-right w-28 tabular-nums">{fmt(totalGeneral)}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">Haz clic en un rectángulo, en una fila o en el Total para ver el detalle.</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Modal: Detalle por forma de pago (por producto) ── */}
        {detalleOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[120] p-4">
            <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
              {/* Header */}
              <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-2xl border" style={{ backgroundColor: `${colorFor(idxByForma.get(detalleForma?.IdFormaPago ?? -1) ?? 0)}22`, borderColor: `${colorFor(idxByForma.get(detalleForma?.IdFormaPago ?? -1) ?? 0)}55` }}>
                    <Package size={22} style={{ color: colorFor(idxByForma.get(detalleForma?.IdFormaPago ?? -1) ?? 0) }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">{detalleForma?.FormaPago}</h3>
                    <p className="text-xs text-slate-400">
                      {sedeLabel} · {dateFrom} → {dateTo} · Desglose por producto
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={exportDetalle} disabled={detalleLoading || detalleData.length === 0}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-200 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed" title="Exportar a Excel">
                    <FileSpreadsheet size={15} /><span className="hidden sm:inline">Excel</span>
                  </button>
                  <button onClick={() => setDetalleOpen(false)} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {detalleLoading ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-4">
                    <RefreshCw className="animate-spin text-blue-500" size={30} />
                    <p className="text-sm text-slate-400 font-bold animate-pulse">Cargando detalle...</p>
                  </div>
                ) : detalleError ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-3 text-rose-400">
                    <AlertCircle size={40} className="opacity-60" />
                    <p className="text-base font-black">{detalleError}</p>
                  </div>
                ) : detalleData.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-500">
                    <Package size={44} className="opacity-20" />
                    <p className="text-lg font-black">Sin registros</p>
                  </div>
                ) : (
                  <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white/5 text-[9px] uppercase font-black text-slate-500 tracking-widest border-b border-white/5">
                          <th className="px-4 py-3">Producto</th>
                          <th className="px-4 py-3 text-right">Cantidad</th>
                          <th className="px-4 py-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {detalleData.map((d) => (
                          <tr key={`p${d.IdProducto}`}
                            onClick={() => detalleForma && openJugadores(d, detalleForma)}
                            className="hover:bg-white/5 transition-colors cursor-pointer group">
                            <td className="px-4 py-3 text-sm font-bold text-slate-200 group-hover:text-white">
                              {d.Producto}
                            </td>
                            <td className="px-4 py-3 text-right text-xs font-bold text-slate-400 tabular-nums">{d.Cantidad.toLocaleString("es-MX")}</td>
                            <td className="px-4 py-3 text-right text-sm font-black text-white tabular-nums">
                              <span className="inline-flex items-center justify-end gap-1">
                                {fmt2(d.Total)}
                                <ChevronRight size={13} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-all" />
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 bg-white/5 border-t border-white/5 flex justify-between items-center text-[11px] text-slate-500 px-6">
                <p>{detalleData.length} producto(s) · clic en una fila para ver por jugador</p>
                <p className="font-black text-white">
                  Total: <span className="text-emerald-400">{fmt2(detalleData.reduce((s, d) => s + d.Total, 0))}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal: Detalle por jugador (tercer nivel) ── */}
        {jugOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[130] p-4">
            <div className="bg-[#0f172a] border border-white/15 rounded-3xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
              {/* Header */}
              <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-600/20 p-2.5 rounded-xl border border-blue-500/20">
                    <User size={20} className="text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">Detalle por jugador — {jugTitle}</h3>
                    <p className="text-[10px] text-slate-400">{sedeLabel} · {dateFrom} → {dateTo}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={exportJugadores} disabled={jugLoading || filteredJug.length === 0}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-200 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed" title="Exportar a Excel">
                    <FileSpreadsheet size={15} /><span className="hidden sm:inline">Excel</span>
                  </button>
                  <button onClick={() => setJugOpen(false)} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {jugLoading ? (
                  <div className="h-56 flex flex-col items-center justify-center gap-4">
                    <RefreshCw className="animate-spin text-blue-500" size={28} />
                    <p className="text-sm text-slate-400 font-bold animate-pulse">Cargando ventas...</p>
                  </div>
                ) : jugError ? (
                  <div className="h-56 flex flex-col items-center justify-center gap-3 text-rose-400">
                    <AlertCircle size={40} className="opacity-60" />
                    <p className="text-base font-black">{jugError}</p>
                  </div>
                ) : jugData.length === 0 ? (
                  <div className="h-56 flex flex-col items-center justify-center gap-3 text-slate-500">
                    <Receipt size={44} className="opacity-20" />
                    <p className="text-lg font-black">Sin registros</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Búsqueda por jugador, producto o forma de pago */}
                    <div className="relative">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        value={jugQuery}
                        onChange={(e) => setJugQuery(e.target.value)}
                        placeholder="Buscar por jugador, producto o forma de pago..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all placeholder-slate-500"
                      />
                      {jugQuery && (
                        <button type="button" onClick={() => setJugQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-500 hover:text-white transition-colors" title="Limpiar">
                          <X size={15} />
                        </button>
                      )}
                    </div>
                    {filteredJug.length === 0 ? (
                      <div className="h-40 flex flex-col items-center justify-center gap-2 text-slate-500">
                        <Search size={36} className="opacity-20" />
                        <p className="text-sm font-black">Sin coincidencias</p>
                      </div>
                    ) : (
                      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-white/5 text-[9px] uppercase font-black text-slate-500 tracking-widest border-b border-white/5">
                                <th className="px-4 py-3">Fecha</th>
                                <th className="px-4 py-3">Jugador</th>
                                <th className="px-4 py-3">Producto</th>
                                <th className="px-4 py-3">Forma pago</th>
                                <th className="px-4 py-3">Recibo</th>
                                <th className="px-4 py-3 text-right">Monto</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-slate-300">
                              {filteredJug.map((j) => (
                                <tr key={j.IdPago} className="hover:bg-white/5 transition-colors text-xs">
                                  <td className="px-4 py-3 whitespace-nowrap text-slate-400 tabular-nums">{fmtFechaHora(j.Fecha)}</td>
                                  <td className="px-4 py-3 font-bold text-white">{j.Jugador}</td>
                                  <td className="px-4 py-3 text-slate-400">{j.Producto}</td>
                                  <td className="px-4 py-3 whitespace-nowrap text-[10px] font-black text-slate-400">{j.FormaPago}</td>
                                  <td className="px-4 py-3 text-slate-500 tabular-nums">{j.Recibo || "—"}</td>
                                  <td className="px-4 py-3 text-right font-black text-emerald-400 tabular-nums whitespace-nowrap">{fmt2(j.Pago)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 bg-white/5 border-t border-white/10 flex justify-between items-center text-[11px] text-slate-500 px-6">
                <p>
                  {jq
                    ? `${filteredJug.length.toLocaleString("es-MX")} de ${jugData.length.toLocaleString("es-MX")} venta(s)`
                    : (jugOverride && jugOverride.count > jugData.length
                        ? `${jugData.length.toLocaleString("es-MX")} de ${jugOverride.count.toLocaleString("es-MX")} venta(s)`
                        : `${jugData.length.toLocaleString("es-MX")} venta(s)`)}
                </p>
                <p className="font-black text-white">
                  Total: <span className="text-emerald-400">{fmt2(jq ? jugTotal : (jugOverride ? jugOverride.total : jugData.reduce((s, j) => s + j.Pago, 0)))}</span>
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}
