"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  UserCog,
  Plus,
  RefreshCw,
  AlertCircle,
  Check,
  Search,
  Pencil,
  Trash2,
  KeyRound,
  X,
  ShieldCheck,
} from "lucide-react";
import { useUser } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import UsuarioModal, {
  type DatosUsuario,
  type OpcionPerfil,
  type OpcionSede,
  type UsuarioFila,
} from "@/components/UsuarioModal";

type FiltroEstado = "activos" | "baja" | "todos";
type FiltroAcceso = "todos" | "con" | "sin";

export default function UsuariosPage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();

  const [usuarios, setUsuarios] = useState<UsuarioFila[]>([]);
  const [perfiles, setPerfiles] = useState<OpcionPerfil[]>([]);
  const [sedes, setSedes] = useState<OpcionSede[]>([]);
  const [idUsuarioActual, setIdUsuarioActual] = useState<number | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [filtroPerfil, setFiltroPerfil] = useState<number | "todos">("todos");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("activos");
  const [filtroAcceso, setFiltroAcceso] = useState<FiltroAcceso>("todos");

  const [editando, setEditando] = useState<UsuarioFila | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);

  useEffect(() => {
    if (isInitialized && !user) router.push("/login");
  }, [user, isInitialized, router]);

  const cargar = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/usuarios");
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? "Error al cargar los usuarios");
        return;
      }
      setUsuarios(json.data);
      setPerfiles(json.perfiles);
      setSedes(json.sedes);
      setIdUsuarioActual(json.idUsuarioActual ?? null);
    } catch {
      setError("Error de conexión");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) cargar();
  }, [user, cargar]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return usuarios.filter((u) => {
      if (filtroEstado === "activos" && u.Status !== 0) return false;
      if (filtroEstado === "baja" && u.Status === 0) return false;
      if (filtroPerfil !== "todos" && u.IdPuesto !== filtroPerfil) return false;
      if (filtroAcceso === "con" && !u.TieneAcceso) return false;
      if (filtroAcceso === "sin" && u.TieneAcceso) return false;
      if (!q) return true;
      return [u.Usuario, u.Login, u.Puesto, u.Sede, u.CorreoElectronico]
        .some((campo) => campo?.toLowerCase().includes(q));
    });
  }, [usuarios, busqueda, filtroPerfil, filtroEstado, filtroAcceso]);

  const conAcceso = usuarios.filter((u) => u.Status === 0 && u.TieneAcceso).length;

  const abrirAlta = () => {
    setEditando(null);
    setModalAbierto(true);
    setError(null);
    setAviso(null);
  };

  const abrirEdicion = (u: UsuarioFila) => {
    setEditando(u);
    setModalAbierto(true);
    setError(null);
    setAviso(null);
  };

  /** Devuelve el mensaje de error para que el modal lo muestre, o null si todo fue bien. */
  const guardar = async (datos: DatosUsuario): Promise<string | null> => {
    const esAlta = editando === null;
    try {
      const res = await fetch(
        esAlta ? "/api/admin/usuarios" : `/api/admin/usuarios/${editando.IdUsuario}`,
        {
          method: esAlta ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(datos),
        },
      );
      const json = await res.json();
      if (!json.success) return json.message ?? "No se pudo guardar";

      setModalAbierto(false);
      setAviso(esAlta ? `Usuario "${datos.usuario}" creado.` : `Usuario "${datos.usuario}" actualizado.`);
      await cargar();
      return null;
    } catch {
      return "Error de conexión";
    }
  };

  const darDeBaja = async (u: UsuarioFila) => {
    if (!confirm(`¿Dar de baja a "${u.Usuario}"? Dejará de poder iniciar sesión.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/usuarios/${u.IdUsuario}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) {
        setError(json.message ?? "No se pudo dar de baja");
        return;
      }
      setAviso(`"${u.Usuario}" fue dado de baja.`);
      await cargar();
    } catch {
      setError("Error de conexión");
    }
  };

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white">
        {/* ── Header ── */}
        <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center sticky top-0 z-20">
          <div>
            <h1 className="text-xl font-black flex items-center gap-2">
              <UserCog size={20} className="text-blue-400" />
              Usuarios
            </h1>
            <p className="text-xs text-blue-300 mt-0.5">
              Personal, perfiles y acceso al sistema
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/perfiles"
              className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-bold transition-all"
            >
              <ShieldCheck size={15} /> Perfiles
            </Link>
            <button
              onClick={abrirAlta}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-200 text-xs font-bold transition-all"
            >
              <Plus size={15} /> Nuevo usuario
            </button>
            <button
              onClick={cargar}
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

          {/* ── Filtros ── */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, acceso, perfil o sede…"
                className="w-full bg-white/5 border border-white/10 focus:border-blue-400 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none placeholder-slate-600 transition-colors"
              />
            </div>
            <select
              value={filtroPerfil}
              onChange={(e) => setFiltroPerfil(e.target.value === "todos" ? "todos" : Number(e.target.value))}
              className="bg-white/5 border border-white/10 focus:border-blue-400 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors"
            >
              <option value="todos">Todos los perfiles</option>
              {perfiles.map((p) => (
                <option key={p.IdPuesto} value={p.IdPuesto}>{p.Puesto}</option>
              ))}
            </select>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)}
              className="bg-white/5 border border-white/10 focus:border-blue-400 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors"
            >
              <option value="activos">Activos</option>
              <option value="baja">Dados de baja</option>
              <option value="todos">Todos</option>
            </select>
            <select
              value={filtroAcceso}
              onChange={(e) => setFiltroAcceso(e.target.value as FiltroAcceso)}
              className="bg-white/5 border border-white/10 focus:border-blue-400 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors"
            >
              <option value="todos">Con y sin acceso</option>
              <option value="con">Solo con acceso</option>
              <option value="sin">Solo directorio</option>
            </select>
          </div>

          <p className="text-xs text-slate-500 mb-4">
            {filtrados.length} de {usuarios.length} registros · {conAcceso} pueden iniciar sesión
          </p>

          {isLoading && usuarios.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-28 gap-4">
              <div className="w-14 h-14 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
              <p className="text-sm text-slate-400 font-bold animate-pulse">Cargando usuarios...</p>
            </div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-500">
              <AlertCircle size={48} className="opacity-20" />
              <p className="text-lg font-black">Sin resultados</p>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/10">
                      <th className="text-left font-black px-5 py-3">Nombre</th>
                      <th className="text-left font-black px-5 py-3">Acceso</th>
                      <th className="text-left font-black px-5 py-3">Perfil</th>
                      <th className="text-left font-black px-5 py-3">Sede</th>
                      <th className="text-left font-black px-5 py-3">Estado</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filtrados.map((u) => {
                      const esYo = u.IdUsuario === idUsuarioActual;
                      return (
                        <tr key={u.IdUsuario} className="hover:bg-white/5 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">{u.Usuario}</span>
                              {esYo && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 font-black">
                                  TÚ
                                </span>
                              )}
                            </div>
                            {u.CorreoElectronico && (
                              <span className="block text-[11px] text-slate-500">{u.CorreoElectronico}</span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            {u.TieneAcceso ? (
                              <span className="inline-flex items-center gap-1.5 text-blue-300 font-mono text-xs">
                                <KeyRound size={12} /> {u.Login}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500">Solo directorio</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-slate-300">{u.Puesto ?? "—"}</td>
                          <td className="px-5 py-3 text-slate-400 text-xs">{u.Sede ?? "—"}</td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 text-[11px] font-black ${
                                u.Status === 0 ? "text-emerald-300" : "text-slate-500"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  u.Status === 0 ? "bg-emerald-400" : "bg-slate-600"
                                }`}
                              />
                              {u.Status === 0 ? "Activo" : "Baja"}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => abrirEdicion(u)}
                                className="p-2 rounded-lg text-slate-400 hover:text-blue-300 hover:bg-blue-500/10 transition-all"
                                title="Editar"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => darDeBaja(u)}
                                disabled={esYo || u.Status !== 0}
                                className="p-2 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                title={esYo ? "No puedes darte de baja a ti mismo" : "Dar de baja"}
                              >
                                <Trash2 size={14} />
                              </button>
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

        {modalAbierto && (
          <UsuarioModal
            usuario={editando}
            perfiles={perfiles}
            sedes={sedes}
            esUsuarioActual={editando?.IdUsuario === idUsuarioActual}
            onCerrar={() => setModalAbierto(false)}
            onGuardar={guardar}
          />
        )}
      </main>
    </DashboardLayout>
  );
}
