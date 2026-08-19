"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, usePuedeVer } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import {
  UserRoundPlus, Plus, RefreshCw, Search, AlertCircle, Pencil, Ban, RotateCcw, ArrowRight, Check,
} from "lucide-react";
import { VIGENTE, BAJA, yaAplicada, type IncorporacionRow, type OpcionProfesor, type OpcionTemporada } from "@/lib/incorporaciones";
import { NuevaIncorporacionModal, EditarIncorporacionModal } from "@/components/IncorporacionModal";

/**
 * Formato de incorporación.
 *
 * Es la versión en sistema del formato en Excel: una fila por jugador que cambia de
 * grupo, con quién lo propone, de dónde viene, a dónde va, por qué y quién lo autoriza.
 *
 * La pantalla NO mueve al jugador de categoría; deja constancia. Cuando el cambio ya se
 * aplicó en la plantilla, la fila lo marca como **aplicada** comparando el grupo del
 * formato contra la categoría que el jugador tiene hoy. Ver @/lib/incorporaciones.
 */

type FiltroEstado = "vigentes" | "canceladas" | "todas";

const SELECT =
  "bg-white/5 border border-white/15 text-slate-200 text-xs py-2 px-3 rounded-lg outline-none focus:border-blue-500 transition-colors";

const fechaCorta = (valor: string | null): string => {
  if (!valor) return "—";
  const [anio, mes, dia] = valor.slice(0, 10).split("-");
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : valor;
};

export default function IncorporacionesPage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const puedeVer = usePuedeVer("/incorporaciones");

  const [filas, setFilas] = useState<IncorporacionRow[]>([]);
  const [profesores, setProfesores] = useState<OpcionProfesor[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [temporadas, setTemporadas] = useState<OpcionTemporada[]>([]);
  const [temporadaId, setTemporadaId] = useState<number | null>(null);
  const [autorizante, setAutorizante] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [filtroProfesor, setFiltroProfesor] = useState<number | "todos">("todos");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("vigentes");

  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<IncorporacionRow | null>(null);

  useEffect(() => {
    if (isInitialized && !user) router.push("/login");
  }, [user, isInitialized, router]);

  const cargar = useCallback(async (temporada?: number | null) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (temporada) params.set("temporadaId", String(temporada));
      const res = await fetch(`/api/incorporaciones?${params}`);
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? "Error al cargar las incorporaciones");
        return;
      }
      setFilas(json.data);
      setProfesores(json.profesores);
      setCategorias(json.categorias);
      setTemporadas(json.temporadas);
      setTemporadaId(json.temporada);
      setAutorizante(json.autorizante);
    } catch {
      setError("Error de conexión");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sin el permiso, DashboardLayout pinta "Sin acceso": no hay nada que pedir.
  useEffect(() => {
    if (user && puedeVer) cargar();
  }, [user, puedeVer, cargar]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (filtroEstado === "vigentes" && f.Status !== VIGENTE) return false;
      if (filtroEstado === "canceladas" && f.Status !== BAJA) return false;
      if (filtroProfesor !== "todos" && f.IdProfesor !== filtroProfesor) return false;
      if (!q) return true;
      return [f.Jugador, f.Profesor, f.Procedencia, f.GrupoIncorporar, f.Justificacion, f.Sede]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [filas, busqueda, filtroProfesor, filtroEstado]);

  const kpis = useMemo(() => {
    const vigentes = filtradas.filter((f) => f.Status === VIGENTE);
    return {
      num: vigentes.length,
      aplicadas: vigentes.filter(yaAplicada).length,
      grupos: new Set(vigentes.map((f) => f.GrupoIncorporar)).size,
      profesores: new Set(vigentes.map((f) => f.IdProfesor).filter(Boolean)).size,
    };
  }, [filtradas]);

  const cambiarEstado = async (fila: IncorporacionRow, status: number) => {
    setAviso(null);
    try {
      const res = await fetch(`/api/incorporaciones/${fila.IdIncorporacion}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? "No se pudo cambiar el estado");
        return;
      }
      setAviso(status === BAJA ? "Incorporación cancelada" : "Incorporación reactivada");
      cargar(temporadaId);
    } catch {
      setError("Error de conexión");
    }
  };

  const temporadaActual = temporadas.find((t) => t.IdTemporada === temporadaId);

  return (
    <DashboardLayout>
      <main className="p-4 md:p-8 overflow-y-auto flex-1">
        <div className="max-w-7xl mx-auto">
          <div className="bg-[#0f172a] backdrop-blur-sm rounded-xl shadow-2xl p-4 md:p-8 border border-white/20">

            {/* Encabezado */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                  <UserRoundPlus className="text-blue-400" size={28} />
                  Incorporaciones
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Formato de incorporación: el paso de un jugador a otro grupo, con su justificación y autorización.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={temporadaId ?? ""}
                  onChange={(e) => { const t = Number(e.target.value); setTemporadaId(t); cargar(t); }}
                  className={SELECT}
                >
                  {temporadas.map((t) => (
                    <option key={t.IdTemporada} value={t.IdTemporada}>
                      {t.Temporada}{t.EsActiva ? " (activo)" : ""}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => cargar(temporadaId)}
                  disabled={isLoading}
                  title="Actualizar"
                  className="p-2 rounded-lg bg-white/5 border border-white/15 text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-40"
                >
                  <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={() => setCreando(true)}
                  disabled={!temporadaId}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors disabled:opacity-40"
                >
                  <Plus size={14} /> Nueva incorporación
                </button>
              </div>
            </div>

            {error && (
              <p className="flex items-start gap-2 mb-4 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
              </p>
            )}
            {aviso && (
              <p className="mb-4 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
                {aviso}
              </p>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <Kpi etiqueta="Incorporaciones" valor={String(kpis.num)} clase="text-blue-300" />
              <Kpi etiqueta="Ya aplicadas" valor={String(kpis.aplicadas)} clase="text-emerald-300" />
              <Kpi etiqueta="Grupos destino" valor={String(kpis.grupos)} clase="text-slate-200" />
              <Kpi etiqueta="Profesores" valor={String(kpis.profesores)} clase="text-slate-200" />
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por jugador, profesor, grupo o justificación..."
                  className="w-full bg-white/5 border border-white/15 text-slate-200 text-xs py-2 pl-9 pr-3 rounded-lg outline-none focus:border-blue-500"
                />
              </div>
              <select
                value={filtroProfesor}
                onChange={(e) => setFiltroProfesor(e.target.value === "todos" ? "todos" : Number(e.target.value))}
                className={SELECT}
              >
                <option value="todos">Todos los profesores</option>
                {profesores.map((p) => (
                  <option key={p.IdUsuario} value={p.IdUsuario}>{p.Usuario}</option>
                ))}
              </select>
              <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)} className={SELECT}>
                <option value="vigentes">Vigentes</option>
                <option value="canceladas">Canceladas</option>
                <option value="todas">Todas</option>
              </select>
            </div>

            {/* Tabla: las mismas columnas del formato */}
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <div className="w-9 h-9 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
                <p className="text-xs font-bold text-slate-500">Cargando incorporaciones...</p>
              </div>
            ) : filtradas.length === 0 ? (
              <div className="text-center py-16 bg-white/5 rounded-2xl border border-dashed border-white/10">
                <UserRoundPlus size={36} className="mx-auto text-slate-600 mb-3" />
                <h3 className="text-sm font-bold text-slate-300">
                  {filas.length === 0 ? "Todavía no hay incorporaciones" : "Nada coincide con los filtros"}
                </h3>
                <p className="text-xs text-slate-500 mt-1.5">
                  {filas.length === 0
                    ? `Pulsa "Nueva incorporación" para llenar el formato${temporadaActual ? ` del ciclo ${temporadaActual.Temporada}` : ""}.`
                    : "Prueba con otro profesor, otro estado o limpiando la búsqueda."}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5 text-[9px] uppercase font-black text-slate-500 tracking-widest border-b border-white/10">
                        <th className="px-3 py-3 text-center">#</th>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Profesor</th>
                        <th className="px-4 py-3">Jugador</th>
                        <th className="px-4 py-3">Procedencia</th>
                        <th className="px-4 py-3">Grupo a incorporar</th>
                        <th className="px-4 py-3">Justificación</th>
                        <th className="px-4 py-3">Autorización</th>
                        <th className="px-4 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                      {filtradas.map((f, i) => {
                        const cancelada = f.Status === BAJA;
                        const aplicada = yaAplicada(f);
                        return (
                          <tr key={f.IdIncorporacion} className={`transition-colors ${cancelada ? "opacity-50" : "hover:bg-white/5"}`}>
                            <td className="px-3 py-3 text-center text-[10px] font-mono text-slate-600 tabular-nums">{i + 1}</td>
                            <td className="px-4 py-3 text-xs tabular-nums whitespace-nowrap text-slate-400">
                              {fechaCorta(f.FechaCaptura)}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-300 max-w-[160px]">
                              <span className="block truncate">{f.Profesor ?? "—"}</span>
                            </td>
                            <td className="px-4 py-3">
                              <p className={`text-xs font-bold truncate max-w-[200px] ${cancelada ? "text-slate-400 line-through" : "text-white"}`}>
                                {f.Jugador}
                              </p>
                              {f.Sede && <span className="text-[10px] text-slate-500">{f.Sede}</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-block px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-bold text-slate-300">
                                {f.Procedencia || "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1.5">
                                <ArrowRight size={11} className="text-blue-400 flex-shrink-0" />
                                <span className="px-2 py-0.5 rounded bg-blue-600/20 border border-blue-500/40 text-[10px] font-black text-blue-200">
                                  {f.GrupoIncorporar}
                                </span>
                                {aplicada && (
                                  <span title="El jugador ya está en ese grupo" className="text-emerald-400">
                                    <Check size={12} />
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[11px] text-slate-400 max-w-[240px]">
                              <span className="line-clamp-2">{f.Justificacion || "—"}</span>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-[cursive] text-[13px] text-slate-200 leading-tight border-b border-slate-600/60 pb-0.5 max-w-[150px] truncate">
                                {f.Autorizacion ?? "—"}
                              </p>
                              <span className="text-[9px] uppercase tracking-widest text-slate-600">Autoriza</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setEditando(f)}
                                  title="Editar fecha, grupo o justificación"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors"
                                >
                                  <Pencil size={14} />
                                </button>
                                {cancelada ? (
                                  <button
                                    onClick={() => cambiarEstado(f, VIGENTE)}
                                    title="Volver a dejarla vigente"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                                  >
                                    <RotateCcw size={14} />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => cambiarEstado(f, BAJA)}
                                    title="Cancelar la incorporación (no se borra)"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                                  >
                                    <Ban size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {creando && temporadaId && (
          <NuevaIncorporacionModal
            temporadaId={temporadaId}
            temporada={temporadaActual?.Temporada ?? null}
            profesores={profesores}
            categorias={categorias}
            autorizante={autorizante}
            onClose={() => setCreando(false)}
            onGuardado={() => {
              setCreando(false);
              setAviso("Incorporación guardada");
              cargar(temporadaId);
            }}
          />
        )}

        {editando && (
          <EditarIncorporacionModal
            fila={editando}
            categorias={categorias}
            onClose={() => setEditando(null)}
            onGuardado={() => {
              setEditando(null);
              setAviso("Incorporación actualizada");
              cargar(temporadaId);
            }}
          />
        )}
      </main>
    </DashboardLayout>
  );
}

function Kpi({ etiqueta, valor, clase }: { etiqueta: string; valor: string; clase: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{etiqueta}</p>
      <p className={`text-lg font-black mt-0.5 tabular-nums ${clase}`}>{valor}</p>
    </div>
  );
}
