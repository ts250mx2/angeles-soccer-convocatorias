"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle, CheckCircle2, Loader2, Mail, MapPin, Phone, Shirt, User, UserPlus, Users, X,
} from "lucide-react";
import {
  EDAD_MAXIMA, EDAD_MINIMA, calculaEdad, esCorreo, limitesNacimiento,
} from "@/lib/preregistro";

/**
 * Capturar un preregistro desde la Plantilla de Equipos.
 *
 * En pantalla se llama "Nuevo jugador", que es lo que esta haciendo quien captura; lo
 * que se graba sigue siendo un PREREGISTRO, y por eso el subtitulo lo dice en la misma
 * cabecera: el nombre corto no puede prometer un alta que esta pantalla no hace.
 *
 * Es el MISMO formulario que llena la familia con el QR de la sede, del otro lado del
 * mostrador: lo usa la recepción cuando el niño y su mamá están enfrente y pedirles que
 * saquen el teléfono para escanear un código sería dar un rodeo. Guarda en el mismo
 * lugar (tblJugadoresPre) y con las mismas reglas —las de `@/lib/preregistro`, que
 * comparte con el servidor—, así que un preregistro capturado aquí y uno que llegó por
 * el QR son indistinguibles para el alta del escritorio.
 *
 * Lo único que NO se pregunta es a dónde va: la sede y la categoría son las del equipo
 * que ya está abierto en la pantalla, y se enseñan fijas arriba. Volver a preguntarlas
 * sería dejar que se contradigan con la hoja que se está viendo; además el servidor las
 * resuelve por su cuenta a partir del equipo, así que aquí solo se muestran.
 *
 * Los campos son los mismos que quedaron en el formulario público: nombre, nacimiento,
 * género y los contactos de los tutores. CURP, domicilio y escuela se quitaron de allá a
 * propósito —alargaban la captura sin que nadie los usara— y por eso tampoco están aquí:
 * si volvieran, tienen que volver en los dos lados.
 */

const VACIO = {
  Nombre: "", ApellidoPaterno: "", ApellidoMaterno: "",
  FechaNacimiento: "", Genero: "", ContactoEmergencia: "",
  Padre: "", TelPadre: "", CorreoElectronicoPadre: "",
  Madre: "", TelMadre: "", CorreoElectronicoMadre: "",
};
type Formulario = typeof VACIO;

/** Todo se captura en MAYÚSCULAS, menos los correos. Igual que en el formulario público. */
const CAMPOS_CORREO = new Set<keyof Formulario>([
  "CorreoElectronicoPadre", "CorreoElectronicoMadre",
]);

const INPUT =
  "w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-slate-100 text-xs outline-none focus:border-emerald-500/60 placeholder:text-slate-600 [color-scheme:dark] transition-colors";
const ETIQUETA = "block mb-1 text-[9px] font-black text-slate-400 uppercase tracking-widest";

export default function PreregistroJugador({
  idEquipo,
  equipo,
  sede,
  onCerrar,
  onGuardado,
}: {
  idEquipo: number;
  /** El equipo abierto. Es lo que se guarda como categoría del preregistro. */
  equipo: string;
  sede: string;
  onCerrar: () => void;
  /** Se llama al cerrar habiendo guardado, para que la pantalla lo diga. */
  onGuardado: (mensaje: string) => void;
}) {
  const [form, setForm] = useState<Formulario>(VACIO);
  const [errores, setErrores] = useState<Partial<Record<keyof Formulario, string>>>({});
  const [guardando, setGuardando] = useState<null | "cerrar" | "otro">(null);
  const [error, setError] = useState<string | null>(null);
  /** Cuántos se han guardado sin salir del formulario, para decirlo al cerrar. */
  const [guardados, setGuardados] = useState<string[]>([]);

  const cambia = useCallback((campo: keyof Formulario, valor: string) => {
    setForm((f) => ({ ...f, [campo]: CAMPOS_CORREO.has(campo) ? valor : valor.toUpperCase() }));
  }, []);

  /* Cerrar con Escape, como el resto de los modales. Guardando no, que se estaría
     saliendo en medio de una escritura sin saber si alcanzó a entrar. */
  const cerrar = useCallback(() => {
    if (guardando) return;
    if (guardados.length > 0) {
      onGuardado(
        guardados.length === 1
          ? `${guardados[0]} quedó capturado en ${equipo}.`
          : `${guardados.length} nuevos jugadores capturados en ${equipo}: ${guardados.join(", ")}.`,
      );
    }
    onCerrar();
  }, [guardando, guardados, equipo, onCerrar, onGuardado]);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [cerrar]);

  /* El calendario no ofrece siquiera un día que el servidor va a rechazar: los límites
     salen de las mismas constantes que valida la API. */
  const limites = limitesNacimiento();

  const valida = (): boolean => {
    const e: Partial<Record<keyof Formulario, string>> = {};
    if (!form.Nombre.trim()) e.Nombre = "Requerido";
    if (!form.ApellidoPaterno.trim()) e.ApellidoPaterno = "Requerido";
    if (!form.FechaNacimiento) e.FechaNacimiento = "Requerido";
    else {
      const edad = calculaEdad(form.FechaNacimiento);
      if (edad === null) e.FechaNacimiento = "Fecha inválida";
      else if (edad < EDAD_MINIMA || edad > EDAD_MAXIMA) {
        e.FechaNacimiento = `La edad debe ser de ${EDAD_MINIMA} a ${EDAD_MAXIMA} años`;
      }
    }
    if (form.Genero !== "1" && form.Genero !== "2") e.Genero = "Requerido";
    if (form.CorreoElectronicoPadre.trim() && !esCorreo(form.CorreoElectronicoPadre.trim())) {
      e.CorreoElectronicoPadre = "Correo inválido";
    }
    if (form.CorreoElectronicoMadre.trim() && !esCorreo(form.CorreoElectronicoMadre.trim())) {
      e.CorreoElectronicoMadre = "Correo inválido";
    }
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  /** Guarda y devuelve el nombre con el que quedó, o null si no se pudo. */
  const guardar = async (): Promise<string | null> => {
    setError(null);
    if (!valida()) return null;
    try {
      const res = await fetch("/api/administracion-deportiva/plantillas/preregistro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /* Va el EQUIPO, no la sede ni la categoría: el servidor las saca de él para que
           no puedan llegar cruzadas. */
        body: JSON.stringify({ idEquipo, ...form }),
      });
      const json = await res.json();
      if (json.success) return json.data?.jugador ?? form.Nombre.trim();
      setError(json.message ?? "No se pudo guardar el preregistro");
      return null;
    } catch {
      setError("Error de conexión al guardar");
      return null;
    }
  };

  const guardarYCerrar = async () => {
    if (guardando) return;
    setGuardando("cerrar");
    const jugador = await guardar();
    setGuardando(null);
    if (!jugador) return;
    const total = [...guardados, jugador];
    onGuardado(
      total.length === 1
        ? `${jugador} quedó capturado en ${equipo}.`
        : `${total.length} nuevos jugadores capturados en ${equipo}: ${total.join(", ")}.`,
    );
    onCerrar();
  };

  /* Guardar y seguir con un hermano: se conservan apellidos y contactos —que son los de
     la familia— y se limpia lo que es de cada niño. Es el mismo atajo del formulario
     público, y en la recepción es todavía más común: la mamá llega con los dos. */
  const guardarYOtro = async () => {
    if (guardando) return;
    setGuardando("otro");
    const jugador = await guardar();
    setGuardando(null);
    if (!jugador) return;
    setGuardados((previos) => [...previos, jugador]);
    setForm((f) => ({ ...f, Nombre: "", FechaNacimiento: "", Genero: "" }));
    setErrores({});
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-start justify-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto">
      <div className="w-full max-w-3xl my-8 bg-[#0f172a] border border-white/15 rounded-3xl shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-white/10">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <UserPlus size={17} className="text-emerald-400" /> Nuevo jugador
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              El mismo formulario del QR de la sede, capturado aquí. Queda como preregistro:
              el alta como jugador la sigue haciendo el sistema de escritorio.
            </p>
          </div>
          <button
            onClick={cerrar}
            disabled={guardando !== null}
            title="Cerrar"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* A dónde va. No se pregunta: es el equipo que está abierto en la pantalla. */}
        <div className="px-6 py-3 border-b border-white/10 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-[11px] font-black">
            <MapPin size={12} /> {sede || "Sin sede"}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-200 text-[11px] font-black">
            <Shirt size={12} /> {equipo}
          </span>
          <span className="text-[10px] text-slate-500">
            Se guarda con esta sede y esta categoría.
          </span>
        </div>

        <div className="px-6 py-5 space-y-5">
          {guardados.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-200">
              <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                {guardados.length === 1 ? "1 jugador capturado" : `${guardados.length} jugadores capturados`}:{" "}
                {guardados.join(", ")}. Se conservaron apellidos y contactos para el siguiente.
              </span>
            </div>
          )}

          <Bloque icono={<User size={13} />} titulo="Datos del jugador">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Campo etiqueta="Nombre(s)" requerido error={errores.Nombre}>
                <input
                  autoFocus
                  className={INPUT}
                  value={form.Nombre}
                  onChange={(e) => cambia("Nombre", e.target.value)}
                />
              </Campo>
              <Campo etiqueta="Apellido Paterno" requerido error={errores.ApellidoPaterno}>
                <input
                  className={INPUT}
                  value={form.ApellidoPaterno}
                  onChange={(e) => cambia("ApellidoPaterno", e.target.value)}
                />
              </Campo>
              <Campo etiqueta="Apellido Materno">
                <input
                  className={INPUT}
                  value={form.ApellidoMaterno}
                  onChange={(e) => cambia("ApellidoMaterno", e.target.value)}
                />
              </Campo>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Campo
                etiqueta="Fecha de nacimiento"
                requerido
                error={errores.FechaNacimiento}
                pista={`Edad permitida: ${EDAD_MINIMA} a ${EDAD_MAXIMA} años`}
              >
                <input
                  type="date"
                  min={limites.min}
                  max={limites.max}
                  className={INPUT}
                  value={form.FechaNacimiento}
                  onChange={(e) => cambia("FechaNacimiento", e.target.value)}
                />
              </Campo>
              <Campo etiqueta="Género" requerido error={errores.Genero}>
                <select
                  className={INPUT}
                  value={form.Genero}
                  onChange={(e) => cambia("Genero", e.target.value)}
                >
                  <option value="">Selecciona...</option>
                  <option value="1">Masculino</option>
                  <option value="2">Femenino</option>
                </select>
              </Campo>
              <Campo etiqueta="Contacto de emergencia" pista="Nombre y teléfono">
                <input
                  className={INPUT}
                  value={form.ContactoEmergencia}
                  onChange={(e) => cambia("ContactoEmergencia", e.target.value)}
                  placeholder="ANA LÓPEZ 81 1234 5678"
                />
              </Campo>
            </div>
          </Bloque>

          <Bloque icono={<Users size={13} />} titulo="Padre / Tutor">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Campo etiqueta="Nombre">
                <input
                  className={INPUT}
                  value={form.Padre}
                  onChange={(e) => cambia("Padre", e.target.value)}
                />
              </Campo>
              <Campo etiqueta="Teléfono">
                <ConIcono icono={<Phone size={12} />}>
                  <input
                    type="tel"
                    inputMode="tel"
                    className={`${INPUT} pl-8`}
                    value={form.TelPadre}
                    onChange={(e) => cambia("TelPadre", e.target.value)}
                  />
                </ConIcono>
              </Campo>
              <Campo etiqueta="Correo" error={errores.CorreoElectronicoPadre}>
                <ConIcono icono={<Mail size={12} />}>
                  <input
                    type="email"
                    inputMode="email"
                    className={`${INPUT} pl-8`}
                    value={form.CorreoElectronicoPadre}
                    onChange={(e) => cambia("CorreoElectronicoPadre", e.target.value)}
                  />
                </ConIcono>
              </Campo>
            </div>
          </Bloque>

          <Bloque icono={<Users size={13} />} titulo="Madre / Tutora">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Campo etiqueta="Nombre">
                <input
                  className={INPUT}
                  value={form.Madre}
                  onChange={(e) => cambia("Madre", e.target.value)}
                />
              </Campo>
              <Campo etiqueta="Teléfono">
                <ConIcono icono={<Phone size={12} />}>
                  <input
                    type="tel"
                    inputMode="tel"
                    className={`${INPUT} pl-8`}
                    value={form.TelMadre}
                    onChange={(e) => cambia("TelMadre", e.target.value)}
                  />
                </ConIcono>
              </Campo>
              <Campo etiqueta="Correo" error={errores.CorreoElectronicoMadre}>
                <ConIcono icono={<Mail size={12} />}>
                  <input
                    type="email"
                    inputMode="email"
                    className={`${INPUT} pl-8`}
                    value={form.CorreoElectronicoMadre}
                    onChange={(e) => cambia("CorreoElectronicoMadre", e.target.value)}
                  />
                </ConIcono>
              </Campo>
            </div>
          </Bloque>

          {error && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs font-bold bg-rose-500/10 border border-rose-500/30 text-rose-200">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4 border-t border-white/10">
          <button
            onClick={cerrar}
            disabled={guardando !== null}
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-slate-300 text-xs font-bold transition-all disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={guardarYOtro}
            disabled={guardando !== null}
            title="Guarda éste y deja listos apellidos y contactos para un hermano"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-blue-200 text-xs font-bold transition-all disabled:opacity-40"
          >
            {guardando === "otro" ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Guardar y hermano
          </button>
          <button
            onClick={guardarYCerrar}
            disabled={guardando !== null}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all disabled:opacity-40"
          >
            {guardando === "cerrar" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function Bloque({ icono, titulo, children }: {
  icono: React.ReactNode; titulo: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-300 flex items-center justify-center">
          {icono}
        </span>
        <h3 className="text-[11px] font-black text-slate-300 uppercase tracking-widest">{titulo}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Campo({ etiqueta, requerido, error, pista, children }: {
  etiqueta: string; requerido?: boolean; error?: string; pista?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className={ETIQUETA}>
        {etiqueta} {requerido && <span className="text-rose-400">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-[10px] font-bold text-rose-300">{error}</p>
      ) : pista ? (
        <p className="mt-1 text-[10px] text-slate-500">{pista}</p>
      ) : null}
    </div>
  );
}

function ConIcono({ icono, children }: { icono: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500">{icono}</span>
      {children}
    </div>
  );
}
