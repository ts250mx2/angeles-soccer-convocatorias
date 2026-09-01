"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, usePuedeVer } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import PlayersModal, { type PlayersModalConfig } from "@/components/PlayersModal";
import {
  LayoutGrid, Search, RefreshCw, X, AlertCircle, Loader2, Users, MapPin,
  GraduationCap, AlertTriangle, List, ChevronRight,
} from "lucide-react";

/**
 * Categorías: los grupos que hoy tienen gente inscrita, con cómo van de pagos.
 *
 * El corte es categoría + SEDE, no la categoría sola: "2016A" existe en varias sedes y
 * cada una es un grupo distinto, con su entrenador y su gente. Juntarlas daría un número
 * que no le sirve a nadie.
 *
 * Al abrir un grupo sale el listado de alumnos en el mismo modal que usan Inscripciones
 * y Adeudos —con sus exportaciones a PDF, Excel y Excel de movimientos, y ahora también
 * el teléfono de los papás—, para que la lista de un grupo diga exactamente lo mismo se
 * llegue por donde se llegue.
 */

interface Temporada {
  IdTemporada: number;
  Temporada: string;
  EsActiva: boolean;
}

interface GrupoCategoria {
  categoria: string;
  idSede: number;
  sede: string;
  /** Inscritos de la temporada. Incluye a los becados. */
  inscritos: number;
  becados: number;
  conAdeudo: number;
}

type Vista = "tarjetas" | "renglones";

const SELECT =
  "appearance-none bg-white/5 border border-white/15 text-slate-200 text-xs py-2 pl-3 pr-8 rounded-lg leading-tight focus:outline-none focus:border-blue-500 [color-scheme:dark]";

export default function CategoriasPage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const puedeVer = usePuedeVer("/jugadores/categorias");

  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [temporadaId, setTemporadaId] = useState<number | null>(null);
  const [grupos, setGrupos] = useState<GrupoCategoria[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [sedeFiltro, setSedeFiltro] = useState("");
  const [vista, setVista] = useState<Vista>("tarjetas");
  const [abierta, setAbierta] = useState<PlayersModalConfig | null>(null);

  useEffect(() => {
    if (isInitialized && !user) router.push("/login");
  }, [user, isInitialized, router]);

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
      const res = await fetch(`/api/jugadores/categorias?temporadaId=${temporadaId}`);
      const json = await res.json();
      if (json.success) setGrupos(json.data);
      else setError(json.message ?? "Error al cargar las categorías");
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

  const sedes = useMemo(
    () => [...new Set(grupos.map((g) => g.sede))].sort((a, b) => a.localeCompare(b)),
    [grupos],
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return grupos.filter((g) => {
      if (sedeFiltro && g.sede !== sedeFiltro) return false;
      if (!q) return true;
      return g.categoria.toLowerCase().includes(q) || g.sede.toLowerCase().includes(q);
    });
  }, [grupos, busqueda, sedeFiltro]);

  const totales = useMemo(() => filtrados.reduce(
    (t, g) => ({
      grupos: t.grupos + 1,
      inscritos: t.inscritos + g.inscritos,
      becados: t.becados + g.becados,
      conAdeudo: t.conAdeudo + g.conAdeudo,
    }),
    { grupos: 0, inscritos: 0, becados: 0, conAdeudo: 0 },
  ), [filtrados]);

  /* El listado del grupo: el mismo modal de siempre, acotado a esa categoría y esa
     sede. De ahí salen las tres exportaciones. */
  const abrirGrupo = (g: GrupoCategoria) =>
    setAbierta({
      title: `Categoría ${g.categoria}`,
      subtitle: [g.sede, temporadaNombre].filter(Boolean).join(" · "),
      filtro: "inscritos",
      categoria: g.categoria,
      sedeId: g.idSede,
    });

  const hayFiltros = Boolean(busqueda || sedeFiltro);

  return (
    <DashboardLayout>
      <main className="p-4 md:p-8 overflow-y-auto flex-1">
        <div className="max-w-7xl mx-auto">
          <div className="bg-[#0f172a] backdrop-blur-sm rounded-xl shadow-2xl p-4 md:p-8 border border-white/20">

            {/* Encabezado */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                  <LayoutGrid className="text-blue-400" size={28} />
                  Categorías
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Los grupos con gente inscrita en la temporada, por sede, con cómo van de pagos.
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
                <div className="flex bg-white/5 border border-white/10 p-1 rounded-lg">
                  <button
                    onClick={() => setVista("tarjetas")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${vista === "tarjetas" ? "bg-white/15 text-white" : "text-slate-500 hover:text-white"}`}
                  >
                    <LayoutGrid size={13} />
                    <span className="text-xs font-bold">Tarjetas</span>
                  </button>
                  <button
                    onClick={() => setVista("renglones")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${vista === "renglones" ? "bg-white/15 text-white" : "text-slate-500 hover:text-white"}`}
                  >
                    <List size={13} />
                    <span className="text-xs font-bold">Renglones</span>
                  </button>
                </div>
                <button
                  onClick={cargar}
                  disabled={isLoading}
                  className="p-2 rounded-lg bg-white/5 border border-white/15 text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-40"
                  title="Actualizar"
                >
                  <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            {/* Indicadores */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <Kpi etiqueta="Grupos" valor={totales.grupos} clase="text-white" />
              <Kpi
                etiqueta="Total inscritos"
                valor={totales.inscritos}
                clase="text-emerald-300"
                nota="Incluye becados"
              />
              <Kpi etiqueta="Con adeudos" valor={totales.conAdeudo} clase="text-rose-300" />
              <Kpi etiqueta="Becados" valor={totales.becados} clase="text-purple-300" />
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar categoría o sede..."
                  className="w-full bg-white/5 border border-white/15 text-slate-200 text-xs py-2 pl-9 pr-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500"
                />
              </div>
              <select value={sedeFiltro} onChange={(e) => setSedeFiltro(e.target.value)} className={SELECT}>
                <option value="">Todas las sedes</option>
                {sedes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {hayFiltros && (
                <button
                  onClick={() => { setBusqueda(""); setSedeFiltro(""); }}
                  className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-white/5 border border-white/15 text-slate-400 hover:text-white text-xs transition-colors"
                >
                  <X size={12} /> Limpiar
                </button>
              )}
            </div>

            {/* Cuerpo */}
            {isLoading ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 size={30} className="animate-spin text-blue-500" />
                <p className="text-sm font-bold">Cargando categorías...</p>
              </div>
            ) : error ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-rose-400">
                <AlertCircle size={36} className="opacity-60" />
                <p className="text-sm font-black">{error}</p>
              </div>
            ) : filtrados.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-500">
                <LayoutGrid size={40} className="opacity-20" />
                <p className="text-base font-black">Sin categorías</p>
                <p className="text-xs opacity-60">
                  {grupos.length === 0
                    ? "Ninguna categoría tiene gente inscrita en esta temporada"
                    : "Ninguna coincide con los filtros"}
                </p>
              </div>
            ) : vista === "tarjetas" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtrados.map((g) => (
                  <TarjetaCategoria key={`${g.categoria}-${g.idSede}`} grupo={g} onAbrir={() => abrirGrupo(g)} />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full text-sm min-w-[760px]">
                  <thead className="bg-white/[0.07]">
                    <tr>
                      <Th label="Categoría" />
                      <Th label="Sede" />
                      <Th label="Total inscritos" nota="Incluye becados" className="text-center" />
                      <Th label="Con adeudos" className="text-center" />
                      <Th label="Becados" className="text-center" />
                      <Th label="" className="text-right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filtrados.map((g) => (
                      <tr
                        key={`${g.categoria}-${g.idSede}`}
                        onClick={() => abrirGrupo(g)}
                        className="hover:bg-white/[0.04] cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2.5">
                          <span className="text-xs font-black px-2 py-1 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30 whitespace-nowrap">
                            {g.categoria}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-300">{g.sede}</td>
                        <td className="px-3 py-2.5 text-center text-sm font-black text-emerald-300 tabular-nums">
                          {g.inscritos}
                        </td>
                        <td className={`px-3 py-2.5 text-center text-sm font-black tabular-nums ${g.conAdeudo > 0 ? "text-rose-300" : "text-slate-600"}`}>
                          {g.conAdeudo}
                        </td>
                        <td className={`px-3 py-2.5 text-center text-sm font-black tabular-nums ${g.becados > 0 ? "text-purple-300" : "text-slate-600"}`}>
                          {g.becados}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <ChevronRight size={15} className="text-slate-600 inline" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-[10px] text-slate-500 mt-4">
              Un grupo es categoría + sede: la misma categoría en dos sedes son dos grupos. Al abrir uno se
              ve su listado de alumnos, con el teléfono de los papás y sus exportaciones a PDF, Excel y Excel
              de movimientos.
            </p>
          </div>
        </div>
      </main>

      {/* El listado del grupo: el mismo modal de Inscripciones y Adeudos */}
      <PlayersModal
        config={abierta}
        temporadaId={temporadaId}
        temporadaNombre={temporadaNombre}
        onClose={() => setAbierta(null)}
        onDataChanged={cargar}
      />
    </DashboardLayout>
  );
}

function Th({ label, nota, className }: { label: string; nota?: string; className?: string }) {
  return (
    <th className={`px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap ${className ?? ""}`}>
      {label}
      {nota && <span className="block text-[8px] font-bold text-slate-600 normal-case tracking-normal">{nota}</span>}
    </th>
  );
}

function Kpi({ etiqueta, valor, clase, nota }: {
  etiqueta: string; valor: number; clase: string; nota?: string;
}) {
  return (
    <div className="rounded-xl px-4 py-3 border bg-white/5 border-white/10">
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{etiqueta}</p>
      <p className={`text-2xl font-black ${clase}`}>{valor.toLocaleString("es-MX")}</p>
      {nota && <p className="text-[9px] font-bold text-slate-500">{nota}</p>}
    </div>
  );
}

function TarjetaCategoria({ grupo, onAbrir }: { grupo: GrupoCategoria; onAbrir: () => void }) {
  const g = grupo;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="w-full text-left bg-white/5 hover:bg-white/[0.08] border border-white/10 hover:border-blue-500/40 rounded-2xl p-4 transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-lg font-black text-white leading-tight truncate">{g.categoria}</p>
          <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5 truncate">
            <MapPin size={11} className="text-slate-500 flex-shrink-0" /> {g.sede}
          </p>
        </div>
        <ChevronRight size={16} className="text-slate-600 group-hover:text-blue-300 transition-colors flex-shrink-0" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5">
          <p className="text-[8.5px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
            <Users size={9} /> Inscritos
          </p>
          <p className="text-lg font-black text-emerald-300 tabular-nums leading-tight">{g.inscritos}</p>
          <p className="text-[8px] font-bold text-slate-500">Incluye becados</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5">
          <p className="text-[8.5px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
            <AlertTriangle size={9} /> Adeudos
          </p>
          <p className={`text-lg font-black tabular-nums leading-tight ${g.conAdeudo > 0 ? "text-rose-300" : "text-slate-600"}`}>
            {g.conAdeudo}
          </p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5">
          <p className="text-[8.5px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
            <GraduationCap size={9} /> Becados
          </p>
          <p className={`text-lg font-black tabular-nums leading-tight ${g.becados > 0 ? "text-purple-300" : "text-slate-600"}`}>
            {g.becados}
          </p>
        </div>
      </div>
    </button>
  );
}
