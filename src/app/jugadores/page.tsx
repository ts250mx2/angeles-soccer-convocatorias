"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, usePuedeVer } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import PlayerPagosModal, { type PagosTarget } from "@/components/PlayerPagosModal";
import {
  Users, Search, RefreshCw, X, AlertCircle, FileSpreadsheet, FileText,
  Receipt, ChevronUp, ChevronDown, GraduationCap, CalendarDays, Phone,
  Mail, MapPin, IdCard, Loader2,
} from "lucide-react";
import {
  type JugadorListaRow, type EstadoPago, estadoPago, etiquetaAdeudo, telefonos,
  exportJugadoresToPdf, exportJugadoresToExcel,
} from "@/lib/jugadores-export";
import { becaPct, becaLabel } from "@/lib/adeudos-export";

/**
 * Lista de Jugadores: la plantilla completa, jugador por jugador, con su situación en
 * la temporada seleccionada (inscripción y adeudo con las MISMAS reglas que Adeudos y
 * Convocatorias). Se trae todo de una vez y se filtra en el navegador; el detalle y el
 * historial de pagos reutilizan el mismo modal que Inscripciones y Adeudos.
 */

interface Temporada {
  IdTemporada: number;
  Temporada: string;
  EsActiva: boolean;
}

type FiltroBeca = "todos" | "becados" | "sin-beca";
type FiltroEstatus = "activos" | "bajas" | "todos";
type FiltroPago = "todos" | EstadoPago;
type OrdenKey = "Jugador" | "SedeNombre" | "Categoria" | "Edad" | "MesesDebe";

const ETIQUETA_PAGO: Record<FiltroPago, string> = {
  todos: "Todos",
  adeudo: "Con adeudo",
  "sin-inscripcion": "Sin inscripción",
  "al-corriente": "Al corriente",
  exento: "No aplica (clinics/público)",
};

const ESTILO_ESTADO: Record<EstadoPago, string> = {
  adeudo: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  "sin-inscripcion": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "al-corriente": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  exento: "bg-white/5 text-slate-400 border-white/10",
};

const SELECT =
  "appearance-none bg-white/5 border border-white/15 text-slate-200 text-xs py-2 pl-3 pr-8 rounded-lg leading-tight focus:outline-none focus:border-blue-500 [color-scheme:dark]";

export default function JugadoresPage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const puedeVer = usePuedeVer("/jugadores");

  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [temporadaId, setTemporadaId] = useState<number | null>(null);
  const [filas, setFilas] = useState<JugadorListaRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [sedeFiltro, setSedeFiltro] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [becaFiltro, setBecaFiltro] = useState<FiltroBeca>("todos");
  const [estatusFiltro, setEstatusFiltro] = useState<FiltroEstatus>("activos");
  const [pagoFiltro, setPagoFiltro] = useState<FiltroPago>("todos");
  const [orden, setOrden] = useState<{ key: OrdenKey; dir: "asc" | "desc" } | null>(null);

  const [detalle, setDetalle] = useState<JugadorListaRow | null>(null);
  const [pagosTarget, setPagosTarget] = useState<PagosTarget | null>(null);

  useEffect(() => {
    if (isInitialized && !user) router.push("/login");
  }, [user, isInitialized, router]);

  // Temporadas para el selector; arranca en la activa.
  useEffect(() => {
    if (!user || !puedeVer) return;
    (async () => {
      try {
        const res = await fetch("/api/inscripciones/temporadas");
        const json = await res.json();
        if (json.success) {
          setTemporadas(json.data);
          setTemporadaId(json.temporadaActiva);
        } else {
          setError(json.message ?? "Error al cargar temporadas");
          setIsLoading(false);
        }
      } catch {
        setError("Error de conexión");
        setIsLoading(false);
      }
    })();
  }, [user, puedeVer]);

  const cargar = useCallback(async () => {
    if (!temporadaId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jugadores?temporadaId=${temporadaId}`);
      const json = await res.json();
      if (json.success) {
        setFilas(json.data);
      } else {
        setError(json.message ?? "Error al cargar la lista de jugadores");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setIsLoading(false);
    }
  }, [temporadaId]);

  useEffect(() => { cargar(); }, [cargar]);

  const temporadaNombre = useMemo(
    () => temporadas.find((t) => t.IdTemporada === temporadaId)?.Temporada ?? "",
    [temporadas, temporadaId],
  );

  // Catálogos de los filtros, derivados de los propios datos.
  const sedes = useMemo(
    () => [...new Set(filas.map((f) => f.SedeNombre).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [filas],
  );
  const categorias = useMemo(() => {
    const base = sedeFiltro ? filas.filter((f) => f.SedeNombre === sedeFiltro) : filas;
    return [...new Set(base.map((f) => f.Categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [filas, sedeFiltro]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    let out = filas.filter((f) => {
      if (estatusFiltro === "activos" && f.Status !== 0) return false;
      if (estatusFiltro === "bajas" && f.Status !== 2) return false;
      if (sedeFiltro && f.SedeNombre !== sedeFiltro) return false;
      if (categoriaFiltro && f.Categoria !== categoriaFiltro) return false;
      if (becaFiltro === "becados" && becaPct(f.Beca) === 0) return false;
      if (becaFiltro === "sin-beca" && becaPct(f.Beca) > 0) return false;
      if (pagoFiltro !== "todos" && estadoPago(f) !== pagoFiltro) return false;
      if (q && !f.Jugador.toLowerCase().includes(q) && String(f.IdJugador) !== q) return false;
      return true;
    });

    if (orden) {
      const dir = orden.dir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        if (orden.key === "Edad") return ((a.Edad ?? 0) - (b.Edad ?? 0)) * dir;
        if (orden.key === "MesesDebe") return (a.MesesDebe - b.MesesDebe) * dir;
        return String(a[orden.key] ?? "").localeCompare(String(b[orden.key] ?? "")) * dir;
      });
    }
    return out;
  }, [filas, busqueda, sedeFiltro, categoriaFiltro, becaFiltro, estatusFiltro, pagoFiltro, orden]);

  const kpis = useMemo(() => ({
    total: filtrados.length,
    becados: filtrados.filter((f) => becaPct(f.Beca) > 0).length,
    conAdeudo: filtrados.filter((f) => estadoPago(f) === "adeudo").length,
    sinInscripcion: filtrados.filter((f) => estadoPago(f) === "sin-inscripcion").length,
  }), [filtrados]);

  const hayFiltros = Boolean(
    busqueda || sedeFiltro || categoriaFiltro || becaFiltro !== "todos" ||
    estatusFiltro !== "activos" || pagoFiltro !== "todos",
  );

  const limpiarFiltros = () => {
    setBusqueda("");
    setSedeFiltro("");
    setCategoriaFiltro("");
    setBecaFiltro("todos");
    setEstatusFiltro("activos");
    setPagoFiltro("todos");
  };

  const subtituloExport = useMemo(() => {
    const partes = [temporadaNombre];
    if (sedeFiltro) partes.push(sedeFiltro);
    if (categoriaFiltro) partes.push(categoriaFiltro);
    if (becaFiltro !== "todos") partes.push(becaFiltro === "becados" ? "Solo becados" : "Sin beca");
    if (estatusFiltro !== "todos") partes.push(estatusFiltro === "activos" ? "Activos" : "Bajas");
    if (pagoFiltro !== "todos") partes.push(ETIQUETA_PAGO[pagoFiltro]);
    if (busqueda.trim()) partes.push(`Búsqueda: ${busqueda.trim()}`);
    return partes.filter(Boolean).join(" · ");
  }, [temporadaNombre, sedeFiltro, categoriaFiltro, becaFiltro, estatusFiltro, pagoFiltro, busqueda]);

  const exportar = async (formato: "pdf" | "excel") => {
    if (filtrados.length === 0) return;
    setExporting(true);
    try {
      if (formato === "pdf") exportJugadoresToPdf(filtrados, "Lista de Jugadores", subtituloExport);
      else await exportJugadoresToExcel(filtrados, "Lista de Jugadores", subtituloExport);
    } finally {
      setExporting(false);
    }
  };

  const ordenarPor = (key: OrdenKey) =>
    setOrden((prev) => prev?.key === key
      ? (prev.dir === "asc" ? { key, dir: "desc" } : null)
      : { key, dir: "asc" });

  const Th = ({ label, k, className }: { label: string; k?: OrdenKey; className?: string }) => (
    <th
      className={`px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap ${k ? "cursor-pointer select-none hover:text-slate-200" : ""} ${className ?? ""}`}
      onClick={k ? () => ordenarPor(k) : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {k && orden?.key === k && (orden.dir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
      </span>
    </th>
  );

  return (
    <DashboardLayout>
      <main className="p-4 md:p-8 overflow-y-auto flex-1">
        <div className="max-w-7xl mx-auto">
          <div className="bg-[#0f172a] backdrop-blur-sm rounded-xl shadow-2xl p-4 md:p-8 border border-white/20">
            {/* Encabezado */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                  <Users className="text-blue-400" size={28} />
                  Lista de Jugadores
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Plantilla completa con su situación en la temporada: inscripción, adeudos, categoría y beca.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={temporadaId ?? ""}
                  onChange={(e) => setTemporadaId(Number(e.target.value))}
                  className={SELECT}
                >
                  {temporadas.map((t) => (
                    <option key={t.IdTemporada} value={t.IdTemporada}>
                      {t.Temporada}{t.EsActiva ? " (activa)" : ""}
                    </option>
                  ))}
                </select>
                <button
                  onClick={cargar}
                  disabled={isLoading}
                  className="p-2 rounded-lg bg-white/5 border border-white/15 text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-40"
                  title="Actualizar"
                >
                  <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={() => exportar("excel")}
                  disabled={exporting || isLoading || filtrados.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-200 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FileSpreadsheet size={14} /> Excel
                </button>
                <button
                  onClick={() => exportar("pdf")}
                  disabled={exporting || isLoading || filtrados.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-blue-200 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FileText size={14} /> PDF
                </button>
              </div>
            </div>

            {/* KPIs del corte visible */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <Kpi etiqueta="Jugadores mostrados" valor={kpis.total} clase="text-white" />
              <Kpi etiqueta="Becados" valor={kpis.becados} clase="text-purple-300" />
              <Kpi etiqueta="Con adeudo" valor={kpis.conAdeudo} clase="text-rose-300" />
              <Kpi etiqueta="Sin inscripción" valor={kpis.sinInscripcion} clase="text-amber-300" />
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre o ID..."
                  className="w-full bg-white/5 border border-white/15 text-slate-200 text-xs py-2 pl-9 pr-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500"
                />
              </div>
              <select value={sedeFiltro} onChange={(e) => { setSedeFiltro(e.target.value); setCategoriaFiltro(""); }} className={SELECT}>
                <option value="">Todas las sedes</option>
                {sedes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)} className={SELECT}>
                <option value="">Todas las categorías</option>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={becaFiltro} onChange={(e) => setBecaFiltro(e.target.value as FiltroBeca)} className={SELECT}>
                <option value="todos">Beca: todos</option>
                <option value="becados">Solo becados</option>
                <option value="sin-beca">Sin beca</option>
              </select>
              <select value={estatusFiltro} onChange={(e) => setEstatusFiltro(e.target.value as FiltroEstatus)} className={SELECT}>
                <option value="activos">Activos</option>
                <option value="bajas">Bajas</option>
                <option value="todos">Activos y bajas</option>
              </select>
              <select value={pagoFiltro} onChange={(e) => setPagoFiltro(e.target.value as FiltroPago)} className={SELECT}>
                {(Object.keys(ETIQUETA_PAGO) as FiltroPago[]).map((k) => (
                  <option key={k} value={k}>{k === "todos" ? "Situación: todas" : ETIQUETA_PAGO[k]}</option>
                ))}
              </select>
              {hayFiltros && (
                <button
                  onClick={limpiarFiltros}
                  className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-white/5 border border-white/15 text-slate-400 hover:text-white text-xs transition-colors"
                >
                  <X size={12} /> Limpiar
                </button>
              )}
            </div>

            {/* Tabla */}
            {isLoading ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 size={30} className="animate-spin text-blue-500" />
                <p className="text-sm font-bold">Cargando jugadores...</p>
              </div>
            ) : error ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-rose-400">
                <AlertCircle size={36} className="opacity-60" />
                <p className="text-sm font-black">{error}</p>
              </div>
            ) : filtrados.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-500">
                <Users size={40} className="opacity-20" />
                <p className="text-base font-black">Sin jugadores</p>
                <p className="text-xs opacity-60">Ningún jugador coincide con los filtros aplicados</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-white/[0.07]">
                    <tr>
                      <Th label="ID" />
                      <Th label="Jugador" k="Jugador" />
                      <Th label="Sede" k="SedeNombre" />
                      <Th label="Categoría" k="Categoria" />
                      <Th label="Edad" k="Edad" />
                      <Th label="Beca" />
                      <Th label="Inscripción" />
                      <Th label="Adeudo" k="MesesDebe" />
                      <Th label="Estatus" />
                      <Th label="" className="text-right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filtrados.map((j) => {
                      const estado = estadoPago(j);
                      const pct = becaPct(j.Beca);
                      return (
                        <tr
                          key={j.IdJugador}
                          onClick={() => setDetalle(j)}
                          className="hover:bg-white/[0.04] cursor-pointer transition-colors"
                        >
                          <td className="px-3 py-2 text-slate-500 text-xs font-mono">{j.IdJugador}</td>
                          <td className="px-3 py-2">
                            <p className="text-slate-100 font-semibold text-xs">{j.Jugador}</p>
                            {j.FechaNacimiento && (
                              <p className="text-[10px] text-slate-500">{j.FechaNacimiento}</p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-300 text-xs">{j.SedeNombre || "—"}</td>
                          <td className="px-3 py-2">
                            <span className="text-[10px] font-black px-2 py-1 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30 whitespace-nowrap">
                              {j.Categoria || "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-400 text-xs">{j.Edad ?? "—"}</td>
                          <td className="px-3 py-2">
                            {pct > 0 ? (
                              <span className="text-[10px] font-black px-2 py-1 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30 whitespace-nowrap inline-flex items-center gap-1">
                                <GraduationCap size={11} /> {becaLabel(pct)}
                              </span>
                            ) : (
                              <span className="text-slate-600 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {j.Inscrito === 1 || pct >= 100 ? (
                              <span className="text-[10px] font-bold text-emerald-300">
                                SÍ{j.FechaInscripcion ? ` · ${j.FechaInscripcion}` : ""}
                              </span>
                            ) : j.Exento === 1 ? (
                              <span className="text-[10px] font-bold text-slate-500">N/A</span>
                            ) : (
                              <span className="text-[10px] font-bold text-rose-300">NO</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-[10px] font-black px-2 py-1 rounded-md border whitespace-nowrap ${ESTILO_ESTADO[estado]}`}>
                              {etiquetaAdeudo(j)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-[10px] font-bold ${j.Status === 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {j.Status === 0 ? "ACTIVO" : "BAJA"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPagosTarget({ idJugador: j.IdJugador, jugador: j.Jugador });
                              }}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition-colors"
                              title="Historial de pagos"
                            >
                              <Receipt size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Detalle del jugador */}
      {detalle && (
        <DetalleJugador
          jugador={detalle}
          temporadaNombre={temporadaNombre}
          onClose={() => setDetalle(null)}
          onVerPagos={() => setPagosTarget({ idJugador: detalle.IdJugador, jugador: detalle.Jugador })}
        />
      )}

      {/* Historial de pagos: el mismo modal que Inscripciones y Adeudos */}
      <PlayerPagosModal
        target={pagosTarget}
        temporadaId={temporadaId}
        temporadaNombre={temporadaNombre}
        onClose={() => setPagosTarget(null)}
        onDataChanged={cargar}
      />
    </DashboardLayout>
  );
}

function Kpi({ etiqueta, valor, clase }: { etiqueta: string; valor: number; clase: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{etiqueta}</p>
      <p className={`text-2xl font-black ${clase}`}>{valor.toLocaleString("es-MX")}</p>
    </div>
  );
}

function Dato({ etiqueta, valor, icono }: { etiqueta: string; valor: string; icono?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
        {icono}{etiqueta}
      </p>
      <p className="text-xs text-slate-200 font-semibold mt-0.5 break-words">{valor || "—"}</p>
    </div>
  );
}

function DetalleJugador({
  jugador,
  temporadaNombre,
  onClose,
  onVerPagos,
}: {
  jugador: JugadorListaRow;
  temporadaNombre: string;
  onClose: () => void;
  onVerPagos: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const estado = estadoPago(jugador);
  const pct = becaPct(jugador.Beca);
  const correos = [jugador.CorreoElectronicoPadre, jugador.CorreoElectronicoMadre]
    .map((c) => String(c ?? "").trim()).filter(Boolean).join(" / ");

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[120] p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0f172a] border border-white/15 rounded-3xl w-full max-w-2xl max-h-[88vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado con lo que debe saltar a la vista: categoría y beca */}
        <div className="p-5 border-b border-white/10 bg-white/5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-black text-white truncate">{jugador.Jugador}</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                ID {jugador.IdJugador} · {jugador.SedeNombre || "Sin sede"}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-300 border border-blue-500/30">
                  {jugador.Categoria || "Sin categoría"}
                </span>
                <span className={`text-[11px] font-black px-2.5 py-1 rounded-lg border inline-flex items-center gap-1 ${
                  pct > 0
                    ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
                    : "bg-white/5 text-slate-400 border-white/10"
                }`}>
                  <GraduationCap size={12} /> {pct > 0 ? becaLabel(pct) : "Sin beca"}
                </span>
                <span className={`text-[11px] font-black px-2.5 py-1 rounded-lg border ${ESTILO_ESTADO[estado]}`}>
                  {etiquetaAdeudo(jugador)}
                </span>
                <span className={`text-[11px] font-black px-2.5 py-1 rounded-lg border ${
                  jugador.Status === 0
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : "bg-rose-500/15 text-rose-300 border-rose-500/30"
                }`}>
                  {jugador.Status === 0 ? "ACTIVO" : "BAJA"}
                </span>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-all flex-shrink-0">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Situación en la temporada */}
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
              Temporada {temporadaNombre}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Dato
                etiqueta="Inscripción"
                icono={<IdCard size={11} />}
                valor={
                  jugador.Inscrito === 1 || pct >= 100
                    ? `Pagada${jugador.FechaInscripcion ? ` el ${jugador.FechaInscripcion}` : ""}${pct >= 100 && jugador.Inscrito === 0 ? " (beca 100%)" : ""}`
                    : jugador.Exento === 1 ? "No aplica" : "Pendiente"
                }
              />
              <Dato
                etiqueta="Adeudo de mensualidades"
                icono={<AlertCircle size={11} />}
                valor={estado === "adeudo" ? `${etiquetaAdeudo(jugador)} vencido(s)` : etiquetaAdeudo(jugador)}
              />
              <div className="flex items-end">
                <button
                  onClick={onVerPagos}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-all"
                >
                  <Receipt size={13} /> Historial de pagos
                </button>
              </div>
            </div>
          </div>

          {/* Datos generales */}
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Datos generales</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Dato etiqueta="Fecha de nacimiento" icono={<CalendarDays size={11} />} valor={jugador.FechaNacimiento ?? "—"} />
              <Dato etiqueta="Edad" valor={jugador.Edad != null ? `${jugador.Edad} años` : "—"} />
              <Dato etiqueta="Fecha de alta" icono={<CalendarDays size={11} />} valor={jugador.FechaAlta ?? "—"} />
              <Dato etiqueta="Sede" icono={<MapPin size={11} />} valor={jugador.SedeNombre || "—"} />
              <Dato etiqueta="Teléfonos" icono={<Phone size={11} />} valor={telefonos(jugador) || "—"} />
              <Dato etiqueta="Correos" icono={<Mail size={11} />} valor={correos || "—"} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
