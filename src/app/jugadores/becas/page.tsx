"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, usePuedeVer } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import BecasDonut, {
  SIN_BECA_COLOR, BECA_RAMPA, OTRAS_BECAS_COLOR, MAX_NIVELES, type Rebanada,
} from "@/components/BecasDonut";
import {
  GraduationCap, Search, RefreshCw, X, AlertCircle, FileSpreadsheet, FileText,
  ChevronUp, ChevronDown, Loader2, Trophy,
} from "lucide-react";
import { becaPct, becaLabel } from "@/lib/adeudos-export";
import {
  type BecaRow, type TipoBeca, ETIQUETA_TIPO, ETIQUETA_TIPO_CORTA, tipoBeca,
  telefonosBeca, exportBecasToPdf, exportBecasToExcel,
} from "@/lib/becas-export";

/**
 * Reporte de Becas: quién tiene beca, de qué tipo y de cuánto.
 *
 * La beca es un dato de la FICHA del jugador, no de la temporada (columnas Beca y
 * BecaLigas de tblJugadores), así que esta pantalla no lleva selector de temporada: el
 * corte que sí cambia la lectura es el estatus, activo o baja. Se trae todo de una vez
 * —son unos cientos de becados— y se filtra en el navegador.
 */

type FiltroTipo = "todos" | TipoBeca;
type FiltroEstatus = "activos" | "bajas" | "todos";
type OrdenKey = "Jugador" | "SedeNombre" | "Categoria" | "Edad" | "Beca" | "BecaLigas";

/** "Solo copas y ligas": becado sin descuento en mensualidades. Es su propio grupo. */
const SOLO_LIGAS = "Solo copas y ligas";

const ESTILO_TIPO: Record<TipoBeca, string> = {
  mensualidades: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  ligas: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  ambas: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
};

const SELECT =
  "appearance-none bg-white/5 border border-white/15 text-slate-200 text-xs py-2 pl-3 pr-8 rounded-lg leading-tight focus:outline-none focus:border-blue-500 [color-scheme:dark]";

/**
 * Reparto de los becados por nivel de beca de mensualidades.
 *
 * Solo se nombran los MAX_NIVELES niveles más numerosos, porque de un solo tono se
 * distinguen tres escalones y nada más; el resto cae en "Otras becas". Es la misma
 * regla que usa el panel de Becados de Inscripciones, para que el mismo "Beca 50%" no
 * se vea de un color aquí y de otro allá.
 */
function rebanadasPorNivel(rows: BecaRow[]): Rebanada[] {
  const conteo = new Map<number, number>();
  let soloLigas = 0;

  rows.forEach((b) => {
    const pct = becaPct(b.Beca as string);
    if (pct === 0) {
      soloLigas += 1;
      return;
    }
    conteo.set(pct, (conteo.get(pct) ?? 0) + 1);
  });

  // De mayor a menor porcentaje: es el orden que representa la rampa de color.
  const niveles = [...conteo.entries()].sort((a, b) => b[0] - a[0]);
  const masNumerosos = [...niveles].sort((a, b) => b[1] - a[1]).slice(0, MAX_NIVELES);
  const nombrados = niveles.filter((e) => masNumerosos.includes(e));
  const otras = niveles
    .filter((e) => !masNumerosos.includes(e))
    .reduce((suma, [, cantidad]) => suma + cantidad, 0);

  return [
    ...nombrados.map(([pct, cantidad], i) => ({
      etiqueta: becaLabel(pct),
      cantidad,
      color: BECA_RAMPA[i],
    })),
    ...(otras > 0 ? [{ etiqueta: "Otras becas", cantidad: otras, color: OTRAS_BECAS_COLOR }] : []),
    ...(soloLigas > 0 ? [{ etiqueta: SOLO_LIGAS, cantidad: soloLigas, color: SIN_BECA_COLOR }] : []),
  ];
}

export default function BecasPage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const puedeVer = usePuedeVer("/jugadores/becas");

  const [filas, setFilas] = useState<BecaRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [sedeFiltro, setSedeFiltro] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<FiltroTipo>("todos");
  /** Nivel de beca de mensualidades, en porcentaje. "" = todos. */
  const [nivelFiltro, setNivelFiltro] = useState("");
  const [estatusFiltro, setEstatusFiltro] = useState<FiltroEstatus>("activos");
  const [orden, setOrden] = useState<{ key: OrdenKey; dir: "asc" | "desc" } | null>(null);

  useEffect(() => {
    if (isInitialized && !user) router.push("/login");
  }, [user, isInitialized, router]);

  const cargar = useCallback(async () => {
    if (!user || !puedeVer) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/jugadores/becas");
      const json = await res.json();
      if (json.success) setFilas(json.data);
      else setError(json.message ?? "Error al cargar el reporte de becas");
    } catch {
      setError("Error de conexión");
    } finally {
      setIsLoading(false);
    }
  }, [user, puedeVer]);

  useEffect(() => { cargar(); }, [cargar]);

  // Catálogos de los filtros, derivados de los propios datos.
  const sedes = useMemo(
    () => [...new Set(filas.map((b) => b.SedeNombre).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [filas],
  );
  const categorias = useMemo(() => {
    const base = sedeFiltro ? filas.filter((b) => b.SedeNombre === sedeFiltro) : filas;
    return [...new Set(base.map((b) => b.Categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [filas, sedeFiltro]);
  const niveles = useMemo(
    () => [...new Set(filas.map((b) => becaPct(b.Beca as string)).filter((p) => p > 0))].sort((a, b) => b - a),
    [filas],
  );

  /* Base del reporte: sede, categoría, estatus y búsqueda, SIN los cortes de tipo y
     nivel. Los indicadores y la dona se calculan sobre esta base para que sigan
     diciendo lo mismo cuando uno de esos dos cortes está puesto. */
  const base = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((b) => {
      if (estatusFiltro === "activos" && b.Status !== 0) return false;
      if (estatusFiltro === "bajas" && b.Status !== 2) return false;
      if (sedeFiltro && b.SedeNombre !== sedeFiltro) return false;
      if (categoriaFiltro && b.Categoria !== categoriaFiltro) return false;
      if (q && !b.Jugador.toLowerCase().includes(q) && String(b.IdJugador) !== q) return false;
      return true;
    });
  }, [filas, busqueda, sedeFiltro, categoriaFiltro, estatusFiltro]);

  const filtrados = useMemo(() => {
    let out = base.filter((b) => {
      if (tipoFiltro !== "todos" && tipoBeca(b) !== tipoFiltro) return false;
      if (nivelFiltro && becaPct(b.Beca as string) !== Number(nivelFiltro)) return false;
      return true;
    });

    if (orden) {
      const dir = orden.dir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        if (orden.key === "Edad") return ((a.Edad ?? 0) - (b.Edad ?? 0)) * dir;
        if (orden.key === "Beca") return (becaPct(a.Beca as string) - becaPct(b.Beca as string)) * dir;
        if (orden.key === "BecaLigas") {
          return (becaPct(a.BecaLigas as string) - becaPct(b.BecaLigas as string)) * dir;
        }
        return String(a[orden.key] ?? "").localeCompare(String(b[orden.key] ?? "")) * dir;
      });
    }
    return out;
  }, [base, tipoFiltro, nivelFiltro, orden]);

  const kpis = useMemo(() => ({
    becados: base.length,
    completas: base.filter((b) => becaPct(b.Beca as string) >= 100).length,
    parciales: base.filter((b) => {
      const pct = becaPct(b.Beca as string);
      return pct > 0 && pct < 100;
    }).length,
    ligas: base.filter((b) => becaPct(b.BecaLigas as string) > 0).length,
  }), [base]);

  const rebanadas = useMemo(() => rebanadasPorNivel(base), [base]);

  const hayFiltros = Boolean(
    busqueda || sedeFiltro || categoriaFiltro || tipoFiltro !== "todos" ||
    nivelFiltro || estatusFiltro !== "activos",
  );

  const limpiarFiltros = () => {
    setBusqueda("");
    setSedeFiltro("");
    setCategoriaFiltro("");
    setTipoFiltro("todos");
    setNivelFiltro("");
    setEstatusFiltro("activos");
  };

  /**
   * Al tocar una rebanada se filtra por lo que representa. "Otras becas" no tiene un
   * nivel único que aplicar, así que solo se puede quitar el corte que hubiera.
   */
  const seleccionarRebanada = (etiqueta: string) => {
    if (etiqueta === SOLO_LIGAS) {
      setNivelFiltro("");
      setTipoFiltro((prev) => (prev === "ligas" ? "todos" : "ligas"));
      return;
    }
    if (etiqueta === "Otras becas") {
      setNivelFiltro("");
      return;
    }
    const pct = String(becaPct(etiqueta.replace(/[^\d.]/g, "")));
    setTipoFiltro("todos");
    setNivelFiltro((prev) => (prev === pct ? "" : pct));
  };

  const subtituloExport = useMemo(() => {
    const partes: string[] = [];
    if (sedeFiltro) partes.push(sedeFiltro);
    if (categoriaFiltro) partes.push(categoriaFiltro);
    if (tipoFiltro !== "todos") partes.push(`Beca: ${ETIQUETA_TIPO[tipoFiltro]}`);
    if (nivelFiltro) partes.push(becaLabel(Number(nivelFiltro)));
    partes.push(estatusFiltro === "activos" ? "Activos" : estatusFiltro === "bajas" ? "Bajas" : "Activos y bajas");
    if (busqueda.trim()) partes.push(`Búsqueda: ${busqueda.trim()}`);
    return partes.join(" · ");
  }, [sedeFiltro, categoriaFiltro, tipoFiltro, nivelFiltro, estatusFiltro, busqueda]);

  const exportar = async (formato: "pdf" | "excel") => {
    if (filtrados.length === 0) return;
    setExporting(true);
    try {
      if (formato === "pdf") exportBecasToPdf(filtrados, "Reporte de Becas", subtituloExport);
      else await exportBecasToExcel(filtrados, "Reporte de Becas", subtituloExport);
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
                  <GraduationCap className="text-purple-400" size={28} />
                  Becas
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Todos los jugadores con beca, con el tipo y el porcentaje que tienen registrado en su ficha.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
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

            {/* Indicadores */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <Kpi
                etiqueta="Becados"
                valor={kpis.becados}
                clase="text-white"
                nota="Con beca de mensualidades, de ligas o ambas"
              />
              <Kpi
                etiqueta="Beca del 100%"
                valor={kpis.completas}
                clase="text-purple-300"
                title="Beca total en inscripción y mensualidades. Es la única que exime de adeudo en el sistema."
              />
              <Kpi
                etiqueta="Beca parcial"
                valor={kpis.parciales}
                clase="text-purple-200"
                title="Descuento menor al 100% en inscripción y mensualidades."
              />
              <Kpi
                etiqueta="Copas y ligas"
                valor={kpis.ligas}
                clase="text-amber-300"
                title="Descuento sobre el precio de las convocatorias de copas y ligas (BecaLigas)."
              />
            </div>

            {/* Reparto por nivel: la dona y su leyenda, que filtra al tocarla */}
            {!isLoading && !error && base.length > 0 && (
              <div className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-5 mb-6">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="relative flex-shrink-0">
                    <BecasDonut rebanadas={rebanadas} total={base.length} tamano={132} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-2xl font-black text-purple-200 leading-none tabular-nums">
                        {base.length}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 leading-none mt-1">becados</span>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 w-full space-y-1">
                    {rebanadas.filter((r) => r.cantidad > 0).map((r) => {
                      const pct = Math.round((r.cantidad / base.length) * 100);
                      return (
                        <button
                          key={r.etiqueta}
                          type="button"
                          onClick={() => seleccionarRebanada(r.etiqueta)}
                          title={`${r.etiqueta}: ${r.cantidad} de ${base.length} becados`}
                          className="w-full flex items-center gap-2 text-left rounded-lg px-1.5 py-1 hover:bg-white/10 transition-colors"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: r.color }}
                          />
                          <span className="text-xs font-bold text-slate-200 flex-1 truncate">{r.etiqueta}</span>
                          <span className="text-xs font-black text-white tabular-nums">{r.cantidad}</span>
                          <span className="text-[10px] font-bold text-slate-500 tabular-nums w-9 text-right">{pct}%</span>
                        </button>
                      );
                    })}
                    <p className="text-[10px] text-slate-500 pt-1">
                      Reparto por nivel de beca de inscripción y mensualidades. Toca un nivel para ver solo esos jugadores.
                    </p>
                  </div>
                </div>
              </div>
            )}

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
              <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value as FiltroTipo)} className={SELECT}>
                <option value="todos">Tipo: todos</option>
                {(Object.keys(ETIQUETA_TIPO) as TipoBeca[]).map((t) => (
                  <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>
                ))}
              </select>
              <select value={nivelFiltro} onChange={(e) => setNivelFiltro(e.target.value)} className={SELECT}>
                <option value="">Nivel: todos</option>
                {niveles.map((n) => <option key={n} value={n}>{becaLabel(n)}</option>)}
              </select>
              <select value={estatusFiltro} onChange={(e) => setEstatusFiltro(e.target.value as FiltroEstatus)} className={SELECT}>
                <option value="activos">Activos</option>
                <option value="bajas">Bajas</option>
                <option value="todos">Activos y bajas</option>
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
                <p className="text-sm font-bold">Cargando becas...</p>
              </div>
            ) : error ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-rose-400">
                <AlertCircle size={36} className="opacity-60" />
                <p className="text-sm font-black">{error}</p>
              </div>
            ) : filtrados.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-500">
                <GraduationCap size={40} className="opacity-20" />
                <p className="text-base font-black">Sin becados</p>
                <p className="text-xs opacity-60">Ningún jugador coincide con los filtros aplicados</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead className="bg-white/[0.07]">
                      <tr>
                        <Th label="ID" />
                        <Th label="Jugador" k="Jugador" />
                        <Th label="Sede" k="SedeNombre" />
                        <Th label="Categoría" k="Categoria" />
                        <Th label="Edad" k="Edad" />
                        <Th label="Tipo de beca" />
                        <Th label="Beca" k="Beca" />
                        <Th label="Beca ligas" k="BecaLigas" />
                        <Th label="Teléfonos" />
                        <Th label="Estatus" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filtrados.map((b) => {
                        const tipo = tipoBeca(b);
                        const pct = becaPct(b.Beca as string);
                        const pctLigas = becaPct(b.BecaLigas as string);
                        return (
                          <tr key={b.IdJugador} className="hover:bg-white/[0.04] transition-colors">
                            <td className="px-3 py-2 text-slate-500 text-xs font-mono">{b.IdJugador}</td>
                            <td className="px-3 py-2">
                              <p className="text-slate-100 font-semibold text-xs">{b.Jugador}</p>
                              {b.FechaNacimiento && (
                                <p className="text-[10px] text-slate-500">{b.FechaNacimiento}</p>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-300 text-xs">{b.SedeNombre || "—"}</td>
                            <td className="px-3 py-2">
                              <span className="text-[10px] font-black px-2 py-1 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30 whitespace-nowrap">
                                {b.Categoria || "—"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-400 text-xs">{b.Edad ?? "—"}</td>
                            <td className="px-3 py-2">
                              <span
                                title={ETIQUETA_TIPO[tipo]}
                                className={`text-[10px] font-black px-2 py-1 rounded-md border whitespace-nowrap inline-flex items-center gap-1 ${ESTILO_TIPO[tipo]}`}
                              >
                                {tipo === "ligas" ? <Trophy size={11} /> : <GraduationCap size={11} />}
                                {ETIQUETA_TIPO_CORTA[tipo]}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs font-black tabular-nums text-purple-300">
                              {pct > 0 ? `${pct}%` : <span className="text-slate-600 font-normal">—</span>}
                            </td>
                            <td className="px-3 py-2 text-xs font-black tabular-nums text-amber-300">
                              {pctLigas > 0 ? `${pctLigas}%` : <span className="text-slate-600 font-normal">—</span>}
                            </td>
                            <td className="px-3 py-2 text-slate-400 text-[11px]">{telefonosBeca(b) || "—"}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] font-bold ${b.Status === 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {b.Status === 0 ? "ACTIVO" : "BAJA"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-slate-500 mt-3">
                  {filtrados.length.toLocaleString("es-MX")} becado(s) en la lista. La beca del 100% no paga inscripción
                  ni mensualidades; la de copas y ligas descuenta ese porcentaje del precio de cada convocatoria.
                </p>
              </>
            )}
          </div>
        </div>
      </main>
    </DashboardLayout>
  );
}

function Kpi({
  etiqueta,
  valor,
  clase,
  nota,
  title,
}: {
  etiqueta: string;
  valor: number;
  clase: string;
  /** Renglón chico bajo la cifra: contra qué se mide. */
  nota?: string;
  /** Explicación al pasar el mouse: qué cuenta exactamente. */
  title?: string;
}) {
  return (
    <div title={title} className="rounded-xl px-4 py-3 border bg-white/5 border-white/10">
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{etiqueta}</p>
      <p className={`text-2xl font-black ${clase}`}>{valor.toLocaleString("es-MX")}</p>
      {nota && <p className="text-[9px] font-bold text-slate-500">{nota}</p>}
    </div>
  );
}
