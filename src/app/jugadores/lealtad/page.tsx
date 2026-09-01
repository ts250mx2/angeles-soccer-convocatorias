"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, usePuedeVer } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import BarrasPermanencia from "@/components/BarrasPermanencia";
import {
  Award, Search, RefreshCw, X, AlertCircle, FileSpreadsheet, FileText,
  ChevronUp, ChevronDown, Loader2, Undo2,
} from "lucide-react";
import {
  BANDAS_LEALTAD, RAMPA_LEALTAD, aniosDeCiclos, bandaDe, etiquetaAnios, etiquetaCiclo,
  type BandaLealtad,
} from "@/lib/lealtad";
import {
  type LealtadRow, ciclos, tieneHueco, telefonosLealtad, inscritoLabel,
  exportLealtadToPdf, exportLealtadToExcel,
} from "@/lib/lealtad-export";
import AvatarJugador from "@/components/AvatarJugador";
import PlayerPagosModal, { type PagosTarget } from "@/components/PlayerPagosModal";

/**
 * Lealtad: cuánto tiempo lleva cada alumno en la escuela.
 *
 * La permanencia se cuenta por las inscripciones pagadas, un ciclo por semestre. De
 * dónde sale un ciclo —y por qué del nombre del producto y no de la temporada del
 * pago— está explicado en @/lib/lealtad; aquí solo se presenta.
 *
 * Como la beca, esto NO depende de una temporada: es la historia completa del alumno,
 * así que la pantalla no lleva selector de temporada. El corte que sí cambia la lectura
 * es el estatus, y por eso arranca en activos: la pregunta de todos los días es cuánto
 * llevan los que siguen aquí. Las bajas se pueden ver, y valen la pena, porque son las
 * que dicen cuánto duraban los que se fueron.
 */

type FiltroEstatus = "activos" | "bajas" | "todos";
type FiltroHistorial = "con-historial" | "sin-registro" | "todos";
type OrdenKey = "Jugador" | "SedeNombre" | "Categoria" | "Edad" | "Ciclos" | "Desde";

const SELECT =
  "appearance-none bg-white/5 border border-white/15 text-slate-200 text-xs py-2 pl-3 pr-8 rounded-lg leading-tight focus:outline-none focus:border-blue-500 [color-scheme:dark]";

export default function LealtadPage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const puedeVer = usePuedeVer("/jugadores/lealtad");

  const [filas, setFilas] = useState<LealtadRow[]>([]);
  /* La temporada de la que habla la columna Inscrito. La resuelve el servidor —esta
     pantalla no tiene selector— y también se la lleva el modal de pagos. */
  const [temporadaActiva, setTemporadaActiva] = useState<{ id: number; nombre: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  /** El alumno cuyo detalle y pagos están abiertos; null = cerrado. */
  const [pagosTarget, setPagosTarget] = useState<PagosTarget | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [sedeFiltro, setSedeFiltro] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [estatusFiltro, setEstatusFiltro] = useState<FiltroEstatus>("activos");
  /* Arranca en "con historial": los que no tienen ninguna inscripción registrada son
     un dato importante, pero no son de quienes habla este reporte. Se cuentan en su
     propio indicador y se ven al tocarlo. */
  const [historialFiltro, setHistorialFiltro] = useState<FiltroHistorial>("con-historial");
  const [bandaFiltro, setBandaFiltro] = useState<BandaLealtad | null>(null);
  /** Solo los que se fueron y volvieron. */
  /* Solo los que YA pagaron su inscripción de la temporada en curso. Es el único corte
     del reporte que habla del presente y no de la historia: sirve para leer la
     permanencia de los que hoy están, sin que la arrastren los que ya no vienen. */
  const [soloInscritos, setSoloInscritos] = useState(false);
  const [soloRegresados, setSoloRegresados] = useState(false);
  const [orden, setOrden] = useState<{ key: OrdenKey; dir: "asc" | "desc" } | null>(null);

  useEffect(() => {
    if (isInitialized && !user) router.push("/login");
  }, [user, isInitialized, router]);

  const cargar = useCallback(async () => {
    if (!user || !puedeVer) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/jugadores/lealtad", { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setFilas(json.data);
        setTemporadaActiva(json.temporada ?? null);
      } else {
        setError(json.message ?? "Error al cargar el reporte de lealtad");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setIsLoading(false);
    }
  }, [user, puedeVer]);

  useEffect(() => { cargar(); }, [cargar]);

  // Catálogos de los filtros, derivados de los propios datos.
  const sedes = useMemo(
    () => [...new Set(filas.map((r) => r.SedeNombre).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [filas],
  );
  const categorias = useMemo(() => {
    const base = sedeFiltro ? filas.filter((r) => r.SedeNombre === sedeFiltro) : filas;
    return [...new Set(base.map((r) => r.Categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [filas, sedeFiltro]);

  /* Base del reporte: sede, categoría, estatus y búsqueda, SIN los cortes de tramo,
     historial y regresados. Los indicadores y la gráfica se calculan sobre esta base
     para que sigan diciendo lo mismo cuando uno de esos cortes está puesto. */
  const base = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((r) => {
      if (estatusFiltro === "activos" && r.Status !== 0) return false;
      if (estatusFiltro === "bajas" && r.Status !== 2) return false;
      if (sedeFiltro && r.SedeNombre !== sedeFiltro) return false;
      if (categoriaFiltro && r.Categoria !== categoriaFiltro) return false;
      if (q && !r.Jugador.toLowerCase().includes(q) && String(r.IdJugador) !== q) return false;
      return true;
    });
  }, [filas, busqueda, sedeFiltro, categoriaFiltro, estatusFiltro]);

  /** Los que sí tienen inscripciones registradas: de ellos habla el reporte. */
  const conHistorial = useMemo(() => base.filter((r) => ciclos(r) > 0), [base]);

  const filtrados = useMemo(() => {
    let out = base.filter((r) => {
      const n = ciclos(r);
      if (historialFiltro === "con-historial" && n === 0) return false;
      if (historialFiltro === "sin-registro" && n > 0) return false;
      if (bandaFiltro && bandaDe(n) !== bandaFiltro) return false;
      if (soloInscritos && Number(r.Inscrito) !== 1) return false;
      if (soloRegresados && !tieneHueco(r)) return false;
      return true;
    });

    if (orden) {
      const dir = orden.dir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        if (orden.key === "Edad") return ((a.Edad ?? 0) - (b.Edad ?? 0)) * dir;
        if (orden.key === "Ciclos") return (ciclos(a) - ciclos(b)) * dir;
        if (orden.key === "Desde") return ((Number(a.Desde) || 0) - (Number(b.Desde) || 0)) * dir;
        return String(a[orden.key] ?? "").localeCompare(String(b[orden.key] ?? "")) * dir;
      });
    }
    return out;
  }, [base, historialFiltro, bandaFiltro, soloRegresados, soloInscritos, orden]);

  const kpis = useMemo(() => {
    const suma = conHistorial.reduce((s, r) => s + aniosDeCiclos(ciclos(r)), 0);
    return {
      conHistorial: conHistorial.length,
      /* Promedio SOLO sobre quien tiene historial: meter a los que no tienen ninguna
         inscripción registrada lo hundiría, y no porque se hayan ido pronto sino
         porque de ellos no se sabe. */
      promedio: conHistorial.length ? suma / conHistorial.length : 0,
      veteranos: conHistorial.filter((r) => ciclos(r) >= 6).length,
      regresados: conHistorial.filter((r) => tieneHueco(r)).length,
      /* Cuenta estricta: inscrito de verdad en la temporada. Clinics y venta al
         público no manejan inscripción, así que no suman aquí ni podrían. */
      inscritos: base.filter((r) => Number(r.Inscrito) === 1).length,
      sinRegistro: base.length - conHistorial.length,
    };
  }, [base, conHistorial]);

  /** Una barra por tramo, contadas sobre los que tienen historial. */
  const barras = useMemo(
    () => BANDAS_LEALTAD.map((b) => ({
      clave: b.clave,
      etiqueta: b.etiqueta,
      cantidad: conHistorial.filter((r) => bandaDe(ciclos(r)) === b.clave).length,
      color: RAMPA_LEALTAD[b.clave],
    })),
    [conHistorial],
  );

  const hayFiltros = Boolean(
    busqueda || sedeFiltro || categoriaFiltro || estatusFiltro !== "activos" ||
    historialFiltro !== "con-historial" || bandaFiltro || soloRegresados || soloInscritos,
  );

  const limpiarFiltros = () => {
    setBusqueda("");
    setSedeFiltro("");
    setCategoriaFiltro("");
    setEstatusFiltro("activos");
    setHistorialFiltro("con-historial");
    setBandaFiltro(null);
    setSoloRegresados(false);
    setSoloInscritos(false);
  };

  /* Tocar un tramo lo aísla; volver a tocarlo deshace el corte. Los tramos solo existen
     entre los que tienen historial, así que elegir uno arrastra ese filtro con él. */
  const seleccionarBanda = (clave: string) => {
    setHistorialFiltro("con-historial");
    setBandaFiltro((prev) => (prev === clave ? null : (clave as BandaLealtad)));
  };

  const subtituloExport = useMemo(() => {
    const partes: string[] = [];
    if (sedeFiltro) partes.push(sedeFiltro);
    if (categoriaFiltro) partes.push(categoriaFiltro);
    if (bandaFiltro) partes.push(BANDAS_LEALTAD.find((b) => b.clave === bandaFiltro)?.etiqueta ?? "");
    if (soloInscritos) partes.push(`Solo inscritos en ${temporadaActiva?.nombre ?? "la temporada"}`);
    if (soloRegresados) partes.push("Solo los que regresaron");
    if (historialFiltro === "sin-registro") partes.push("Sin inscripción registrada");
    partes.push(estatusFiltro === "activos" ? "Activos" : estatusFiltro === "bajas" ? "Bajas" : "Activos y bajas");
    if (busqueda) partes.push(`Búsqueda: ${busqueda}`);
    return partes.filter(Boolean).join(" · ");
  }, [sedeFiltro, categoriaFiltro, bandaFiltro, soloRegresados, soloInscritos, historialFiltro, estatusFiltro, temporadaActiva, busqueda]);

  const exportar = async (formato: "pdf" | "excel") => {
    setExporting(true);
    try {
      if (formato === "pdf") exportLealtadToPdf(filtrados, "Lealtad", subtituloExport);
      else await exportLealtadToExcel(filtrados, "Lealtad", subtituloExport);
    } finally {
      setExporting(false);
    }
  };

  const ordenarPor = (key: OrdenKey) =>
    setOrden((prev) =>
      prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

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

  if (!isInitialized) return null;
  if (!puedeVer) {
    return (
      <DashboardLayout>
        <main className="p-8 flex-1">
          <div className="max-w-xl mx-auto bg-[#0f172a] border border-white/20 rounded-xl p-8 text-center">
            <AlertCircle className="mx-auto text-amber-400 mb-3" size={32} />
            <p className="text-slate-200 font-bold">No tienes permiso para ver este módulo.</p>
          </div>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <main className="p-4 md:p-8 overflow-y-auto flex-1">
        <div className="max-w-7xl mx-auto">
          <div className="bg-[#0f172a] backdrop-blur-sm rounded-xl shadow-2xl p-4 md:p-8 border border-white/20">
            {/* Encabezado */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                  <Award className="text-blue-400" size={28} />
                  Lealtad
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Cuántos años lleva cada alumno en la escuela, contados por las inscripciones que ha pagado.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={cargar}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-xs font-bold transition-all disabled:opacity-40"
                >
                  <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} /> Actualizar
                </button>
                <button
                  onClick={() => exportar("excel")}
                  disabled={exporting || filtrados.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-200 text-xs font-bold transition-all disabled:opacity-40"
                >
                  <FileSpreadsheet size={14} /> Excel
                </button>
                <button
                  onClick={() => exportar("pdf")}
                  disabled={exporting || filtrados.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-blue-200 text-xs font-bold transition-all disabled:opacity-40"
                >
                  <FileText size={14} /> PDF
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm font-bold flex items-start gap-2">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> {error}
              </div>
            )}

            {/* Indicadores. El primero habla del presente —quién está inscrito hoy— y los
                demás de la historia, donde "Con historial" es el denominador de los tres
                de en medio. */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
              <Kpi
                etiqueta="Inscritos"
                valor={kpis.inscritos.toLocaleString("es-MX")}
                clase="text-emerald-300"
                nota={temporadaActiva?.nombre ?? "Temporada en curso"}
                title="Ya pagaron su inscripción de la temporada en curso, con la misma regla que la pantalla de Inscripciones. Toca para dejar en la lista solo a ellos."
                activo={soloInscritos}
                onClick={() => setSoloInscritos((v) => !v)}
              />
              <Kpi
                etiqueta="Con historial"
                valor={kpis.conHistorial.toLocaleString("es-MX")}
                clase="text-white"
                nota="Tienen al menos una inscripción registrada"
              />
              <Kpi
                etiqueta="Permanencia media"
                valor={`${kpis.promedio.toFixed(1)} años`}
                clase="text-blue-300"
                title="Promedio de años entre quienes tienen historial. Dos ciclos de inscripción son un año."
              />
              <Kpi
                etiqueta="3 años o más"
                valor={kpis.veteranos.toLocaleString("es-MX")}
                clase="text-sky-200"
                title="Llevan seis ciclos o más en la escuela."
              />
              <Kpi
                etiqueta="Regresaron"
                valor={kpis.regresados.toLocaleString("es-MX")}
                clase="text-amber-300"
                title="Dejaron de inscribirse uno o más semestres y volvieron. Sus años cuentan lo pagado, no el calendario."
              />
              <Kpi
                etiqueta="Sin registro"
                valor={kpis.sinRegistro.toLocaleString("es-MX")}
                clase="text-slate-400"
                title="No tienen ninguna inscripción capturada como producto de inscripción. No se puede medir su permanencia."
              />
            </div>

            {/* Reparto por tramo de permanencia */}
            {!isLoading && !error && conHistorial.length > 0 && (
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-5 mb-6">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">
                    Cuántos años llevan
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Sobre {kpis.conHistorial.toLocaleString("es-MX")} con historial. Toca un tramo para verlo en la lista.
                  </p>
                </div>
                <BarrasPermanencia
                  barras={barras}
                  total={kpis.conHistorial}
                  seleccion={bandaFiltro}
                  onSeleccionar={seleccionarBanda}
                />
              </div>
            )}

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre o ID..."
                  className="w-full bg-white/5 border border-white/15 text-slate-200 text-xs py-2 pl-9 pr-3 rounded-lg focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
                />
              </div>
              <select value={sedeFiltro} onChange={(e) => setSedeFiltro(e.target.value)} className={SELECT}>
                <option value="">Todas las sedes</option>
                {sedes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)} className={SELECT}>
                <option value="">Todas las categorías</option>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={historialFiltro}
                onChange={(e) => { setHistorialFiltro(e.target.value as FiltroHistorial); setBandaFiltro(null); }}
                className={SELECT}
              >
                <option value="con-historial">Con historial</option>
                <option value="sin-registro">Sin registro</option>
                <option value="todos">Todos</option>
              </select>
              <select value={estatusFiltro} onChange={(e) => setEstatusFiltro(e.target.value as FiltroEstatus)} className={SELECT}>
                <option value="activos">Activos</option>
                <option value="bajas">Bajas</option>
                <option value="todos">Activos y bajas</option>
              </select>
              <button
                type="button"
                onClick={() => setSoloRegresados((v) => !v)}
                aria-pressed={soloRegresados}
                title="Solo los que dejaron de inscribirse y volvieron"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-all ${
                  soloRegresados
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-200"
                    : "bg-white/5 border-white/15 text-slate-300 hover:bg-white/10"
                }`}
              >
                <Undo2 size={14} /> Regresaron
              </button>
              {hayFiltros && (
                <button
                  onClick={limpiarFiltros}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-slate-300 text-xs font-bold transition-all"
                >
                  <X size={14} /> Limpiar
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
                <Loader2 size={30} className="animate-spin text-blue-400" />
                <p className="text-sm font-bold">Cargando el reporte...</p>
              </div>
            ) : filtrados.length === 0 ? (
              <div className="text-center py-20">
                <Award size={34} className="mx-auto text-slate-700 mb-3" />
                <p className="text-slate-300 font-bold text-sm">No hay alumnos con estos filtros</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <table className="w-full text-sm min-w-[1100px]">
                    <thead className="bg-white/[0.07]">
                      <tr>
                        <Th label="ID" />
                        <Th label="Jugador" k="Jugador" />
                        <Th label="Sede" k="SedeNombre" />
                        <Th label="Categoría" k="Categoria" />
                        <Th label="Edad" k="Edad" />
                        <th
                          title={temporadaActiva ? `Inscrito en la temporada activa (${temporadaActiva.nombre}), con la misma regla que la pantalla de Inscripciones.` : undefined}
                          className="px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap"
                        >
                          Inscrito
                        </th>
                        {/* Años y Ciclos ordenan igual —uno es el otro entre dos—, así
                            que la flecha vive solo en Años y Ciclos va sin ordenar: dos
                            encabezados con la misma marca harían dudar de cuál mandó. */}
                        <Th label="Años" k="Ciclos" />
                        <Th label="Ciclos" />
                        <Th label="Desde" k="Desde" />
                        <Th label="Hasta" />
                        <Th label="Teléfonos" />
                        <Th label="Estatus" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filtrados.map((r) => {
                        const n = ciclos(r);
                        const banda = bandaDe(n);
                        const regreso = tieneHueco(r);
                        const inscrito = inscritoLabel(r);
                        return (
                          <tr
                            key={r.IdJugador}
                            onClick={() => setPagosTarget({ idJugador: r.IdJugador, jugador: r.Jugador })}
                            className="hover:bg-white/[0.04] cursor-pointer transition-colors"
                          >
                            <td className="px-3 py-2 text-slate-500 text-xs font-mono">{r.IdJugador}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <AvatarJugador
                                  idJugador={r.IdJugador}
                                  nombre={r.Jugador}
                                  tieneFoto={r.TieneFoto}
                                  fotoVersion={r.FotoVersion}
                                  tamano={28}
                                />
                                <div className="min-w-0">
                                  <p className="text-slate-100 font-semibold text-xs">{r.Jugador}</p>
                                  {r.FechaNacimiento && (
                                    <p className="text-[10px] text-slate-500">{r.FechaNacimiento}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-slate-300 text-xs">{r.SedeNombre || "—"}</td>
                            <td className="px-3 py-2">
                              <span className="text-[10px] font-black px-2 py-1 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30 whitespace-nowrap">
                                {r.Categoria || "—"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-400 text-xs">{r.Edad ?? "—"}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] font-bold ${
                                inscrito === "SÍ" ? "text-emerald-300" : inscrito === "NO" ? "text-rose-300" : "text-slate-500"
                              }`}>
                                {inscrito}
                              </span>
                            </td>
                            {/* Los años llevan el color de su tramo, el mismo de la
                                gráfica, para poder saltar de una a la otra. */}
                            <td className="px-3 py-2 whitespace-nowrap">
                              {n > 0 ? (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-slate-100">
                                  <span
                                    aria-hidden
                                    className="inline-block w-2 h-2 rounded-full"
                                    style={{ backgroundColor: banda ? RAMPA_LEALTAD[banda] : "transparent" }}
                                  />
                                  {etiquetaAnios(n)}
                                </span>
                              ) : (
                                <span className="text-slate-600 text-[11px]">Sin registro</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs tabular-nums text-slate-300">
                              {n || <span className="text-slate-600">—</span>}
                            </td>
                            <td className="px-3 py-2 text-[11px] text-slate-300 whitespace-nowrap">
                              {etiquetaCiclo(Number(r.Desde)) || <span className="text-slate-600">—</span>}
                            </td>
                            <td className="px-3 py-2 text-[11px] whitespace-nowrap">
                              <span className="text-slate-300">
                                {etiquetaCiclo(Number(r.Hasta)) || <span className="text-slate-600">—</span>}
                              </span>
                              {regreso && (
                                <span
                                  title="Dejó de inscribirse uno o más semestres y volvió"
                                  className="ml-1.5 inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                >
                                  <Undo2 size={9} /> REGRESÓ
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-400 text-[11px]">{telefonosLealtad(r) || "—"}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] font-bold ${r.Status === 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {r.Status === 0 ? "ACTIVO" : "BAJA"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-slate-500 mt-3">
                  {filtrados.length.toLocaleString("es-MX")} alumno(s) en la lista. Un <b>ciclo</b> es un semestre de
                  inscripción pagado, así que dos ciclos son un año. Los años cuentan lo que de verdad pagó: quien se
                  fue y volvió no acumula el tiempo que estuvo afuera.
                  {temporadaActiva && <> La columna <b>Inscrito</b> habla de la temporada activa ({temporadaActiva.nombre}).</>}
                  {" "}Toca un renglón para ver el detalle del alumno y su historial de pagos.
                </p>
              </>
            )}
          </div>
        </div>
      </main>

      {/* El detalle del alumno: el mismo modal de pagos y datos generales que la Lista
          de Jugadores, Inscripciones y Adeudos. Los pagos abren en la temporada activa,
          que es la que resuelve el servidor de este reporte. */}
      <PlayerPagosModal
        target={pagosTarget}
        temporadaId={temporadaActiva?.id ?? null}
        temporadaNombre={temporadaActiva?.nombre}
        onClose={() => setPagosTarget(null)}
        onDataChanged={cargar}
      />
    </DashboardLayout>
  );
}

function Kpi({ etiqueta, valor, clase, nota, title, onClick, activo }: {
  etiqueta: string;
  valor: string;
  clase: string;
  /** Renglón chico bajo la cifra: contra qué se mide. */
  nota?: string;
  /** Explicación al pasar el mouse: qué cuenta exactamente. */
  title?: string;
  /** Si se pasa, la tarjeta filtra la lista al tocarla. Sin esto es solo una cifra. */
  onClick?: () => void;
  activo?: boolean;
}) {
  const cuerpo = (
    <>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{etiqueta}</p>
      <p className={`text-2xl font-black tabular-nums leading-tight mt-0.5 ${clase}`}>{valor}</p>
      {nota && <p className="text-[10px] text-slate-500 mt-0.5">{nota}</p>}
    </>
  );

  /* Solo las tarjetas que filtran son botones. Hacerlas todas clicables prometería un
     corte que las demás no saben hacer. */
  if (!onClick) {
    return (
      <div title={title} className="rounded-xl px-4 py-3 border bg-white/5 border-white/10">
        {cuerpo}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      title={title}
      className={`text-left rounded-xl px-4 py-3 border transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
        activo
          ? "bg-emerald-500/15 border-emerald-500/50"
          : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
      }`}
    >
      {cuerpo}
    </button>
  );
}
