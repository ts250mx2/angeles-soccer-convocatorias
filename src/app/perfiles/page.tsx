"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Plus,
  RefreshCw,
  AlertCircle,
  Check,
  Save,
  Undo2,
  Users,
  Trash2,
  Pencil,
  X,
  Loader2,
} from "lucide-react";
import { useUser } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import IconoNav from "@/components/IconoNav";
import { CLAVES_BASICAS, CLAVE_PERFILES, PAGINAS } from "@/lib/navegacion";

interface Perfil {
  IdPuesto: number;
  Puesto: string;
  Status: number;
  Usuarios: number;
  UsuariosActivos: number;
  paginas: string[];
}

/** Módulos agrupados como se ven en el menú, para que la pantalla se lea igual. */
const GRUPOS: { nombre: string; modulos: typeof PAGINAS }[] = (() => {
  const orden: string[] = [];
  const porGrupo = new Map<string, typeof PAGINAS>();
  for (const pagina of PAGINAS) {
    const grupo = pagina.grupo ?? "Módulos principales";
    if (!porGrupo.has(grupo)) {
      porGrupo.set(grupo, []);
      orden.push(grupo);
    }
    porGrupo.get(grupo)!.push(pagina);
  }
  return orden.map((nombre) => ({ nombre, modulos: porGrupo.get(nombre)! }));
})();

const mismasClaves = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

export default function PerfilesPage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();

  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [idPuestoActual, setIdPuestoActual] = useState<number | null>(null);
  const [seleccionado, setSeleccionado] = useState<number | null>(null);
  const [borrador, setBorrador] = useState<string[]>([]);
  const [nombreEditado, setNombreEditado] = useState("");
  const [editandoNombre, setEditandoNombre] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");

  useEffect(() => {
    if (isInitialized && !user) router.push("/login");
  }, [user, isInitialized, router]);

  const cargar = useCallback(async (idPreferido?: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/perfiles");
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? "Error al cargar los perfiles");
        return;
      }
      setPerfiles(json.data);
      setIdPuestoActual(json.idPuestoActual ?? null);
      setSeleccionado((actual) => {
        const destino = idPreferido ?? actual ?? json.data[0]?.IdPuesto ?? null;
        const perfil = json.data.find((p: Perfil) => p.IdPuesto === destino) ?? json.data[0];
        setBorrador(perfil?.paginas ?? []);
        setNombreEditado(perfil?.Puesto ?? "");
        return perfil?.IdPuesto ?? null;
      });
    } catch {
      setError("Error de conexión");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) cargar();
  }, [user, cargar]);

  const perfil = perfiles.find((p) => p.IdPuesto === seleccionado) ?? null;
  const concedidas = useMemo(() => new Set(borrador), [borrador]);
  const hayCambios =
    !!perfil &&
    (!mismasClaves(borrador, perfil.paginas) || nombreEditado.trim() !== perfil.Puesto);

  const elegirPerfil = (p: Perfil) => {
    setSeleccionado(p.IdPuesto);
    setBorrador(p.paginas);
    setNombreEditado(p.Puesto);
    setEditandoNombre(false);
    setAviso(null);
    setError(null);
  };

  const alternar = (clave: string) => {
    setBorrador((prev) =>
      prev.includes(clave) ? prev.filter((c) => c !== clave) : [...prev, clave]
    );
  };

  const alternarGrupo = (modulos: typeof PAGINAS, encender: boolean) => {
    const claves = modulos.map((m) => m.clave);
    setBorrador((prev) =>
      encender
        ? [...new Set([...prev, ...claves])]
        : prev.filter((c) => !claves.includes(c))
    );
  };

  const descartar = () => {
    if (!perfil) return;
    setBorrador(perfil.paginas);
    setNombreEditado(perfil.Puesto);
    setEditandoNombre(false);
  };

  const guardar = async () => {
    if (!perfil) return;
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const res = await fetch(`/api/admin/perfiles/${perfil.IdPuesto}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puesto: nombreEditado.trim(), paginas: borrador }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? "No se pudo guardar");
        return;
      }
      setAviso(`Permisos de "${nombreEditado.trim()}" guardados.`);
      setEditandoNombre(false);
      await cargar(perfil.IdPuesto);
    } catch {
      setError("Error de conexión");
    } finally {
      setGuardando(false);
    }
  };

  const crear = async () => {
    const nombre = nombreNuevo.trim();
    if (nombre.length < 3) {
      setError("El nombre del perfil debe tener al menos 3 caracteres");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/perfiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Nace con los módulos que hoy ve cualquier usuario; el resto se concede aquí.
        body: JSON.stringify({ puesto: nombre, paginas: CLAVES_BASICAS }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? "No se pudo crear el perfil");
        return;
      }
      setCreando(false);
      setNombreNuevo("");
      setAviso(`Perfil "${nombre}" creado. Marca los módulos que debe ver.`);
      await cargar(json.IdPuesto);
    } catch {
      setError("Error de conexión");
    } finally {
      setGuardando(false);
    }
  };

  const darDeBaja = async (p: Perfil) => {
    if (!confirm(`¿Dar de baja el perfil "${p.Puesto}"? Dejará de aparecer al asignar usuarios.`)) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/perfiles/${p.IdPuesto}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? "No se pudo dar de baja el perfil");
        return;
      }
      setAviso(`Perfil "${p.Puesto}" dado de baja.`);
      await cargar();
    } catch {
      setError("Error de conexión");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white">
        {/* ── Header ── */}
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center sticky top-0 z-20">
          <div>
            <h1 className="text-xl font-black flex items-center gap-2">
              <ShieldCheck size={20} className="text-blue-400" />
              Perfiles y Permisos
            </h1>
            <p className="text-xs text-blue-300 mt-0.5">
              Qué pantallas puede ver cada perfil
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setCreando(true); setNombreNuevo(""); setError(null); }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-200 text-xs font-bold transition-all"
            >
              <Plus size={15} /> Nuevo perfil
            </button>
            <button
              onClick={() => cargar()}
              disabled={isLoading}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all"
              title="Actualizar"
            >
              <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="p-6 md:p-8">
          {(error || aviso) && (
            <div
              className={`mb-5 px-4 py-3 rounded-2xl border text-sm font-bold flex items-center gap-2 ${
                error
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-200"
                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
              }`}
            >
              {error ? <AlertCircle size={16} /> : <Check size={16} />}
              <span className="flex-1">{error ?? aviso}</span>
              <button onClick={() => { setError(null); setAviso(null); }} className="opacity-60 hover:opacity-100">
                <X size={15} />
              </button>
            </div>
          )}

          {isLoading && perfiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-28 gap-4">
              <div className="w-14 h-14 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
              <p className="text-sm text-slate-400 font-bold animate-pulse">Cargando perfiles...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
              {/* ── Lista de perfiles ── */}
              <div className="bg-white/5 border border-white/10 rounded-3xl p-3 lg:sticky lg:top-28">
                <p className="px-2 py-2 text-[10px] uppercase tracking-widest text-slate-500 font-black">
                  {perfiles.length} perfil{perfiles.length !== 1 ? "es" : ""}
                </p>
                <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                  {perfiles.map((p) => {
                    const activo = p.IdPuesto === seleccionado;
                    const deBaja = p.Status !== 0;
                    return (
                      <button
                        key={p.IdPuesto}
                        onClick={() => elegirPerfil(p)}
                        className={`w-full text-left px-3 py-2.5 rounded-2xl border transition-all group ${
                          activo
                            ? "bg-blue-600/20 border-blue-500/30 text-blue-100"
                            : "bg-transparent border-transparent text-slate-400 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black truncate flex-1">{p.Puesto}</span>
                          {p.IdPuesto === idPuestoActual && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 font-black flex-shrink-0">
                              TÚ
                            </span>
                          )}
                          {deBaja && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-slate-500/20 text-slate-400 font-black flex-shrink-0">
                              BAJA
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <Users size={11} /> {p.UsuariosActivos}
                          </span>
                          <span className="flex items-center gap-1">
                            <ShieldCheck size={11} /> {p.paginas.length} de {PAGINAS.length}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Editor de permisos ── */}
              {!perfil ? (
                <div className="bg-white/5 border border-white/10 rounded-3xl p-12 text-center text-slate-500">
                  <ShieldCheck size={44} className="mx-auto opacity-20 mb-3" />
                  <p className="font-black">Elige un perfil para editar sus permisos</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Cabecera del perfil */}
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        {editandoNombre ? (
                          <div className="flex items-center gap-2">
                            <input
                              value={nombreEditado}
                              onChange={(e) => setNombreEditado(e.target.value)}
                              autoFocus
                              className="bg-slate-800/70 border border-slate-600 focus:border-blue-400 rounded-xl px-3 py-2 text-lg font-black outline-none"
                            />
                            <button
                              onClick={() => setEditandoNombre(false)}
                              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400"
                              title="Listo"
                            >
                              <Check size={15} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditandoNombre(true)}
                            className="group flex items-center gap-2 text-left"
                            title="Cambiar el nombre del perfil"
                          >
                            <h2 className="text-lg font-black">{nombreEditado}</h2>
                            <Pencil size={14} className="text-slate-500 group-hover:text-blue-300" />
                          </button>
                        )}
                        <p className="text-xs text-slate-500 mt-1">
                          {perfil.UsuariosActivos} usuario{perfil.UsuariosActivos !== 1 ? "s" : ""} activo
                          {perfil.UsuariosActivos !== 1 ? "s" : ""} · {borrador.length} de {PAGINAS.length} módulos
                        </p>
                      </div>

                      <button
                        onClick={() => darDeBaja(perfil)}
                        disabled={guardando || perfil.IdPuesto === idPuestoActual}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        title={
                          perfil.IdPuesto === idPuestoActual
                            ? "No puedes dar de baja tu propio perfil"
                            : "Dar de baja el perfil"
                        }
                      >
                        <Trash2 size={14} /> Dar de baja
                      </button>
                    </div>
                  </div>

                  {/* Grupos de módulos */}
                  {GRUPOS.map(({ nombre, modulos }) => {
                    const marcados = modulos.filter((m) => concedidas.has(m.clave)).length;
                    const todos = marcados === modulos.length;
                    return (
                      <div key={nombre} className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-white/5">
                          <h3 className="text-xs font-black uppercase tracking-widest text-slate-300">
                            {nombre}
                          </h3>
                          <button
                            onClick={() => alternarGrupo(modulos, !todos)}
                            className="text-[10px] font-black uppercase tracking-wider text-blue-300 hover:text-blue-200 transition-colors"
                          >
                            {todos ? "Quitar todos" : "Marcar todos"} ({marcados}/{modulos.length})
                          </button>
                        </div>
                        <div className="divide-y divide-white/5">
                          {modulos.map((modulo) => {
                            const marcado = concedidas.has(modulo.clave);
                            const esCandado =
                              modulo.clave === CLAVE_PERFILES && perfil.IdPuesto === idPuestoActual;
                            return (
                              <label
                                key={modulo.clave}
                                className={`flex items-center gap-3 px-5 py-3 transition-colors ${
                                  esCandado ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-white/5"
                                }`}
                                title={
                                  esCandado
                                    ? "No puedes quitarle este módulo a tu propio perfil: perderías esta pantalla"
                                    : undefined
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={marcado}
                                  disabled={esCandado}
                                  onChange={() => alternar(modulo.clave)}
                                  className="sr-only"
                                />
                                <span
                                  className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-all ${
                                    marcado
                                      ? "bg-blue-600 border-blue-500 text-white"
                                      : "bg-slate-800/60 border-slate-600 text-transparent"
                                  }`}
                                >
                                  <Check size={13} strokeWidth={3.5} />
                                </span>
                                <span className={marcado ? "text-blue-300" : "text-slate-600"}>
                                  <IconoNav nombre={modulo.icono} size={16} />
                                </span>
                                <span className="flex-1 min-w-0">
                                  <span className={`block text-sm font-bold truncate ${marcado ? "text-white" : "text-slate-400"}`}>
                                    {modulo.label}
                                  </span>
                                  <span className="block text-[10px] text-slate-500 font-mono truncate">
                                    {modulo.clave}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Barra de guardado */}
                  <div className="sticky bottom-4 mr-16 flex items-center justify-end gap-3 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 shadow-2xl">
                    <p className="flex-1 text-xs text-slate-500 font-bold">
                      {hayCambios ? "Hay cambios sin guardar" : "Todo guardado"}
                    </p>
                    <button
                      onClick={descartar}
                      disabled={!hayCambios || guardando}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-bold transition-all disabled:opacity-30"
                    >
                      <Undo2 size={14} /> Descartar
                    </button>
                    <button
                      onClick={guardar}
                      disabled={!hayCambios || guardando}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Guardar cambios
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Alta de perfil ── */}
        {creando && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-3xl p-6 shadow-2xl">
              <h2 className="text-lg font-black mb-1">Nuevo perfil</h2>
              <p className="text-xs text-slate-500 mb-5">
                Nace con los módulos básicos (Convocatorias, Inscripciones y Manual). El resto se
                marca después.
              </p>
              <input
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && crear()}
                autoFocus
                placeholder="Nombre del perfil, p. ej. RECEPCIÓN"
                className="w-full bg-slate-800/70 border border-slate-600 focus:border-blue-400 rounded-xl px-4 py-3 text-sm font-bold outline-none placeholder-slate-600"
              />
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setCreando(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-bold transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={crear}
                  disabled={guardando}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black transition-all disabled:opacity-40"
                >
                  {guardando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Crear perfil
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}
