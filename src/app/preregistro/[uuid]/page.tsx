"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  User, MapPin, Phone, Mail, UserPlus,
  Loader2, CheckCircle2, AlertCircle, ShieldCheck, Users, Shield,
} from "lucide-react";

interface SedeInfo { IdSede: number; Sede: string; Estado: string; }

const EMPTY = {
  Nombre: "", ApellidoPaterno: "", ApellidoMaterno: "",
  FechaNacimiento: "", EntidadNacimiento: "", Genero: "",
  CURP: "", ContactoEmergencia: "",
  Padre: "", TelPadre: "", CorreoElectronicoPadre: "",
  Madre: "", TelMadre: "", CorreoElectronicoMadre: "",
  Calle: "", NumExterior: "", NumInterior: "",
  CodigoPostal: "", Estado: "", Municipio: "", Colonia: "",
  IdEscuela: "" as string, Escuela: "",
};
type Form = typeof EMPTY;

// Todas las capturas van en MAYÚSCULAS, excepto los correos electrónicos.
const EMAIL_FIELDS = new Set<keyof Form>(["CorreoElectronicoPadre", "CorreoElectronicoMadre"]);

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function calcAge(dobStr: string): number | null {
  const dob = new Date(dobStr + "T00:00:00");
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

const inputCls =
  "w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500";
const labelCls = "block text-sm font-semibold text-slate-700 mb-1.5";

export default function PreregistroPage() {
  const params = useParams();
  const uuid = String(params?.uuid ?? "");

  const [bootLoading, setBootLoading] = useState(true);
  const [sede, setSede] = useState<SedeInfo | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [form, setForm] = useState<Form>(EMPTY);
  const setField = useCallback((k: keyof Form, v: string) => {
    setForm((f) => ({ ...f, [k]: EMAIL_FIELDS.has(k) ? v : v.toUpperCase() }));
  }, []);

  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [busy, setBusy] = useState<null | "submit" | "sibling">(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [siblingBanner, setSiblingBanner] = useState(false);

  // ── Boot: validar UUID de la sede ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/preregistro/sede/${uuid}`);
        const json = await res.json();
        if (!alive) return;
        if (json.success) setSede(json.data);
        else setLinkError(json.message ?? "Enlace no válido");
      } catch {
        if (alive) setLinkError("No se pudo cargar el formulario. Revisa tu conexión.");
      } finally {
        if (alive) setBootLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [uuid]);

  const now = new Date();
  const maxBirth = ymd(new Date(now.getFullYear() - 3, now.getMonth(), now.getDate()));
  const minBirth = ymd(new Date(now.getFullYear() - 19, now.getMonth(), now.getDate() + 1));

  const validate = (): boolean => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!form.Nombre.trim()) e.Nombre = "Requerido";
    if (!form.ApellidoPaterno.trim()) e.ApellidoPaterno = "Requerido";
    if (!form.FechaNacimiento) e.FechaNacimiento = "Requerido";
    else {
      const age = calcAge(form.FechaNacimiento);
      if (age === null) e.FechaNacimiento = "Fecha inválida";
      else if (age < 3 || age > 18) e.FechaNacimiento = "La edad debe ser de 3 a 18 años";
    }
    if (form.Genero !== "1" && form.Genero !== "2") e.Genero = "Requerido";
    if (form.CorreoElectronicoPadre.trim() && !isEmail(form.CorreoElectronicoPadre.trim())) e.CorreoElectronicoPadre = "Correo inválido";
    if (form.CorreoElectronicoMadre.trim() && !isEmail(form.CorreoElectronicoMadre.trim())) e.CorreoElectronicoMadre = "Correo inválido";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const savePlayer = async (): Promise<boolean> => {
    setSubmitError(null);
    if (!validate()) {
      const first = document.querySelector("[data-error='true']");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    try {
      const res = await fetch(`/api/preregistro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid, ...form }),
      });
      const json = await res.json();
      if (json.success) return true;
      setSubmitError(json.message ?? "No se pudo guardar el preregistro");
      return false;
    } catch {
      setSubmitError("Error de conexión. Inténtalo de nuevo.");
      return false;
    }
  };

  const handleSubmit = async (ev?: React.FormEvent) => {
    ev?.preventDefault();
    if (busy) return;
    setBusy("submit");
    const ok = await savePlayer();
    if (ok) setDone(true);
    setBusy(null);
  };

  // Guarda al jugador actual y prepara el formulario para un hermano:
  // conserva apellidos y datos de contacto; limpia nombre, fecha de nacimiento y género.
  const handleAddSibling = async () => {
    if (busy) return;
    setBusy("sibling");
    const ok = await savePlayer();
    if (ok) {
      setAddedCount((c) => c + 1);
      setForm((f) => ({ ...f, Nombre: "", FechaNacimiento: "", Genero: "" }));
      setErrors({});
      setSiblingBanner(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setSiblingBanner(false), 2600);
    }
    setBusy(null);
  };

  // ── Pantallas de estado ──
  if (bootLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="animate-spin text-blue-600" size={36} />
        <p className="text-sm font-semibold">Cargando formulario...</p>
      </div>
    );
  }

  if (linkError || !sede) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="bg-rose-100 p-4 rounded-2xl"><AlertCircle className="text-rose-500" size={40} /></div>
        <h1 className="text-xl font-black text-slate-800">Enlace no válido</h1>
        <p className="text-sm text-slate-500 max-w-xs">{linkError ?? "Este enlace de preregistro no existe o expiró. Solicita uno nuevo a tu sede."}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="bg-emerald-100 p-4 rounded-2xl"><CheckCircle2 className="text-emerald-600" size={48} /></div>
        <h1 className="text-2xl font-black text-slate-800">¡Preregistro enviado!</h1>
        <p className="text-sm text-slate-600 max-w-sm">
          {addedCount > 0 ? (
            <>Se recibieron <span className="font-bold">{addedCount + 1}</span> preregistros de tu familia en la sede <span className="font-bold">{sede.Sede}</span>. ¡Gracias!</>
          ) : (
            <>Gracias. El preregistro de <span className="font-bold">{form.Nombre} {form.ApellidoPaterno}</span> se recibió correctamente en la sede <span className="font-bold">{sede.Sede}</span>.</>
          )}
        </p>
        <button
          onClick={() => { setForm(EMPTY); setErrors({}); setDone(false); setAddedCount(0); setSiblingBanner(false); window.scrollTo(0, 0); }}
          className="mt-2 px-5 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition"
        >
          Registrar otro jugador
        </button>
      </div>
    );
  }

  // ── Formulario ──
  return (
    <div className="max-w-md mx-auto pb-28">
      {/* Header */}
      <header className="bg-gradient-to-br from-blue-700 to-blue-900 text-white px-5 pt-8 pb-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center">
            <Shield size={22} />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-blue-200 font-bold">Ángeles Soccer</p>
            <h1 className="text-xl font-black leading-tight">Preregistro de Jugador</h1>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm bg-white/10 border border-white/15 rounded-xl px-3 py-2">
          <MapPin size={15} className="text-blue-200" />
          <span className="font-semibold">Sede: {sede.Sede}</span>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="px-4 mt-5 space-y-6" noValidate>

        {addedCount > 0 && (
          <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold border transition-colors ${siblingBanner ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-blue-50 border-blue-200 text-blue-700"}`}>
            <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
            {siblingBanner
              ? "¡Hermano agregado! Captura los datos del siguiente."
              : `${addedCount} jugador(es) agregado(s) en esta familia.`}
          </div>
        )}

        {/* ── Datos del jugador ── */}
        <Section icon={<User size={16} />} title="Datos del jugador">
          <Field label="Nombre(s)" required error={errors.Nombre}>
            <input className={inputCls} value={form.Nombre} onChange={(e) => setField("Nombre", e.target.value)} placeholder="Nombre(s)" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Apellido Paterno" required error={errors.ApellidoPaterno}>
              <input className={inputCls} value={form.ApellidoPaterno} onChange={(e) => setField("ApellidoPaterno", e.target.value)} />
            </Field>
            <Field label="Apellido Materno" error={errors.ApellidoMaterno}>
              <input className={inputCls} value={form.ApellidoMaterno} onChange={(e) => setField("ApellidoMaterno", e.target.value)} />
            </Field>
          </div>
          <Field label="Fecha de nacimiento" required error={errors.FechaNacimiento} hint="Edad permitida: 3 a 18 años">
            <input type="date" min={minBirth} max={maxBirth} className={inputCls}
              value={form.FechaNacimiento} onChange={(e) => setField("FechaNacimiento", e.target.value)} />
          </Field>
          <Field label="Género" required error={errors.Genero}>
            <select className={inputCls} value={form.Genero} onChange={(e) => setField("Genero", e.target.value)}>
              <option value="">Selecciona</option>
              <option value="1">Masculino</option>
              <option value="2">Femenino</option>
            </select>
          </Field>
          <Field label="Contacto de emergencia" hint="Nombre y teléfono">
            <input className={inputCls} value={form.ContactoEmergencia} onChange={(e) => setField("ContactoEmergencia", e.target.value)} placeholder="Ej. Ana López 81 1234 5678" />
          </Field>
        </Section>

        {/* ── Padre / Madre ── */}
        <Section icon={<Users size={16} />} title="Padre / Tutor">
          <Field label="Nombre del padre / tutor">
            <input className={inputCls} value={form.Padre} onChange={(e) => setField("Padre", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono">
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="tel" inputMode="tel" className={`${inputCls} pl-9`} value={form.TelPadre} onChange={(e) => setField("TelPadre", e.target.value)} />
              </div>
            </Field>
            <Field label="Correo" error={errors.CorreoElectronicoPadre}>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="email" inputMode="email" className={`${inputCls} pl-9`} value={form.CorreoElectronicoPadre} onChange={(e) => setField("CorreoElectronicoPadre", e.target.value)} />
              </div>
            </Field>
          </div>
        </Section>

        <Section icon={<Users size={16} />} title="Madre / Tutora">
          <Field label="Nombre de la madre / tutora">
            <input className={inputCls} value={form.Madre} onChange={(e) => setField("Madre", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono">
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="tel" inputMode="tel" className={`${inputCls} pl-9`} value={form.TelMadre} onChange={(e) => setField("TelMadre", e.target.value)} />
              </div>
            </Field>
            <Field label="Correo" error={errors.CorreoElectronicoMadre}>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="email" inputMode="email" className={`${inputCls} pl-9`} value={form.CorreoElectronicoMadre} onChange={(e) => setField("CorreoElectronicoMadre", e.target.value)} />
              </div>
            </Field>
          </div>
        </Section>

        {submitError && (
          <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
            <AlertCircle size={16} /> {submitError}
          </div>
        )}

        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <ShieldCheck size={13} /> Tus datos se usan únicamente para el registro en la academia.
        </p>
      </form>

      {/* Sticky submit */}
      <div className="fixed bottom-0 inset-x-0 bg-white/90 backdrop-blur border-t border-slate-200 p-3">
        <div className="max-w-md mx-auto flex gap-2">
          <button
            type="button"
            onClick={handleAddSibling}
            disabled={busy !== null}
            className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl border-2 border-blue-600 text-blue-700 bg-white font-black text-sm hover:bg-blue-50 active:scale-[0.99] transition disabled:opacity-60"
          >
            {busy === "sibling" ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
            Agregar hermano
          </button>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={busy !== null}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 text-white font-black text-base shadow-lg shadow-blue-600/20 hover:bg-blue-700 active:scale-[0.99] transition disabled:opacity-60"
          >
            {busy === "submit" ? <><Loader2 size={18} className="animate-spin" /> Enviando...</> : <>Enviar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">{icon}</span>
        <h2 className="text-base font-black text-slate-800">{title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, required, error, hint, children }: {
  label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div data-error={error ? "true" : undefined}>
      <label className={labelCls}>
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
