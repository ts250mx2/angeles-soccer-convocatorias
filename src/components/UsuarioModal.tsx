"use client";

import { useState } from "react";
import { Loader2, Save, X, KeyRound, AlertCircle } from "lucide-react";

export interface UsuarioFila {
  IdUsuario: number;
  Usuario: string;
  Login: string | null;
  IdPuesto: number | null;
  Puesto: string | null;
  IdSede: number | null;
  Sede: string | null;
  CorreoElectronico: string | null;
  Telefonos: string | null;
  Status: number;
  TieneAcceso: number;
}

export interface OpcionPerfil {
  IdPuesto: number;
  Puesto: string;
}
export interface OpcionSede {
  IdSede: number;
  Sede: string;
}

export interface DatosUsuario {
  usuario: string;
  login: string;
  passwd?: string;
  idPuesto: number;
  idSede: number | null;
  correo: string;
  telefonos: string;
  status: number;
}

interface Props {
  usuario: UsuarioFila | null;
  perfiles: OpcionPerfil[];
  sedes: OpcionSede[];
  esUsuarioActual: boolean;
  onCerrar: () => void;
  onGuardar: (datos: DatosUsuario) => Promise<string | null>;
}

const CAMPO =
  "w-full bg-slate-800/70 border border-slate-600 focus:border-blue-400 rounded-xl px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder-slate-600 disabled:opacity-50";
const ETIQUETA = "block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5";

/**
 * Alta y edición de un usuario.
 *
 * Al editar, la contraseña se deja en blanco para no tocarla: el servidor nunca la
 * devuelve, así que aquí no hay nada que precargar.
 */
export default function UsuarioModal({
  usuario,
  perfiles,
  sedes,
  esUsuarioActual,
  onCerrar,
  onGuardar,
}: Props) {
  const esAlta = usuario === null;

  const [form, setForm] = useState<DatosUsuario>({
    usuario: usuario?.Usuario ?? "",
    login: usuario?.Login ?? "",
    passwd: "",
    idPuesto: usuario?.IdPuesto ?? perfiles[0]?.IdPuesto ?? 0,
    idSede: usuario?.IdSede ?? null,
    correo: usuario?.CorreoElectronico ?? "",
    telefonos: usuario?.Telefonos ?? "",
    status: usuario?.Status ?? 0,
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cambia = <K extends keyof DatosUsuario>(campo: K, valor: DatosUsuario[K]) =>
    setForm((prev) => ({ ...prev, [campo]: valor }));

  const enviar = async () => {
    setGuardando(true);
    setError(null);
    // En edición, una contraseña vacía significa "déjala como está": no se manda.
    const datos: DatosUsuario = { ...form };
    if (!esAlta && !datos.passwd) delete datos.passwd;
    const problema = await onGuardar(datos);
    if (problema) setError(problema);
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl my-8 bg-slate-900 border border-white/10 rounded-3xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-black text-white">
              {esAlta ? "Nuevo usuario" : "Editar usuario"}
            </h2>
            {!esAlta && (
              <p className="text-[11px] text-slate-500 mt-0.5">#{usuario.IdUsuario}</p>
            )}
          </div>
          <button
            onClick={onCerrar}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm font-bold flex items-center gap-2">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className={ETIQUETA}>Nombre completo</label>
            <input
              value={form.usuario}
              onChange={(e) => cambia("usuario", e.target.value)}
              autoFocus
              placeholder="JUAN PÉREZ"
              className={CAMPO}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={ETIQUETA}>Perfil</label>
              <select
                value={form.idPuesto}
                onChange={(e) => cambia("idPuesto", Number(e.target.value))}
                className={CAMPO}
              >
                <option value={0}>Selecciona un perfil…</option>
                {perfiles.map((p) => (
                  <option key={p.IdPuesto} value={p.IdPuesto}>
                    {p.Puesto}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-600 mt-1.5">
                El perfil decide qué pantallas ve.
              </p>
            </div>
            <div>
              <label className={ETIQUETA}>Sede</label>
              <select
                value={form.idSede ?? ""}
                onChange={(e) => cambia("idSede", e.target.value ? Number(e.target.value) : null)}
                className={CAMPO}
              >
                <option value="">Sin sede</option>
                {sedes.map((s) => (
                  <option key={s.IdSede} value={s.IdSede}>
                    {s.Sede}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={ETIQUETA}>Correo electrónico</label>
              <input
                value={form.correo}
                onChange={(e) => cambia("correo", e.target.value)}
                placeholder="correo@ejemplo.com"
                className={CAMPO}
              />
            </div>
            <div>
              <label className={ETIQUETA}>Teléfono</label>
              <input
                value={form.telefonos}
                onChange={(e) => cambia("telefonos", e.target.value)}
                placeholder="81 1234 5678"
                className={CAMPO}
              />
            </div>
          </div>

          {/* Acceso al sistema */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="flex items-center gap-2 text-xs font-black text-slate-300 mb-1">
              <KeyRound size={14} className="text-blue-400" />
              Acceso al sistema
            </p>
            <p className="text-[11px] text-slate-500 mb-4">
              Opcional. Déjalo vacío si esta persona solo debe existir en el directorio
              (por ejemplo, un profesor al que se asignan convocatorias).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={ETIQUETA}>Usuario de acceso</label>
                <input
                  value={form.login}
                  onChange={(e) => cambia("login", e.target.value)}
                  placeholder="jperez"
                  autoComplete="off"
                  className={CAMPO}
                />
              </div>
              <div>
                <label className={ETIQUETA}>
                  {esAlta ? "Contraseña" : "Nueva contraseña"}
                </label>
                <input
                  type="password"
                  value={form.passwd ?? ""}
                  onChange={(e) => cambia("passwd", e.target.value)}
                  placeholder={esAlta ? "••••" : "Dejar vacío para no cambiarla"}
                  autoComplete="new-password"
                  className={CAMPO}
                />
              </div>
            </div>
          </div>

          {/* Estado */}
          <label
            className={`flex items-center gap-3 ${
              esUsuarioActual ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
            }`}
            title={esUsuarioActual ? "No puedes darte de baja a ti mismo" : undefined}
          >
            <input
              type="checkbox"
              checked={form.status === 0}
              disabled={esUsuarioActual}
              onChange={(e) => cambia("status", e.target.checked ? 0 : 2)}
              className="sr-only"
            />
            <span
              className={`w-10 h-6 rounded-full p-0.5 transition-colors flex-shrink-0 ${
                form.status === 0 ? "bg-emerald-500" : "bg-slate-600"
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                  form.status === 0 ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </span>
            <span className="text-sm font-bold text-white">
              Usuario activo
              <span className="block text-[11px] font-normal text-slate-500">
                Un usuario dado de baja no puede iniciar sesión.
              </span>
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/10">
          <button
            onClick={onCerrar}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-bold transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={guardando}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black transition-all disabled:opacity-40"
          >
            {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {esAlta ? "Crear usuario" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
