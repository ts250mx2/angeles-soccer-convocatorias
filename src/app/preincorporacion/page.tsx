"use client";

import { useCallback, useState } from "react";
import {
  User, Phone, Shield, Users, MessageSquare, CalendarDays,
  Loader2, CheckCircle2, AlertCircle, ShieldCheck,
} from "lucide-react";
import { ANIO_MINIMO, anioMaximo } from "@/lib/preincorporaciones";

/**
 * Formulario público para incorporarse a un equipo.
 *
 * Es el hermano corto del preregistro de jugadores: pide solo lo necesario para
 * devolver la llamada. Cada campo de más en un formulario público es gente que lo
 * abandona a media captura, y el resto de los datos se levantan cuando alguien de la
 * academia llama.
 *
 * La ruta NO lleva código de sede, a diferencia de /preregistro/<uuid>: el QR de
 * incorporaciones es uno solo para toda la academia. Por eso tampoco hay pantalla de
 * "enlace no válido" que mostrar: no hay enlace que validar.
 */

const EMPTY = { jugador: "", anioNacimiento: "", telefono: "", equipo: "", comentarios: "" };
type Form = typeof EMPTY;

/** Los comentarios son prosa; el nombre y el equipo van en MAYÚSCULAS como todo el sistema. */
const TAL_CUAL = new Set<keyof Form>(["comentarios", "telefono", "anioNacimiento"]);

const inputCls =
  "w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition placeholder:text-slate-400";

export default function PreincorporacionPage() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [enviando, setEnviando] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const setField = useCallback((k: keyof Form, v: string) => {
    setForm((f) => ({ ...f, [k]: TAL_CUAL.has(k) ? v : v.toUpperCase() }));
  }, []);

  const maxAnio = anioMaximo();

  const validar = (): boolean => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (form.jugador.trim().length < 3) e.jugador = "Escribe el nombre del jugador";

    const anio = Number(form.anioNacimiento);
    if (!form.anioNacimiento.trim()) e.anioNacimiento = "Requerido";
    else if (!Number.isInteger(anio) || anio < ANIO_MINIMO || anio > maxAnio) {
      e.anioNacimiento = `Escribe un año entre ${ANIO_MINIMO} y ${maxAnio}`;
    }

    if (form.telefono.replace(/\D/g, "").length < 10) e.telefono = "El teléfono debe tener 10 dígitos";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const enviar = async (ev?: React.FormEvent) => {
    ev?.preventDefault();
    if (enviando) return;
    setSubmitError(null);

    if (!validar()) {
      document.querySelector("[data-error='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch("/api/preincorporacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jugador: form.jugador,
          anioNacimiento: Number(form.anioNacimiento),
          telefono: form.telefono,
          equipo: form.equipo,
          comentarios: form.comentarios,
        }),
      });
      const json = await res.json();
      if (json.success) setDone(true);
      else setSubmitError(json.message ?? "No se pudo enviar");
    } catch {
      setSubmitError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="bg-emerald-100 p-4 rounded-2xl"><CheckCircle2 className="text-emerald-600" size={48} /></div>
        <h1 className="text-2xl font-black text-slate-800">¡Solicitud enviada!</h1>
        <p className="text-sm text-slate-600 max-w-sm">
          Recibimos los datos de <span className="font-bold">{form.jugador}</span>. Alguien de la
          academia se comunicará al teléfono que dejaste.
        </p>
        <button
          onClick={() => { setForm(EMPTY); setErrors({}); setDone(false); window.scrollTo(0, 0); }}
          className="mt-2 px-5 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition"
        >
          Enviar otra solicitud
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto pb-28">
      <header className="bg-gradient-to-br from-blue-700 to-blue-900 text-white px-5 pt-8 pb-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center">
            <Shield size={22} />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-blue-200 font-bold">Ángeles Soccer</p>
            <h1 className="text-xl font-black leading-tight">Quiero incorporarme</h1>
          </div>
        </div>
        <p className="mt-4 text-sm text-blue-100/90 bg-white/10 border border-white/15 rounded-xl px-3 py-2">
          Déjanos tus datos y te llamamos para platicar de tu lugar en el equipo.
        </p>
      </header>

      <form onSubmit={enviar} className="px-4 mt-5 space-y-4" noValidate>
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
          <Field label="Nombre del jugador" required error={errors.jugador} icono={<User size={16} />}>
            <input
              className={inputCls}
              value={form.jugador}
              onChange={(e) => setField("jugador", e.target.value)}
              placeholder="Nombre completo"
            />
          </Field>

          <Field label="Año de nacimiento" required error={errors.anioNacimiento} icono={<CalendarDays size={16} />}>
            <input
              type="number"
              inputMode="numeric"
              min={ANIO_MINIMO}
              max={maxAnio}
              className={inputCls}
              value={form.anioNacimiento}
              onChange={(e) => setField("anioNacimiento", e.target.value)}
              placeholder={String(maxAnio - 12)}
            />
          </Field>

          <Field label="Teléfono" required error={errors.telefono} icono={<Phone size={16} />} hint="A este número te llamamos">
            <input
              type="tel"
              inputMode="tel"
              className={inputCls}
              value={form.telefono}
              onChange={(e) => setField("telefono", e.target.value)}
              placeholder="81 1234 5678"
            />
          </Field>

          <Field label="Equipo" error={errors.equipo} icono={<Users size={16} />} hint="Ej. A, B, C, D, X">
            <input
              className={inputCls}
              value={form.equipo}
              onChange={(e) => setField("equipo", e.target.value)}
              placeholder="A"
            />
          </Field>

          <Field label="Comentarios" error={errors.comentarios} icono={<MessageSquare size={16} />}>
            <textarea
              rows={3}
              maxLength={500}
              className={`${inputCls} resize-none`}
              value={form.comentarios}
              onChange={(e) => setField("comentarios", e.target.value)}
              placeholder="Lo que quieras contarnos (posición, horarios, experiencia...)"
            />
          </Field>
        </section>

        {submitError && (
          <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
            <AlertCircle size={16} /> {submitError}
          </div>
        )}

        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <ShieldCheck size={13} /> Tus datos se usan únicamente para contactarte.
        </p>
      </form>

      <div className="fixed bottom-0 inset-x-0 bg-white/90 backdrop-blur border-t border-slate-200 p-3">
        <div className="max-w-md mx-auto">
          <button
            type="button"
            onClick={() => enviar()}
            disabled={enviando}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 text-white font-black text-base shadow-lg shadow-blue-600/20 hover:bg-blue-700 active:scale-[0.99] transition disabled:opacity-60"
          >
            {enviando ? <><Loader2 size={18} className="animate-spin" /> Enviando...</> : "Enviar solicitud"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, required, error, hint, icono, children,
}: {
  label: string; required?: boolean; error?: string; hint?: string;
  icono?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div data-error={error ? "true" : undefined}>
      <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-1.5">
        {icono && <span className="text-blue-600">{icono}</span>}
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-rose-600 mt-1 font-medium">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-400 mt-1">{hint}</p>
      ) : null}
    </div>
  );
}
