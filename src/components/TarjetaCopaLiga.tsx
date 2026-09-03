"use client";

import Image from "next/image";
import { Trophy, Users, ChevronRight, LayoutGrid, AlertTriangle } from "lucide-react";
import type { ResumenCopaLiga } from "@/lib/convocatorias-resumen";
import { textoDuplicados } from "@/lib/convocatorias-duplicados";

/**
 * La tarjeta de una copa o liga en la portada de Convocatorias: cómo va el torneo
 * completo, sin abrirlo.
 *
 * Lleva lo que se pregunta antes de entrar: si es copa o liga, cuántas categorías tiene
 * y cuáles, cuántos jugadores hay en cada una, y las cuatro cifras de dinero —esperado
 * y recaudado, con su utilidad—. Al tocarla se abre el detalle de siempre, ya filtrado
 * a ese torneo.
 *
 * Y, cuando los hay, el aviso de niños convocados a dos equipos del mismo torneo. Va
 * aquí porque es donde las cifras que descuadran se están mostrando, y porque desde
 * afuera es el único lugar donde las dos convocatorias se ven juntas
 * (ver @/lib/convocatorias-duplicados).
 *
 * La tarjeta es un contenedor con DOS botones y no un botón grande: el aviso lleva el
 * suyo para revisar los duplicados, y un botón dentro de otro no es HTML válido —el
 * navegador lo desarma y deja de funcionar el de adentro—.
 */

const moneda = (n: number): string =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/* 'YYYY-MM-DD' partido a mano: pasarlo por Date lo interpreta en UTC y corre el día. */
const fechaCorta = (dia: string | null): string | null => {
    if (!dia) return null;
    const [anio, mes, d] = dia.split("-").map(Number);
    return anio && mes && d ? `${d} ${MESES[mes - 1]} ${anio}` : null;
};

/** Cifra del bloque de dinero. `negativa` la pinta en rojo: una utilidad puede serlo. */
function Cifra({ etiqueta, valor, clase }: { etiqueta: string; valor: number; clase: string }) {
    return (
        <div className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 min-w-0">
            <p className="text-[8.5px] font-black text-slate-500 uppercase tracking-widest truncate">{etiqueta}</p>
            <p className={`text-[13px] font-black tabular-nums leading-tight truncate ${clase}`}>{moneda(valor)}</p>
        </div>
    );
}

export default function TarjetaCopaLiga({
    resumen, onAbrir, duplicados = 0, onRevisarDuplicados,
    sinConvocatoria = 0, onRevisarSinConvocatoria,
}: {
    resumen: ResumenCopaLiga;
    onAbrir: () => void;
    /** Cuántos niños de este torneo están convocados a más de un equipo. */
    duplicados?: number;
    onRevisarDuplicados?: () => void;
    /** Niños que pagaron este torneo pero cuya categoría no tiene convocatoria. */
    sinConvocatoria?: number;
    onRevisarSinConvocatoria?: () => void;
}) {
    const r = resumen;
    const escudo = r.tieneFoto ? `/api/copas-ligas/foto/${r.idLiga}?v=${r.fotoVersion ?? "0"}` : null;
    const pct = r.esperado > 0 ? Math.round((r.recaudado / r.esperado) * 100) : 0;
    // La portada se ordena por esta fecha, así que tiene que verse.
    const arranca = fechaCorta(r.desde);

    return (
        <div className={`bg-white/5 border rounded-2xl overflow-hidden transition-all ${
            duplicados > 0 || sinConvocatoria > 0 ? "border-amber-500/40" : "border-white/10 hover:border-blue-500/40"
        }`}>
        <button
            type="button"
            onClick={onAbrir}
            className="w-full text-left p-4 hover:bg-white/[0.08] transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/60"
        >
            {/* Identidad: escudo, nombre y si es copa o liga */}
            <div className="flex items-start gap-3 mb-3">
                {escudo ? (
                    <Image
                        src={escudo}
                        alt=""
                        width={44}
                        height={44}
                        unoptimized
                        className="w-11 h-11 rounded-lg object-contain bg-white/5 border border-white/10 flex-shrink-0"
                    />
                ) : (
                    <div className="w-11 h-11 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                        <Trophy size={18} className="text-slate-500" />
                    </div>
                )}

                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${
                            r.esCopa
                                ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                : "bg-blue-500/15 text-blue-300 border-blue-500/30"
                        }`}>
                            {r.esCopa ? "Copa" : "Liga"}
                        </span>
                        {r.abiertas > 0 ? (
                            <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400">
                                {r.abiertas} abierta(s)
                            </span>
                        ) : (
                            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                                Todas cerradas
                            </span>
                        )}
                        {arranca && (
                            <span
                                title="Arranque de la primera categoría del torneo"
                                className="text-[9px] font-bold uppercase tracking-widest text-slate-500"
                            >
                                · {arranca}
                            </span>
                        )}
                    </div>
                    <p className="text-sm font-black text-white leading-tight mt-1 break-words">{r.liga}</p>
                </div>

                <ChevronRight size={16} className="text-slate-600 group-hover:text-blue-300 transition-colors flex-shrink-0 mt-2" />
            </div>

            {/* Cuántas categorías y cuántos jugadores */}
            <div className="flex items-center gap-3 mb-2">
                <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                    <LayoutGrid size={12} className="text-slate-500" />
                    {r.categorias.length} categoría(s)
                </span>
                <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                    <Users size={12} className="text-slate-500" />
                    {r.jugadores} jugador(es)
                </span>
                {r.convocatorias !== r.categorias.length && (
                    <span className="text-[10px] text-slate-500">{r.convocatorias} convocatorias</span>
                )}
            </div>

            {/* El resumen de las categorías, cada una con su gente */}
            <div className="max-h-28 overflow-y-auto rounded-lg border border-white/10 bg-white/[0.03] divide-y divide-white/5 mb-3">
                {r.categorias.map((c) => (
                    <div key={c.categoria} className="flex items-center justify-between gap-2 px-2.5 py-1">
                        <span className={`text-[11px] font-bold truncate ${c.cerrada ? "text-slate-500" : "text-slate-200"}`}>
                            {c.categoria}
                            {c.grupos > 1 && <span className="text-[9px] text-slate-500"> · {c.grupos} grupos</span>}
                        </span>
                        <span className="text-[11px] font-black text-slate-300 tabular-nums flex-shrink-0">
                            {c.jugadores}
                        </span>
                    </div>
                ))}
            </div>

            {/* Las cuatro cifras del torneo */}
            <div className="grid grid-cols-2 gap-2">
                <Cifra etiqueta="Total esperado" valor={r.esperado} clase="text-slate-200" />
                <Cifra etiqueta="Total recaudado" valor={r.recaudado} clase="text-emerald-300" />
                <Cifra
                    etiqueta="Utilidad esp."
                    valor={r.utilidadEsperada}
                    clase={r.utilidadEsperada >= 0 ? "text-slate-200" : "text-rose-300"}
                />
                <Cifra
                    etiqueta="Utilidad rec."
                    valor={r.utilidadRecaudada}
                    clase={r.utilidadRecaudada >= 0 ? "text-emerald-300" : "text-rose-300"}
                />
            </div>

            {/* Avance del cobro: la misma barra que se lee de un vistazo en la portada */}
            <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Cobrado</span>
                    <span
                        title={pct > 100 ? "Se cobró más de lo esperado en este torneo" : undefined}
                        className={`text-[10px] font-black tabular-nums ${pct > 100 ? "text-amber-300" : "text-slate-300"}`}
                    >
                        {pct}%
                    </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                        className="h-full rounded-full bg-emerald-500/80"
                        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                    />
                </div>
            </div>
        </button>

        {/* Niños en dos equipos del mismo torneo: se cobran y se cuentan dos veces. */}
        {duplicados > 0 && (
            <div className="flex items-center justify-between gap-2 border-t border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
                <div className="flex items-start gap-2 min-w-0">
                    <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-px" />
                    <p className="text-[11px] font-bold text-amber-200 leading-tight">
                        {textoDuplicados(duplicados)}
                        <span className="block font-semibold text-amber-200/70">
                            Se les cobra y se les cuenta dos veces en este torneo.
                        </span>
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onRevisarDuplicados}
                    className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 text-[10px] font-black uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
                >
                    Revisar
                </button>
            </div>
        )}
        {sinConvocatoria > 0 && (
            <div className="flex items-center justify-between gap-2 border-t border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
                <div className="flex items-start gap-2 min-w-0">
                    <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-px" />
                    <p className="text-[11px] font-bold text-amber-200 leading-tight">
                        {sinConvocatoria === 1 ? "1 niño pagó sin convocatoria" : `${sinConvocatoria} niños pagaron sin convocatoria`}
                        <span className="block font-semibold text-amber-200/70">
                            Asígnalos como invitados a una categoría disponible.
                        </span>
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onRevisarSinConvocatoria}
                    className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 text-[10px] font-black uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
                >
                    Revisar
                </button>
            </div>
        )}
        </div>
    );
}
