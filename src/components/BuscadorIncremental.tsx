"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Search, X } from "lucide-react";

/**
 * Campo de captura con lista desplegable y búsqueda al teclear.
 *
 * Sirve para los dos casos del formato de incorporación, que parecen iguales pero no lo
 * son:
 *
 *   Lista corta (profesores, categorías): las opciones llegan completas y el filtrado es
 *   local, así que responde en cada tecla sin ir al servidor.
 *
 *   Lista larga (jugadores): se pasa `onBuscar` y el componente lo llama con lo tecleado,
 *   esperando a que el usuario deje de escribir. Quien lo usa devuelve las opciones.
 *
 * Se cierra al hacer clic fuera y se maneja con el teclado, porque esta pantalla se
 * llena renglón tras renglón y obligar a soltar el teclado la vuelve lenta.
 */

export interface OpcionBuscador {
    valor: string;
    etiqueta: string;
    /** Segunda línea: categoría, sede… lo que ayuda a distinguir homónimos. */
    detalle?: string;
}

/** Espera antes de llamar a `onBuscar`, para no pedir en cada letra. */
const ESPERA = 300;

interface Props {
    etiqueta: string;
    opciones: OpcionBuscador[];
    valor: string | null;
    onChange: (opcion: OpcionBuscador | null) => void;
    placeholder?: string;
    /** Búsqueda en el servidor. Si no se pasa, el filtrado es local. */
    onBuscar?: (texto: string) => void;
    cargando?: boolean;
    autoFocus?: boolean;
    /** Permite capturar un valor que no está en la lista (grupos nuevos). */
    permiteNuevo?: boolean;
}

export default function BuscadorIncremental({
    etiqueta, opciones, valor, onChange, placeholder, onBuscar, cargando, autoFocus, permiteNuevo,
}: Props) {
    const [abierto, setAbierto] = useState(false);
    const [texto, setTexto] = useState("");
    const [resaltado, setResaltado] = useState(0);
    const caja = useRef<HTMLDivElement>(null);

    const elegida = opciones.find((o) => o.valor === valor) ?? null;

    /* Con búsqueda en servidor la lista ya viene filtrada; filtrarla otra vez aquí
       escondería resultados que el servidor sí encontró. */
    const visibles = useMemo(() => {
        if (onBuscar || !texto.trim()) return opciones;
        const q = texto.trim().toLowerCase();
        return opciones.filter(
            (o) => o.etiqueta.toLowerCase().includes(q) || (o.detalle ?? "").toLowerCase().includes(q),
        );
    }, [opciones, texto, onBuscar]);

    useEffect(() => {
        if (!abierto || !onBuscar) return;
        const id = setTimeout(() => onBuscar(texto), ESPERA);
        return () => clearTimeout(id);
    }, [texto, abierto, onBuscar]);

    useEffect(() => {
        if (!abierto) return;
        const fuera = (e: MouseEvent) => {
            if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
        };
        document.addEventListener("mousedown", fuera);
        return () => document.removeEventListener("mousedown", fuera);
    }, [abierto]);

    const elegir = (opcion: OpcionBuscador) => {
        onChange(opcion);
        setTexto("");
        setAbierto(false);
    };

    const teclas = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") return setAbierto(false);
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setAbierto(true);
            setResaltado((i) => Math.min(i + 1, visibles.length - 1));
            return;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            setResaltado((i) => Math.max(i - 1, 0));
            return;
        }
        if (e.key === "Enter") {
            e.preventDefault();
            if (visibles[resaltado]) return elegir(visibles[resaltado]);
            // Un grupo que todavía no existe se captura tal cual se escribió.
            if (permiteNuevo && texto.trim()) elegir({ valor: texto.trim().toUpperCase(), etiqueta: texto.trim().toUpperCase() });
        }
    };

    return (
        <div ref={caja} className="relative">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                {etiqueta}
            </label>

            {elegida && !abierto ? (
                <button
                    type="button"
                    onClick={() => { setAbierto(true); setTexto(""); setResaltado(0); }}
                    className="w-full flex items-center justify-between gap-2 bg-white/5 border border-white/15 rounded-lg py-2 px-3 text-left hover:border-blue-500/60 transition-colors"
                >
                    <span className="min-w-0">
                        <span className="block text-sm text-slate-100 truncate">{elegida.etiqueta}</span>
                        {elegida.detalle && <span className="block text-[10px] text-slate-500 truncate">{elegida.detalle}</span>}
                    </span>
                    <span className="flex items-center gap-1 flex-shrink-0">
                        <X
                            size={13}
                            className="text-slate-500 hover:text-rose-300"
                            onClick={(e) => { e.stopPropagation(); onChange(null); }}
                        />
                        <ChevronDown size={14} className="text-slate-500" />
                    </span>
                </button>
            ) : (
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input
                        autoFocus={autoFocus}
                        value={texto}
                        onChange={(e) => { setTexto(e.target.value); setResaltado(0); setAbierto(true); }}
                        onFocus={() => setAbierto(true)}
                        onKeyDown={teclas}
                        placeholder={placeholder ?? "Escribe para buscar..."}
                        className="w-full bg-white/5 border border-white/15 text-slate-200 text-sm py-2 pl-9 pr-8 rounded-lg outline-none focus:border-blue-500 transition-colors"
                    />
                    {cargando && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 animate-spin" />}
                </div>
            )}

            {abierto && (
                <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-white/15 bg-slate-900 shadow-2xl divide-y divide-white/5">
                    {visibles.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-slate-500">
                            {permiteNuevo && texto.trim()
                                ? `Pulsa Enter para usar "${texto.trim().toUpperCase()}"`
                                : "Sin coincidencias"}
                        </p>
                    ) : (
                        visibles.map((o, i) => (
                            <button
                                key={o.valor}
                                type="button"
                                onMouseEnter={() => setResaltado(i)}
                                onClick={() => elegir(o)}
                                className={`w-full text-left px-3 py-2 transition-colors ${
                                    i === resaltado ? "bg-blue-600/20" : "hover:bg-white/5"
                                }`}
                            >
                                <span className="block text-xs font-bold text-slate-200 truncate">{o.etiqueta}</span>
                                {o.detalle && <span className="block text-[10px] text-slate-500 truncate">{o.detalle}</span>}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
