"use client";

import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { useUser, usePermisos } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import {
  RefreshCw, X, AlertCircle, MapPin, DollarSign, Receipt,
  Calendar, ChevronRight, Layers, FileSpreadsheet, Users, Search,
} from "lucide-react";
import {
  type Period, PERIODS, periodRange, colorFor, fmt, fmt2, fmtFechaHora,
  sanitize, downloadExcel, squarify, type XCol,
} from "./reporte-utils";

/**
 * Reporte de gastos de tres niveles: grupo → destinatario → movimientos.
 *
 * Lo comparten "Gastos por Forma de Pago" y "Gastos por Tipo": la pantalla es la
 * misma y solo cambia por qué se agrupa, así que la dimensión entra por props
 * (`config`) en vez de existir dos copias de estas 600 líneas.
 */

/** Fila del primer nivel, ya normalizada por la pantalla que lo usa. */
export interface GrupoGasto {
  /** Identificador del grupo tal como lo espera el API (forma de pago o tipo). */
  clave: number;
  etiqueta: string;
  Cantidad: number;
  Total: number;
}

interface Sede { IdSede: number; Sede: string; Total: number }

interface DestinatarioRow {
  Clave: string;
  Destinatario: string;
  Cantidad: number;
  Total: number;
}

interface MovimientoRow {
  IdEgreso: number;
  Fecha: string;
  Concepto: string;
  PagarA: string;
  Factura: string;
  Recibo: string;
  FormaPago: string;
  TipoEgreso: string;
  Sede: string;
  Total: number;
}

export interface ConfigReporte {
  /** Clave del módulo en tblPerfilPaginas; también la ruta de la pantalla. */
  claveModulo: string;
  titulo: string;
  /** Base de los endpoints, p. ej. "/api/gastos/por-forma-pago". */
  apiBase: string;
  /** Nombre del parámetro con que viaja la clave del grupo (idFormaPago | tipo). */
  paramGrupo: string;
  /** Cómo se llama la dimensión en los encabezados y textos. */
  etiquetaDimension: string;
  /** Igual, en plural, para el KPI de conteo. */
  etiquetaDimensionPlural: string;
  icono: ReactNode;
  /** Convierte una fila cruda del API en la fila normalizada del primer nivel. */
  normaliza: (fila: Record<string, unknown>) => GrupoGasto;
}

export default function ReporteGastos({ config }: { config: ConfigReporte }) {
  const { user } = useUser();
  /* Se distingue "todavía no sé" de "no puede": los permisos llegan en una petición
     aparte y, mientras tanto, cualquier comprobación da false. Con un simple booleano
     la pantalla soltaba un "No tienes acceso" a todo el mundo en cada carga. */
  const { paginas, cargando: cargandoPermisos } = usePermisos();
  const puedeVer = paginas.has(config.claveModulo);

  const initRange = periodRange("month");
  const [period, setPeriod] = useState<Period>("month");
  const [dateFrom, setDateFrom] = useState(initRange.from);
  const [dateTo, setDateTo] = useState(initRange.to);
  const [idSede, setIdSede] = useState<number | "all">("all");

  const [sedes, setSedes] = useState<Sede[]>([]);
  const [rows, setRows] = useState<GrupoGasto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Segundo nivel: destinatarios de un grupo.
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detalleGrupo, setDetalleGrupo] = useState<GrupoGasto | null>(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalleData, setDetalleData] = useState<DestinatarioRow[]>([]);
  const [detalleError, setDetalleError] = useState<string | null>(null);

  // Tercer nivel: movimientos.
  const [movOpen, setMovOpen] = useState(false);
  const [movLoading, setMovLoading] = useState(false);
  const [movData, setMovData] = useState<MovimientoRow[]>([]);
  const [movError, setMovError] = useState<string | null>(null);
  const [movTitle, setMovTitle] = useState("");
  const [movTruncado, setMovTruncado] = useState(false);
  /* Cuando se abre el "Total" del grid, el pie muestra el total real del grid en vez
     de sumar solo las filas cargadas, que van limitadas por el tope del servidor. */
  const [movOverride, setMovOverride] = useState<{ total: number; count: number } | null>(null);
  const [movQuery, setMovQuery] = useState("");

  // Ancho del treemap: callback ref para re-medir cada vez que el contenedor monta.
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

  useEffect(() => () => { roRef.current?.disconnect(); }, []);

  const { apiBase, paramGrupo } = config;

  /* `normaliza` se lee por ref y no entra en las dependencias: si la pantalla que usa
     este componente arma su `config` en línea (sin useMemo), una función nueva en cada
     render volvería a crear fetchData, que dispararía el efecto de carga, que
     rerenderiza... un bucle de peticiones. Así el contrato del prop no puede provocarlo. */
  const normalizaRef = useRef(config.normaliza);
  useEffect(() => { normalizaRef.current = config.normaliza; }, [config.normaliza]);

  /* Petición vigente de cada nivel. Cambiar de sede o de período mientras una carga
     está en vuelo hacía que la respuesta lenta pisara a la que el usuario está viendo. */
  const cargaEnCurso = useRef(0);
  const detalleEnCurso = useRef(0);
  const movEnCurso = useRef(0);

  const fetchData = useCallback(async (from: string, to: string, sede: number | "all") => {
    const token = ++cargaEnCurso.current;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ dateFrom: from, dateTo: to });
      if (sede !== "all") params.set("idSede", String(sede));
      const res = await fetch(`${apiBase}?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (token !== cargaEnCurso.current) return;
      if (json.success) {
        setRows((json.data as Record<string, unknown>[]).map(normalizaRef.current));
        setSedes(json.sedes ?? []);
        // Si la sede elegida ya no tiene gasto en el período, se vuelve a "Todas".
        if (sede !== "all" && !(json.sedes ?? []).some((s: Sede) => s.IdSede === sede)) {
          setIdSede("all");
        }
        setLastUpdated(new Date());
      } else setError(json.message ?? "Error al cargar los gastos");
    } catch {
      if (token === cargaEnCurso.current) setError("Error de conexión");
    } finally {
      if (token === cargaEnCurso.current) setIsLoading(false);
    }
  }, [apiBase]);

  /* Con el campo de fecha vacío (se borra al teclear una nueva) el servidor caería a su
     valor por omisión —el mes en curso— y la pantalla mostraría esos números bajo un
     encabezado con el rango a medias. Mejor no pedir nada hasta que el rango esté completo. */
  const rangoCompleto = Boolean(dateFrom && dateTo);

  useEffect(() => {
    if (!user || !puedeVer || !rangoCompleto) return;
    fetchData(dateFrom, dateTo, idSede);
  }, [user, puedeVer, rangoCompleto, dateFrom, dateTo, idSede, fetchData]);

  const handlePeriod = (p: Period) => {
    const { from, to } = periodRange(p);
    setPeriod(p);
    setDateFrom(from);
    setDateTo(to);
  };

  const openDetalle = useCallback(async (grupo: GrupoGasto) => {
    const token = ++detalleEnCurso.current;
    setDetalleOpen(true);
    setDetalleGrupo(grupo);
    setDetalleLoading(true);
    setDetalleData([]);
    setDetalleError(null);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo, [paramGrupo]: String(grupo.clave) });
      if (idSede !== "all") params.set("idSede", String(idSede));
      const res = await fetch(`${apiBase}/detalle?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (token !== detalleEnCurso.current) return;
      if (json.success) setDetalleData(json.data);
      else setDetalleError(json.message ?? "Error al cargar el detalle");
    } catch {
      if (token === detalleEnCurso.current) setDetalleError("Error de conexión");
    } finally {
      if (token === detalleEnCurso.current) setDetalleLoading(false);
    }
  }, [apiBase, paramGrupo, dateFrom, dateTo, idSede]);

  /** Movimientos con filtros arbitrarios. `override` fija el total/conteo del pie. */
  const fetchMovimientos = useCallback(async (
    extra: Record<string, string>,
    title: string,
    override: { total: number; count: number } | null,
  ) => {
    const token = ++movEnCurso.current;
    setMovTitle(title);
    setMovOverride(override);
    setMovQuery("");
    setMovOpen(true);
    setMovLoading(true);
    setMovData([]);
    setMovTruncado(false);
    setMovError(null);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo, ...extra });
      if (idSede !== "all") params.set("idSede", String(idSede));
      const res = await fetch(`${apiBase}/movimientos?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (token !== movEnCurso.current) return;
      if (json.success) { setMovData(json.data); setMovTruncado(Boolean(json.truncado)); }
      else setMovError(json.message ?? "Error al cargar los movimientos");
    } catch {
      if (token === movEnCurso.current) setMovError("Error de conexión");
    } finally {
      if (token === movEnCurso.current) setMovLoading(false);
    }
  }, [apiBase, dateFrom, dateTo, idSede]);

  const openMovimientos = useCallback((d: DestinatarioRow, grupo: GrupoGasto) => {
    fetchMovimientos(
      { [paramGrupo]: String(grupo.clave), destinatario: d.Clave },
      `${grupo.etiqueta} · ${d.Destinatario}`,
      null,
    );
  }, [fetchMovimientos, paramGrupo]);

  // Búsqueda dentro de los movimientos: concepto, destinatario, factura o recibo.
  const mq = movQuery.trim().toLowerCase();
  const filteredMov = mq
    ? movData.filter((m) =>
        (m.Concepto ?? "").toLowerCase().includes(mq) ||
        (m.PagarA ?? "").toLowerCase().includes(mq) ||
        (m.Factura ?? "").toLowerCase().includes(mq) ||
        (m.Recibo ?? "").toLowerCase().includes(mq))
    : movData;
  const movTotal = filteredMov.reduce((s, m) => s + m.Total, 0);

  const totalGeneral = rows.reduce((s, r) => s + r.Total, 0);
  const totalCantidad = rows.reduce((s, r) => s + r.Cantidad, 0);
  const grandTotalSedes = sedes.reduce((s, x) => s + x.Total, 0);
  const rects = treeW > 0 ? squarify(rows.map((r) => ({ value: r.Total, data: r })), treeW, TREE_H) : [];
  const sedeLabel = idSede === "all" ? "Todas las sedes" : (sedes.find((s) => s.IdSede === idSede)?.Sede ?? "Sede");
  const idxByClave = new Map(rows.map((r, i) => [r.clave, i]));
  const colorGrupo = colorFor(idxByClave.get(detalleGrupo?.clave ?? -1) ?? 0);

  // ── Exportaciones a Excel ──
  const exportResumen = () => {
    const cols: XCol[] = [
      { header: config.etiquetaDimension, key: "grupo", width: 30 },
      { header: "Movimientos", key: "cant", width: 14 },
      { header: "Total", key: "total", width: 18, money: true },
      { header: "%", key: "pct", width: 10 },
    ];
    const data: Record<string, unknown>[] = rows.map((r) => ({
      grupo: r.etiqueta,
      cant: r.Cantidad,
      total: r.Total,
      pct: totalGeneral > 0 ? Number(((r.Total / totalGeneral) * 100).toFixed(1)) : 0,
    }));
    data.push({ grupo: "TOTAL", cant: totalCantidad, total: totalGeneral, pct: 100 });
    downloadExcel(config.titulo, `${config.titulo} — ${sedeLabel} (${dateFrom} a ${dateTo})`, cols, data,
      `${sanitize(config.titulo)}_${dateFrom}_${dateTo}.xlsx`);
  };

  const exportDetalle = () => {
    if (!detalleGrupo) return;
    const cols: XCol[] = [
      { header: "Destinatario", key: "k", width: 45 },
      { header: "Movimientos", key: "cant", width: 14 },
      { header: "Total", key: "total", width: 18, money: true },
    ];
    const data = detalleData.map((d) => ({ k: d.Destinatario, cant: d.Cantidad, total: d.Total }));
    downloadExcel("Detalle", `${detalleGrupo.etiqueta} — ${sedeLabel} (${dateFrom} a ${dateTo})`, cols, data,
      `Detalle_${sanitize(detalleGrupo.etiqueta)}_${dateFrom}_${dateTo}.xlsx`);
  };

  const exportMovimientos = () => {
    const cols: XCol[] = [
      { header: "Fecha", key: "fecha", width: 20 },
      { header: "Concepto", key: "concepto", width: 45 },
      { header: "Pagar a", key: "pagara", width: 32 },
      { header: "Sede", key: "sede", width: 18 },
      { header: "Forma de pago", key: "forma", width: 18 },
      { header: "Tipo", key: "tipo", width: 18 },
      { header: "Factura", key: "factura", width: 14 },
      { header: "Recibo", key: "recibo", width: 14 },
      { header: "Importe", key: "importe", width: 16, money: true },
    ];
    const data = filteredMov.map((m) => ({
      fecha: fmtFechaHora(m.Fecha), concepto: m.Concepto, pagara: m.PagarA, sede: m.Sede,
      forma: m.FormaPago, tipo: m.TipoEgreso, factura: m.Factura, recibo: m.Recibo, importe: m.Total,
    }));
    downloadExcel("Movimientos", `${movTitle} — ${sedeLabel} (${dateFrom} a ${dateTo})`, cols, data,
      `Movimientos_${sanitize(movTitle)}_${dateFrom}_${dateTo}.xlsx`);
  };

  if (cargandoPermisos) {
    return (
      <DashboardLayout>
        <main className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-14 h-14 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
          <p className="text-sm text-slate-400 font-bold animate-pulse">Cargando...</p>
        </main>
      </DashboardLayout>
    );
  }

  if (!puedeVer) {
    return (
      <DashboardLayout>
        <main className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
          <AlertCircle size={44} className="opacity-40" />
          <p className="text-base font-black">No tienes acceso a este módulo</p>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white">

        {/* ── Header ── */}
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center sticky top-0 z-20">
          <div>
            <h1 className="text-xl font-black flex items-center gap-2">
              {config.icono}
              {config.titulo}
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

          {/* ── Filtros: período + rango de fechas ── */}
          <div className="flex flex-wrap items-end gap-4">
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

          {/* ── Cards de sede (solo las que tuvieron gasto) ── */}
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
                { label: "Total Gastos", value: fmt2(totalGeneral), icon: <DollarSign size={16} className="text-rose-400" />, ibg: "bg-rose-500/10 border-rose-500/20" },
                { label: "Movimientos", value: totalCantidad.toLocaleString("es-MX"), icon: <Receipt size={16} className="text-blue-400" />, ibg: "bg-blue-500/10 border-blue-500/20" },
                { label: config.etiquetaDimensionPlural, value: rows.length.toString(), icon: <Layers size={16} className="text-purple-400" />, ibg: "bg-purple-500/10 border-purple-500/20" },
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
              <p className="text-sm text-slate-400 font-bold animate-pulse">Cargando gastos...</p>
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
              <p className="text-lg font-black">Sin gastos</p>
              <p className="text-sm opacity-60">No hay gastos en el período seleccionado.</p>
            </div>
          )}

          {/* ── Treemap + Grid ── */}
          {!isLoading && !error && rows.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              <div>
                <h2 className="text-sm font-black text-slate-300 uppercase tracking-widest mb-3">Distribución de gastos</h2>
                <div ref={treeRefCb} className="relative w-full rounded-2xl overflow-hidden bg-white/5 border border-white/10" style={{ height: TREE_H }}>
                  {rects.map((r, idx) => {
                    const color = colorFor(idx);
                    const pctVal = totalGeneral > 0 ? (r.data.Total / totalGeneral) * 100 : 0;
                    const showLabel = r.w > 62 && r.h > 34;
                    return (
                      <button key={r.data.clave} onClick={() => openDetalle(r.data)}
                        className="absolute rounded-lg overflow-hidden text-left transition-all hover:ring-2 hover:ring-white/70 hover:z-10 focus:outline-none"
                        style={{ left: r.x + 2, top: r.y + 2, width: Math.max(0, r.w - 4), height: Math.max(0, r.h - 4), backgroundColor: color }}
                        title={`${r.data.etiqueta} · ${fmt2(r.data.Total)}`}>
                        {showLabel && (
                          <div className="flex flex-col h-full justify-between p-2.5">
                            <span className="text-[11px] font-black text-white leading-tight drop-shadow-md line-clamp-2">{r.data.etiqueta}</span>
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

              <div>
                <h2 className="text-sm font-black text-slate-300 uppercase tracking-widest mb-3">{config.titulo}</h2>
                <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-white/10 bg-white/5">
                    <span>{config.etiquetaDimension}</span>
                    <span className="text-right w-16">Movs.</span>
                    <span className="text-right w-28">Total</span>
                  </div>
                  <div className="divide-y divide-white/5">
                    {rows.map((r, idx) => {
                      const color = colorFor(idx);
                      const pctVal = totalGeneral > 0 ? (r.Total / totalGeneral) * 100 : 0;
                      return (
                        <button key={r.clave} onClick={() => openDetalle(r)}
                          className="w-full grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 items-center hover:bg-white/5 transition-colors text-left group">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-200 truncate group-hover:text-white">{r.etiqueta}</p>
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
                    onClick={() => fetchMovimientos({}, `Todos los gastos`, { total: totalGeneral, count: totalCantidad })}
                    title="Ver todos los movimientos del total"
                    className="w-full grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 border-t border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-left group"
                  >
                    <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1">
                      Total <ChevronRight size={13} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-all" />
                    </span>
                    <span className="text-xs font-black text-slate-300 text-right w-16 tabular-nums">{totalCantidad.toLocaleString("es-MX")}</span>
                    <span className="text-sm font-black text-rose-400 text-right w-28 tabular-nums">{fmt(totalGeneral)}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">Haz clic en un rectángulo, en una fila o en el Total para ver el detalle.</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Modal: destinatarios del grupo ── */}
        {detalleOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[120] p-4">
            <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-2xl border" style={{ backgroundColor: `${colorGrupo}22`, borderColor: `${colorGrupo}55` }}>
                    <Users size={22} style={{ color: colorGrupo }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">{detalleGrupo?.etiqueta}</h3>
                    <p className="text-xs text-slate-400">
                      {sedeLabel} · {dateFrom} → {dateTo} · Desglose por destinatario
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
                    <Users size={44} className="opacity-20" />
                    <p className="text-lg font-black">Sin registros</p>
                  </div>
                ) : (
                  <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white/5 text-[9px] uppercase font-black text-slate-500 tracking-widest border-b border-white/5">
                          <th className="px-4 py-3">Destinatario</th>
                          <th className="px-4 py-3 text-right">Movimientos</th>
                          <th className="px-4 py-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {detalleData.map((d) => (
                          <tr key={d.Clave || "__sin__"}
                            onClick={() => detalleGrupo && openMovimientos(d, detalleGrupo)}
                            className="hover:bg-white/5 transition-colors cursor-pointer group">
                            <td className="px-4 py-3 text-sm font-bold text-slate-200 group-hover:text-white">{d.Destinatario}</td>
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

              <div className="p-4 bg-white/5 border-t border-white/5 flex justify-between items-center text-[11px] text-slate-500 px-6">
                <p>{detalleData.length} destinatario(s) · clic en una fila para ver los movimientos</p>
                <p className="font-black text-white">
                  Total: <span className="text-rose-400">{fmt2(detalleData.reduce((s, d) => s + d.Total, 0))}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal: movimientos (tercer nivel) ── */}
        {movOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[130] p-4">
            <div className="bg-[#0f172a] border border-white/15 rounded-3xl w-full max-w-5xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="bg-rose-600/20 p-2.5 rounded-xl border border-rose-500/20">
                    <Receipt size={20} className="text-rose-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">Movimientos — {movTitle}</h3>
                    <p className="text-[10px] text-slate-400">{sedeLabel} · {dateFrom} → {dateTo}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={exportMovimientos} disabled={movLoading || filteredMov.length === 0}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-200 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed" title="Exportar a Excel">
                    <FileSpreadsheet size={15} /><span className="hidden sm:inline">Excel</span>
                  </button>
                  <button onClick={() => setMovOpen(false)} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {movLoading ? (
                  <div className="h-56 flex flex-col items-center justify-center gap-4">
                    <RefreshCw className="animate-spin text-blue-500" size={28} />
                    <p className="text-sm text-slate-400 font-bold animate-pulse">Cargando movimientos...</p>
                  </div>
                ) : movError ? (
                  <div className="h-56 flex flex-col items-center justify-center gap-3 text-rose-400">
                    <AlertCircle size={40} className="opacity-60" />
                    <p className="text-base font-black">{movError}</p>
                  </div>
                ) : movData.length === 0 ? (
                  <div className="h-56 flex flex-col items-center justify-center gap-3 text-slate-500">
                    <Receipt size={44} className="opacity-20" />
                    <p className="text-lg font-black">Sin registros</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        value={movQuery}
                        onChange={(e) => setMovQuery(e.target.value)}
                        placeholder="Buscar por concepto, destinatario, factura o recibo..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-white text-sm outline-none focus:border-blue-500/60 focus:bg-white/10 transition-all placeholder-slate-500"
                      />
                      {movQuery && (
                        <button type="button" onClick={() => setMovQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-500 hover:text-white transition-colors" title="Limpiar">
                          <X size={15} />
                        </button>
                      )}
                    </div>
                    {movTruncado && (
                      <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                        La lista se recortó al tope de 1,000 movimientos. Acota el período o la sede para verlos todos.
                      </p>
                    )}
                    {filteredMov.length === 0 ? (
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
                                <th className="px-4 py-3">Concepto</th>
                                <th className="px-4 py-3">Pagar a</th>
                                <th className="px-4 py-3">Sede</th>
                                <th className="px-4 py-3">Forma pago</th>
                                <th className="px-4 py-3">Tipo</th>
                                <th className="px-4 py-3">Factura</th>
                                <th className="px-4 py-3 text-right">Importe</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-slate-300">
                              {filteredMov.map((m) => (
                                <tr key={m.IdEgreso} className="hover:bg-white/5 transition-colors text-xs">
                                  <td className="px-4 py-3 whitespace-nowrap text-slate-400 tabular-nums">{fmtFechaHora(m.Fecha)}</td>
                                  <td className="px-4 py-3 text-slate-300 max-w-xs truncate" title={m.Concepto}>{m.Concepto}</td>
                                  <td className="px-4 py-3 font-bold text-white">{m.PagarA}</td>
                                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{m.Sede}</td>
                                  <td className="px-4 py-3 whitespace-nowrap text-[10px] font-black text-slate-400">{m.FormaPago}</td>
                                  <td className="px-4 py-3 whitespace-nowrap text-[10px] font-black text-slate-400">{m.TipoEgreso}</td>
                                  <td className="px-4 py-3 text-slate-500 tabular-nums">{m.Factura}</td>
                                  <td className="px-4 py-3 text-right font-black text-rose-400 tabular-nums whitespace-nowrap">{fmt2(m.Total)}</td>
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

              <div className="p-4 bg-white/5 border-t border-white/10 flex justify-between items-center text-[11px] text-slate-500 px-6">
                <p>
                  {mq
                    ? `${filteredMov.length.toLocaleString("es-MX")} de ${movData.length.toLocaleString("es-MX")} movimiento(s)`
                    : (movOverride && movOverride.count > movData.length
                        ? `${movData.length.toLocaleString("es-MX")} de ${movOverride.count.toLocaleString("es-MX")} movimiento(s)`
                        : `${movData.length.toLocaleString("es-MX")} movimiento(s)`)}
                </p>
                {/* Con la lista recortada, la suma de lo cargado NO es el total del
                    grupo: se etiqueta como parcial para no dar una cifra que engañe. */}
                <p className="font-black text-white">
                  {movTruncado && !movOverride ? "Total de lo mostrado" : "Total"}:{" "}
                  <span className="text-rose-400">{fmt2(mq ? movTotal : (movOverride ? movOverride.total : movData.reduce((s, m) => s + m.Total, 0)))}</span>
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}
