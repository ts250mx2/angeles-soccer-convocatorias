"use client";

import {
  X, User, Users, MapPin, Home, Link2, CalendarDays, Phone, Mail, School,
  UserCheck, UserPlus, HeartHandshake, HelpCircle, Copy, Sparkles,
} from "lucide-react";
import type { FilaPreregistro, JugadorRelacionado, Vinculo } from "@/lib/preregistros";

/**
 * Ficha completa de un preregistro: lo que capturó la familia y con qué jugador de la
 * plantilla lo relacionó el reporte. Vive fuera de la pantalla porque es lo más largo
 * de ella y no comparte estado: recibe la fila ya resuelta y solo la pinta.
 */

export const ETIQUETA_VINCULO: Record<Vinculo, string> = {
  vinculado: "Convertido",
  "mismo-nombre": "Ya es jugador",
  probable: "Probablemente inscrito",
  familiar: "Familiar inscrito",
  "sin-relacion": "Sin relación",
};

/** Colores del estado de relación. Se comparten con la tabla y con las tarjetas. */
export const ESTILO_VINCULO: Record<Vinculo, string> = {
  vinculado: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  "mismo-nombre": "bg-sky-500/10 border-sky-500/30 text-sky-300",
  probable: "bg-violet-500/10 border-violet-500/30 text-violet-300",
  familiar: "bg-amber-500/10 border-amber-500/30 text-amber-300",
  "sin-relacion": "bg-rose-500/10 border-rose-500/30 text-rose-300",
};

export const ICONO_VINCULO: Record<Vinculo, React.ReactNode> = {
  vinculado: <UserCheck size={12} />,
  "mismo-nombre": <Link2 size={12} />,
  probable: <Sparkles size={12} />,
  familiar: <HeartHandshake size={12} />,
  "sin-relacion": <HelpCircle size={12} />,
};

/** Cómo se dedujo la relación. Es la explicación honesta de cada etiqueta. */
const EXPLICACION_VINCULO: Record<Vinculo, string> = {
  vinculado: "El sistema de escritorio grabó el número de jugador en el preregistro.",
  "mismo-nombre":
    "Existe un jugador con el mismo nombre completo. El alta se hizo sin sellar el preregistro, así que la coincidencia es por nombre, no por llave.",
  probable:
    "Hay un jugador que nació el mismo día y lleva un nombre casi igual: normalmente es el mismo niño capturado con una variante del apellido. Conviene confirmarlo.",
  familiar:
    "No hay jugador con este nombre, pero el teléfono o el correo de un tutor ya aparece en la plantilla: la familia está en la academia y este niño todavía no.",
  "sin-relacion": "Ni el nombre ni los datos de contacto aparecen en la plantilla. Es un prospecto sin capturar.",
};

export const etiquetaStatus = (status: number): string =>
  status === 0 ? "Activo" : status === 2 ? "Baja" : `Estatus ${status}`;

export const fechaCorta = (valor: string | null): string => {
  if (!valor) return "—";
  const [anio, mes, dia] = valor.slice(0, 10).split("-");
  if (!anio || !mes || !dia) return valor;
  return `${dia}/${mes}/${anio}`;
};

export const fechaHora = (valor: string | null): string => {
  if (!valor) return "—";
  const hora = valor.slice(11, 16);
  return hora ? `${fechaCorta(valor)} ${hora}` : fechaCorta(valor);
};

export default function PreregistroDetalle({
  fila,
  onClose,
}: {
  fila: FilaPreregistro;
  onClose: () => void;
}) {
  const domicilio = [
    [fila.Calle, fila.NumExterior].filter(Boolean).join(" "),
    fila.NumInterior ? `Int. ${fila.NumInterior}` : "",
    fila.Colonia,
    [fila.CodigoPostal, fila.Municipio].filter(Boolean).join(" "),
    fila.Estado,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[130] p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-white/15 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-white/10 px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Preregistro #{fila.IdJugadorPre}
            </p>
            <h3 className="text-lg font-black text-white truncate">{fila.JugadorPre}</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {fila.Sede ?? "Sin sede"} · Recibido {fechaHora(fila.FechaAlta)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Relación con la plantilla */}
          <section>
            <Titulo icono={<Link2 size={14} />} texto="Relación con la plantilla" />
            <div className={`rounded-2xl border p-4 ${ESTILO_VINCULO[fila.Vinculo]}`}>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider">
                {ICONO_VINCULO[fila.Vinculo]}
                {ETIQUETA_VINCULO[fila.Vinculo]}
              </div>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                {EXPLICACION_VINCULO[fila.Vinculo]}
              </p>
            </div>

            {fila.Jugador && (
              <div className="mt-3">
                <JugadorCard jugador={fila.Jugador} destacado />
                {fila.Homonimos > 1 && (
                  <p className="text-[11px] text-amber-300/80 mt-2 flex items-center gap-1.5">
                    <Copy size={12} />
                    Hay {fila.Homonimos} jugadores con este mismo nombre en la plantilla; se
                    muestra el más probable (misma fecha de nacimiento y activo).
                  </p>
                )}
                {!fila.Jugador.MismaFecha && fila.Vinculo === "mismo-nombre" && (
                  <p className="text-[11px] text-amber-300/80 mt-2">
                    La fecha de nacimiento no coincide con la del preregistro: verifica antes de
                    darlo por convertido.
                  </p>
                )}
              </div>
            )}

            {fila.Familiares.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                  Familia en la academia ({fila.FamiliaresTotal})
                </p>
                <div className="space-y-2">
                  {fila.Familiares.map((familiar) => (
                    <JugadorCard key={familiar.IdJugador} jugador={familiar} />
                  ))}
                </div>
                {fila.FamiliaresTotal > fila.Familiares.length && (
                  <p className="text-[11px] text-slate-500 mt-2">
                    …y {fila.FamiliaresTotal - fila.Familiares.length} más con el mismo contacto.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Datos del jugador */}
          <section>
            <Titulo icono={<User size={14} />} texto="Datos del jugador" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Dato etiqueta="Fecha de nacimiento" valor={fechaCorta(fila.FechaNacimiento)} icono={<CalendarDays size={12} />} />
              <Dato etiqueta="Edad" valor={fila.Edad != null ? `${fila.Edad} años` : "—"} />
              <Dato etiqueta="Género" valor={fila.GeneroDesc} />
              <Dato etiqueta="CURP" valor={fila.CURP} />
              <Dato etiqueta="Escuela" valor={fila.Escuela} icono={<School size={12} />} />
              <Dato etiqueta="Contacto de emergencia" valor={fila.ContactoEmergencia} />
            </div>
          </section>

          {/* Tutores */}
          <section>
            <Titulo icono={<Users size={14} />} texto="Padre / Madre o tutor" />
            <div className="grid sm:grid-cols-2 gap-3">
              <Tutor titulo="Padre / Tutor" nombre={fila.Padre} tel={fila.TelPadre} correo={fila.CorreoElectronicoPadre} />
              <Tutor titulo="Madre / Tutora" nombre={fila.Madre} tel={fila.TelMadre} correo={fila.CorreoElectronicoMadre} />
            </div>
          </section>

          {/* Domicilio */}
          <section>
            <Titulo icono={<Home size={14} />} texto="Domicilio" />
            <p className="text-sm text-slate-300">{domicilio || "No se capturó domicilio."}</p>
            {fila.Observaciones && (
              <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                <span className="font-bold text-slate-300">Observaciones: </span>
                {fila.Observaciones}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Titulo({ icono, texto }: { icono: React.ReactNode; texto: string }) {
  return (
    <h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
      <span className="text-blue-400">{icono}</span>
      {texto}
    </h4>
  );
}

function Dato({ etiqueta, valor, icono }: { etiqueta: string; valor: string | null; icono?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{etiqueta}</p>
      <p className="text-sm text-white flex items-center gap-1.5 mt-0.5">
        {icono && <span className="text-slate-600">{icono}</span>}
        {valor || "—"}
      </p>
    </div>
  );
}

function Tutor({ titulo, nombre, tel, correo }: { titulo: string; nombre: string | null; tel: string | null; correo: string | null }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{titulo}</p>
      <p className="text-sm font-bold text-white mt-1">{nombre || "—"}</p>
      <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1.5">
        <Phone size={11} className="text-slate-600" />
        {tel || "—"}
      </p>
      <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1 break-all">
        <Mail size={11} className="text-slate-600 flex-shrink-0" />
        {correo || "—"}
      </p>
    </div>
  );
}

function JugadorCard({ jugador, destacado }: { jugador: JugadorRelacionado; destacado?: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-3 ${
        destacado ? "bg-white/10 border-white/20" : "bg-white/5 border-white/10"
      }`}
    >
      <div className="p-2 rounded-lg bg-blue-500/15 border border-blue-500/25 flex-shrink-0">
        <UserPlus size={14} className="text-blue-300" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white truncate">{jugador.Jugador}</p>
        <p className="text-[11px] text-slate-400 flex items-center gap-1.5 flex-wrap">
          <span className="flex items-center gap-1">
            <MapPin size={10} className="text-slate-600" />
            {jugador.Sede || "Sin sede"}
          </span>
          {jugador.Categoria && <span>· {jugador.Categoria}</span>}
          <span>· Alta {fechaCorta(jugador.FechaAlta)}</span>
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black border ${
            jugador.Status === 0
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-slate-500/10 border-slate-500/30 text-slate-400"
          }`}
        >
          {etiquetaStatus(jugador.Status)}
        </span>
        <p className="text-[10px] text-slate-600 mt-1 tabular-nums">#{jugador.IdJugador}</p>
      </div>
    </div>
  );
}
