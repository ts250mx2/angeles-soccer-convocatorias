"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  User, MapPin, GraduationCap, Phone, Mail, IdCard,
  Loader2, CheckCircle2, AlertCircle, ShieldCheck, Home, Users, Search, Shield,
} from "lucide-react";

interface Estado { IdEstado: number; Estado: string; }
interface Escuela {
  IdEscuela: number; Escuela: string; Municipio: string | null;
  Colonia: string | null; CodigoPostal: string | null; NivelEducativo: string | null;
}
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
const CURP_RE = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;

const inputCls =
  "w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500";
const labelCls = "block text-sm font-semibold text-slate-700 mb-1.5";

export default function PreregistroPage() {
  const params = useParams();
  const uuid = String(params?.uuid ?? "");

  const [bootLoading, setBootLoading] = useState(true);
  const [sede, setSede] = useState<SedeInfo | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [estados, setEstados] = useState<Estado[]>([]);

  const [form, setForm] = useState<Form>(EMPTY);
  const setField = useCallback((k: keyof Form, v: string) => {
    setForm((f) => ({ ...f, [k]: EMAIL_FIELDS.has(k) ? v : v.toUpperCase() }));
  }, []);

  // CP autollenado
  const [cpStatus, setCpStatus] = useState<"idle" | "loading" | "ok" | "notfound">("idle");
  const [colonias, setColonias] = useState<string[]>([]);
  const [coloniaManual, setColoniaManual] = useState(false);

  // Escuela autocomplete
  const [escResults, setEscResults] = useState<Escuela[]>([]);
  const [escOpen, setEscOpen] = useState(false);
  const [escLoading, setEscLoading] = useState(false);
  const escBoxRef = useRef<HTMLDivElement>(null);

  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // ── Boot: validar UUID + cargar estados ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [sedeRes, estRes] = await Promise.all([
          fetch(`/api/preregistro/sede/${uuid}`),
          fetch(`/api/preregistro/estados`),
        ]);
        const sedeJson = await sedeRes.json();
        const estJson = await estRes.json();
        if (!alive) return;
        if (sedeJson.success) setSede(sedeJson.data);
        else setLinkError(sedeJson.message ?? "Enlace no válido");
        if (estJson.success) setEstados(estJson.data);
      } catch {
        if (alive) setLinkError("No se pudo cargar el formulario. Revisa tu conexión.");
      } finally {
        if (alive) setBootLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [uuid]);

  // ── CP autollenado cuando hay 5 dígitos ──
  useEffect(() => {
    const cp = form.CodigoPostal;
    if (!/^\d{5}$/.test(cp)) {
      setCpStatus("idle");
      setColonias([]);
      return;
    }
    let alive = true;
    setCpStatus("loading");
    (async () => {
      try {
        const res = await fetch(`/api/preregistro/cp/${cp}`);
        const json = await res.json();
        if (!alive) return;
        if (json.success) {
          setColonias(json.data.colonias ?? []);
          setColoniaManual(false);
          setForm((f) => ({
            ...f,
            Estado: (json.data.estado ?? f.Estado ?? "").toUpperCase(),
            Municipio: (json.data.municipio ?? f.Municipio ?? "").toUpperCase(),
            Colonia: "",
            // si cambia el estado, reiniciamos escuela
            IdEscuela: "", Escuela: "",
          }));
          setCpStatus("ok");
        } else {
          setColonias([]);
          setColoniaManual(true);
          setCpStatus("notfound");
        }
      } catch {
        if (alive) { setCpStatus("notfound"); setColoniaManual(true); }
      }
    })();
    return () => { alive = false; };
  }, [form.CodigoPostal]);

  // ── Escuela autocomplete (debounce) ──
  useEffect(() => {
    if (!escOpen) return;
    const estado = form.Estado;
    const q = form.Escuela.trim();
    if (!estado) { setEscResults([]); return; }
    let alive = true;
    setEscLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/preregistro/escuelas?estado=${encodeURIComponent(estado)}&q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (alive && json.success) setEscResults(json.data);
      } catch { /* noop */ }
      finally { if (alive) setEscLoading(false); }
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [form.Escuela, form.Estado, escOpen]);

  // cerrar dropdown escuela al click fuera
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (escBoxRef.current && !escBoxRef.current.contains(e.target as Node)) setEscOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

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
    if (!form.EntidadNacimiento) e.EntidadNacimiento = "Requerido";
    if (form.Genero !== "1" && form.Genero !== "2") e.Genero = "Requerido";
    if (form.CURP.trim() && !CURP_RE.test(form.CURP.trim().toUpperCase())) e.CURP = "CURP inválida (18 caracteres)";
    if (form.CodigoPostal.trim() && !/^\d{5}$/.test(form.CodigoPostal.trim())) e.CodigoPostal = "5 dígitos";
    if (form.CorreoElectronicoPadre.trim() && !isEmail(form.CorreoElectronicoPadre.trim())) e.CorreoElectronicoPadre = "Correo inválido";
    if (form.CorreoElectronicoMadre.trim() && !isEmail(form.CorreoElectronicoMadre.trim())) e.CorreoElectronicoMadre = "Correo inválido";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSubmitError(null);
    if (!validate()) {
      const first = document.querySelector("[data-error='true']");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/preregistro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid, ...form }),
      });
      const json = await res.json();
      if (json.success) setDone(true);
      else setSubmitError(json.message ?? "No se pudo guardar el preregistro");
    } catch {
      setSubmitError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
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
          Gracias. El preregistro de <span className="font-bold">{form.Nombre} {form.ApellidoPaterno}</span> se
          recibió correctamente en la sede <span className="font-bold">{sede.Sede}</span>.
        </p>
        <button
          onClick={() => { setForm(EMPTY); setColonias([]); setCpStatus("idle"); setErrors({}); setDone(false); window.scrollTo(0, 0); }}
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Género" required error={errors.Genero}>
              <select className={inputCls} value={form.Genero} onChange={(e) => setField("Genero", e.target.value)}>
                <option value="">Selecciona</option>
                <option value="1">Masculino</option>
                <option value="2">Femenino</option>
              </select>
            </Field>
            <Field label="Entidad de nacimiento" required error={errors.EntidadNacimiento}>
              <select className={inputCls} value={form.EntidadNacimiento} onChange={(e) => setField("EntidadNacimiento", e.target.value)}>
                <option value="">Selecciona</option>
                {estados.map((e) => <option key={e.IdEstado} value={e.Estado}>{e.Estado}</option>)}
              </select>
            </Field>
          </div>
          <Field label="CURP" error={errors.CURP} hint="Opcional — 18 caracteres">
            <div className="relative">
              <IdCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={`${inputCls} pl-9 uppercase`} maxLength={18} value={form.CURP}
                onChange={(e) => setField("CURP", e.target.value.toUpperCase())} placeholder="CURP" />
            </div>
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

        {/* ── Domicilio ── */}
        <Section icon={<Home size={16} />} title="Domicilio">
          <Field label="Calle">
            <input className={inputCls} value={form.Calle} onChange={(e) => setField("Calle", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="No. Exterior">
              <input className={inputCls} value={form.NumExterior} onChange={(e) => setField("NumExterior", e.target.value)} />
            </Field>
            <Field label="No. Interior">
              <input className={inputCls} value={form.NumInterior} onChange={(e) => setField("NumInterior", e.target.value)} />
            </Field>
          </div>
          <Field label="Código Postal" error={errors.CodigoPostal} hint="5 dígitos — autocompleta estado, municipio y colonia">
            <div className="relative">
              <input inputMode="numeric" maxLength={5} className={inputCls} value={form.CodigoPostal}
                onChange={(e) => setField("CodigoPostal", e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="Ej. 64000" />
              {cpStatus === "loading" && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-blue-500" />}
              {cpStatus === "ok" && <CheckCircle2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />}
            </div>
            {cpStatus === "notfound" && <p className="text-xs text-amber-600 mt-1">CP no encontrado, captura estado/municipio/colonia manualmente.</p>}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Estado">
              <select className={inputCls} value={form.Estado}
                onChange={(e) => setField("Estado", e.target.value)}>
                <option value="">Selecciona</option>
                {estados.map((e) => <option key={e.IdEstado} value={e.Estado}>{e.Estado}</option>)}
              </select>
            </Field>
            <Field label="Municipio">
              <input className={inputCls} value={form.Municipio} onChange={(e) => setField("Municipio", e.target.value)} />
            </Field>
          </div>
          <Field label="Colonia">
            {colonias.length > 0 && !coloniaManual ? (
              <select className={inputCls} value={form.Colonia}
                onChange={(e) => {
                  if (e.target.value === "__otra__") { setColoniaManual(true); setField("Colonia", ""); }
                  else setField("Colonia", e.target.value);
                }}>
                <option value="">Selecciona colonia</option>
                {colonias.map((c) => <option key={c} value={c.toUpperCase()}>{c.toUpperCase()}</option>)}
                <option value="__otra__">OTRA (ESPECIFICAR)…</option>
              </select>
            ) : (
              <input className={inputCls} value={form.Colonia} onChange={(e) => setField("Colonia", e.target.value)} placeholder="Colonia" />
            )}
          </Field>
        </Section>

        {/* ── Escuela ── */}
        <Section icon={<GraduationCap size={16} />} title="Escuela">
          <Field label="Escuela" hint={form.Estado ? "Busca en el catálogo o escríbela manualmente" : "Captura primero el Estado / CP"}>
            <div className="relative" ref={escBoxRef}>
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className={`${inputCls} pl-9`}
                value={form.Escuela}
                onFocus={() => setEscOpen(true)}
                onChange={(e) => { setField("Escuela", e.target.value); setField("IdEscuela", ""); setEscOpen(true); }}
                placeholder={form.Estado ? "Buscar escuela..." : "Escribe el nombre de la escuela"}
              />
              {form.IdEscuela && <CheckCircle2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />}
              {escOpen && form.Estado && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                  {escLoading ? (
                    <div className="px-4 py-3 text-sm text-slate-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Buscando...</div>
                  ) : escResults.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-slate-400">Sin resultados. Puedes dejar el nombre escrito.</div>
                  ) : escResults.map((es) => (
                    <button type="button" key={es.IdEscuela}
                      onClick={() => { setForm((f) => ({ ...f, Escuela: (es.Escuela ?? "").toUpperCase(), IdEscuela: String(es.IdEscuela) })); setEscOpen(false); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-slate-100 last:border-0">
                      <p className="text-sm font-semibold text-slate-800">{es.Escuela}</p>
                      <p className="text-xs text-slate-500">{[es.Municipio, es.Colonia, es.NivelEducativo].filter(Boolean).join(" · ")}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>
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
        <div className="max-w-md mx-auto">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 text-white font-black text-base shadow-lg shadow-blue-600/20 hover:bg-blue-700 active:scale-[0.99] transition disabled:opacity-60"
          >
            {submitting ? <><Loader2 size={18} className="animate-spin" /> Enviando...</> : <>Enviar preregistro</>}
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
