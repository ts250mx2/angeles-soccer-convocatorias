"use client";

/**
 * El reparto de los alumnos por tramo de permanencia.
 *
 * Es una comparación de MAGNITUD sobre una escala ordenada —cuántos llevan un año,
 * cuántos dos, cuántos cuatro—, y para eso la forma correcta es la barra, no una dona:
 * los tramos son cinco y con cinco rebanadas el ángulo deja de servir para comparar.
 * Las barras además se leen contra un mismo eje, así que "el doble" se ve como el doble.
 *
 * Horizontales porque las etiquetas son frases ('4 años o más'), y en vertical habría
 * que voltear el texto o abreviarlo.
 *
 * El color NO carga con el dato: la barra ya lo dice con su largo y cada renglón lleva
 * su etiqueta y su número escritos. El tono solo refuerza el orden del tramo (rampa de
 * un solo azul, más claro entre más años, que sobre el fondo oscuro es lo que se lee
 * como "más"). Por eso no hace falta leyenda: es una sola serie.
 */

export interface BarraPermanencia {
    clave: string;
    etiqueta: string;
    cantidad: number;
    color: string;
}

export default function BarrasPermanencia({
    barras,
    total,
    seleccion,
    onSeleccionar,
}: {
    barras: BarraPermanencia[];
    /** Denominador de los porcentajes; normalmente la suma de las barras. */
    total: number;
    /** Tramo resaltado, o null. */
    seleccion: string | null;
    onSeleccionar: (clave: string) => void;
}) {
    /* La escala va contra el tramo MÁS NUMEROSO, no contra el total: si fuera contra el
       total, con el reparto repartido en cinco ninguna barra pasaría del 40% y todas se
       verían igual de cortas. El porcentaje escrito al lado es el que sí va sobre el
       total, que es la pregunta de fondo. */
    const tope = Math.max(1, ...barras.map((b) => b.cantidad));

    return (
        <div className="flex flex-col gap-1.5">
            {barras.map((b) => {
                const activo = seleccion === b.clave;
                const pct = total > 0 ? (b.cantidad / total) * 100 : 0;
                return (
                    <button
                        key={b.clave}
                        type="button"
                        onClick={() => onSeleccionar(b.clave)}
                        aria-pressed={activo}
                        title={`${b.etiqueta}: ${b.cantidad.toLocaleString("es-MX")} de ${total.toLocaleString("es-MX")} (${pct.toFixed(1)}%)`}
                        className={`grid grid-cols-[7.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                            activo ? "bg-white/10" : "hover:bg-white/5"
                        }`}
                    >
                        <span className={`text-[11px] font-bold ${activo ? "text-slate-100" : "text-slate-400"}`}>
                            {b.etiqueta}
                        </span>

                        {/* El riel es el eje: recesivo, y solo está para que se vea de
                            dónde arranca la barra y hasta dónde podría llegar. */}
                        <span className="relative block h-3 rounded-full bg-white/5">
                            <span
                                className="absolute inset-y-0 left-0 rounded-full transition-all"
                                style={{
                                    width: `${(b.cantidad / tope) * 100}%`,
                                    backgroundColor: b.color,
                                    opacity: seleccion && !activo ? 0.4 : 1,
                                }}
                            />
                        </span>

                        <span className="text-right text-[11px] tabular-nums">
                            <span className={`font-black ${activo ? "text-white" : "text-slate-200"}`}>
                                {b.cantidad.toLocaleString("es-MX")}
                            </span>
                            <span className="ml-1 text-[10px] text-slate-500">{pct.toFixed(0)}%</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
