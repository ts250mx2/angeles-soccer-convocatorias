"use client";

import { User, Phone, Home, GraduationCap, AlertTriangle, IdCard, Mail } from "lucide-react";

/**
 * Ficha del jugador: la pestaña "Datos generales" del historial de pagos.
 *
 * Vive en una pestaña propia y no junto a la tabla porque son dos consultas distintas:
 * quien viene a revisar cobros no quiere la ficha estorbando, y quien viene por un
 * teléfono no quiere recorrer los pagos para encontrarlo.
 *
 * Los campos vacíos NO se pintan. La captura es despareja —el entrenador y el género
 * están en el 100% de los jugadores, la escuela en el 61%, pero el domicilio y el CURP
 * apenas en el 1 o 2%—, y una ficha llena de guiones hace ruido y esconde lo que sí
 * está. Un apartado sin nada que mostrar desaparece completo.
 */

export interface JugadorFicha {
    IdJugador: number;
    Jugador: string;
    Categoria: string | null;
    Status: number;
    Beca: string | number | null;
    SedeNombre: string | null;
    /** 'dd/mm/aaaa', ya formateada en SQL. */
    FechaNacimiento?: string | null;
    Edad?: number | null;
    Genero?: number | null;
    GeneroDesc?: string | null;
    CURP?: string | null;
    Dorsal?: string | null;
    NumeroSocio?: string | null;
    Talla?: string | null;
    Padre?: string | null;
    TelPadre?: string | null;
    CorreoElectronicoPadre?: string | null;
    Madre?: string | null;
    TelMadre?: string | null;
    CorreoElectronicoMadre?: string | null;
    TelCasa?: string | null;
    ContactoEmergencia?: string | null;
    ViveCon?: string | null;
    Escuela?: string | null;
    BecaLigas?: string | number | null;
    Coach?: string | null;
    Grupo?: string | null;
    Calle?: string | null;
    NumExterior?: string | null;
    NumInterior?: string | null;
    Colonia?: string | null;
    CodigoPostal?: string | null;
    Municipio?: string | null;
    Estado?: string | null;
    FechaAlta?: string | null;
    Alerta?: string | null;
    Observaciones?: string | null;
    MotivoBaja?: string | null;
}

type Dato = { etiqueta: string; valor: string | null; icono?: React.ReactNode };

/** Texto utilizable, o null. El '0' se descarta: así quedan muchos campos sin capturar. */
export const texto = (v: unknown): string | null => {
    const s = String(v ?? "").trim();
    return s && s !== "0" ? s : null;
};

/** Porcentaje de beca legible; '', '0' y NULL son "sin beca". */
const porcentaje = (v: unknown): string | null => {
    const n = parseFloat(String(v ?? "").trim());
    return !isNaN(n) && n > 0 ? `${n}%` : null;
};

/** Se prefiere el texto capturado; el número es el respaldo cuando viene vacío. */
const genero = (j: JugadorFicha): string | null =>
    texto(j.GeneroDesc) ?? (j.Genero === 1 ? "MASCULINO" : j.Genero === 2 ? "FEMENINO" : null);

export default function DatosGeneralesJugador({ jugador }: { jugador: JugadorFicha | null }) {
    if (!jugador) return null;

    const domicilio = [
        [texto(jugador.Calle), texto(jugador.NumExterior)].filter(Boolean).join(" "),
        texto(jugador.NumInterior) ? `Int. ${texto(jugador.NumInterior)}` : "",
        texto(jugador.Colonia),
        [texto(jugador.CodigoPostal), texto(jugador.Municipio)].filter(Boolean).join(" "),
        texto(jugador.Estado),
    ].filter(Boolean).join(", ");

    const apartados: { titulo: string; icono: React.ReactNode; datos: Dato[] }[] = [
        {
            titulo: "Jugador",
            icono: <User size={13} />,
            datos: [
                { etiqueta: "Categoría", valor: texto(jugador.Categoria) },
                { etiqueta: "Sede", valor: texto(jugador.SedeNombre) },
                { etiqueta: "Nacimiento", valor: texto(jugador.FechaNacimiento) },
                { etiqueta: "Edad", valor: jugador.Edad != null ? `${jugador.Edad} años` : null },
                { etiqueta: "Género", valor: genero(jugador) },
                { etiqueta: "Dorsal", valor: texto(jugador.Dorsal) },
                { etiqueta: "Talla", valor: texto(jugador.Talla) },
                { etiqueta: "CURP", valor: texto(jugador.CURP), icono: <IdCard size={11} /> },
                { etiqueta: "No. de socio", valor: texto(jugador.NumeroSocio) },
            ],
        },
        {
            titulo: "Contacto",
            icono: <Phone size={13} />,
            datos: [
                { etiqueta: "Padre / Tutor", valor: texto(jugador.Padre) },
                { etiqueta: "Tel. del padre", valor: texto(jugador.TelPadre), icono: <Phone size={11} /> },
                { etiqueta: "Correo del padre", valor: texto(jugador.CorreoElectronicoPadre), icono: <Mail size={11} /> },
                { etiqueta: "Madre / Tutora", valor: texto(jugador.Madre) },
                { etiqueta: "Tel. de la madre", valor: texto(jugador.TelMadre), icono: <Phone size={11} /> },
                { etiqueta: "Correo de la madre", valor: texto(jugador.CorreoElectronicoMadre), icono: <Mail size={11} /> },
                { etiqueta: "Tel. de casa", valor: texto(jugador.TelCasa) },
                { etiqueta: "Emergencia", valor: texto(jugador.ContactoEmergencia) },
                { etiqueta: "Vive con", valor: texto(jugador.ViveCon) },
            ],
        },
        {
            titulo: "Academia",
            icono: <GraduationCap size={13} />,
            datos: [
                { etiqueta: "Beca", valor: porcentaje(jugador.Beca) },
                { etiqueta: "Beca de ligas", valor: porcentaje(jugador.BecaLigas) },
                { etiqueta: "Alta", valor: texto(jugador.FechaAlta) },
                { etiqueta: "Estatus", valor: jugador.Status === 2 ? "BAJA" : "ACTIVO" },
                { etiqueta: "Motivo de baja", valor: texto(jugador.MotivoBaja) },
                { etiqueta: "Grupo", valor: texto(jugador.Grupo) },
                { etiqueta: "Entrenador", valor: texto(jugador.Coach) },
                { etiqueta: "Escuela", valor: texto(jugador.Escuela) },
            ],
        },
        {
            titulo: "Domicilio",
            icono: <Home size={13} />,
            datos: [{ etiqueta: "Dirección", valor: domicilio || null }],
        },
    ]
        .map((a) => ({ ...a, datos: a.datos.filter((d) => d.valor) }))
        .filter((a) => a.datos.length > 0);

    const alerta = texto(jugador.Alerta);
    const observaciones = texto(jugador.Observaciones);

    return (
        <div className="space-y-5">
            {alerta && (
                <p className="flex items-start gap-2 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                    <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                    <span><span className="font-black">Alerta: </span>{alerta}</span>
                </p>
            )}

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {apartados.map((a) => (
                    <section key={a.titulo} className="bg-white/5 border border-white/10 rounded-xl p-4">
                        <h4 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
                            <span className="text-blue-400">{a.icono}</span>
                            {a.titulo}
                        </h4>
                        <dl className="space-y-2">
                            {a.datos.map((d) => (
                                <div key={d.etiqueta}>
                                    <dt className="text-[10px] text-slate-500">{d.etiqueta}</dt>
                                    <dd className="text-xs text-slate-200 flex items-start gap-1.5 break-words">
                                        {d.icono && <span className="text-slate-600 flex-shrink-0 mt-0.5">{d.icono}</span>}
                                        {d.valor}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                ))}
            </div>

            {observaciones && (
                <p className="text-[11px] text-slate-400 leading-relaxed bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                    <span className="font-bold text-slate-300">Observaciones: </span>
                    {observaciones}
                </p>
            )}
        </div>
    );
}
