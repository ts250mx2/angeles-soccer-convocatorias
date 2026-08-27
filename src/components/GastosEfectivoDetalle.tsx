"use client";

import { Receipt } from "lucide-react";

/**
 * Los gastos en efectivo de una apertura, uno por uno.
 *
 * Cuelga del renglón "Gastos Efectivo" del arqueo: esa cifra es la única del corte que
 * el cajero no puede contrastar contra nada —el fondo y las ventas salen de la caja y
 * de los recibos—, así que sin el desglose no hay forma de saber qué la compone ni de
 * detectar un gasto capturado en la apertura equivocada.
 *
 * Lo usan las dos pantallas que abren el corte (Control de Caja y Cortes por Mes), que
 * leen el mismo endpoint.
 */

export interface GastoEfectivo {
    idEgreso: number;
    /** 'dd/mm/aaaa hh:mm', ya formateada por el servidor. */
    fecha: string;
    concepto: string;
    pagarA: string;
    /** '—' cuando no se capturó. */
    recibo: string;
    total: number;
}

const money = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

export default function GastosEfectivoDetalle({ gastos }: { gastos: GastoEfectivo[] }) {
    if (gastos.length === 0) {
        return (
            <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                Sin gastos en efectivo en esta apertura.
            </p>
        );
    }

    return (
        <div className="mt-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] overflow-hidden">
            <div className="px-3 py-1.5 flex items-center justify-between gap-2 border-b border-rose-500/15">
                <span className="text-[9px] font-black uppercase tracking-widest text-rose-300/80 flex items-center gap-1">
                    <Receipt size={10} /> Detalle
                </span>
                <span className="text-[9px] font-bold text-slate-400">
                    {gastos.length} gasto(s)
                </span>
            </div>
            {/* Una apertura puede traer ochenta gastos: la lista scrollea dentro de su caja
                en lugar de estirar el bloque del arqueo. */}
            <ul className="max-h-56 overflow-y-auto divide-y divide-white/5">
                {gastos.map((g) => (
                    <li key={g.idEgreso} className="px-3 py-1.5 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="text-[11px] text-slate-200 leading-snug line-clamp-2" title={g.concepto}>
                                {g.concepto}
                            </p>
                            <p className="text-[9px] text-slate-500 truncate">
                                {g.pagarA} · {g.fecha}
                                {g.recibo !== "—" ? ` · Recibo ${g.recibo}` : ""}
                            </p>
                        </div>
                        <span className="text-[11px] font-bold text-rose-300 tabular-nums flex-shrink-0">
                            {money(g.total)}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
