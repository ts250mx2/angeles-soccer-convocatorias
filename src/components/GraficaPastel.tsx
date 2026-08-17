"use client";

/**
 * Gráfica de pastel (o de dona, si se le pide hueco) para repartos part-to-whole con
 * pocos segmentos.
 *
 * Con dos o tres rebanadas el pastel se lee de un golpe; en cuanto hay que comparar
 * valores cercanos el ángulo deja de servir, así que quien la use debe acompañarla
 * SIEMPRE del número y el porcentaje escritos al lado. El color aquí acompaña, no
 * carga solo con el dato: es también lo que la mantiene legible para quien no
 * distingue los tonos.
 */

export interface Rebanada {
    etiqueta: string;
    cantidad: number;
    color: string;
}

/** Punto del borde de un círculo, con 0° arriba y avanzando en sentido horario. */
function punto(cx: number, cy: number, r: number, grados: number) {
    const rad = ((grados - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Rebanada entre dos ángulos. Con `rInt` en 0 sale una cuña de pastel (del centro al
 * borde); con `rInt` mayor que 0, un segmento de dona.
 */
function arco(cx: number, cy: number, rExt: number, rInt: number, desde: number, hasta: number) {
    const largo = hasta - desde > 180 ? 1 : 0;
    const e1 = punto(cx, cy, rExt, desde);
    const e2 = punto(cx, cy, rExt, hasta);
    const borde = [
        `M ${e1.x.toFixed(2)} ${e1.y.toFixed(2)}`,
        `A ${rExt} ${rExt} 0 ${largo} 1 ${e2.x.toFixed(2)} ${e2.y.toFixed(2)}`,
    ];
    // Un arco de radio 0 es degenerado: la cuña se cierra por el centro.
    if (rInt <= 0) return [...borde, `L ${cx} ${cy}`, 'Z'].join(' ');

    const i2 = punto(cx, cy, rInt, hasta);
    const i1 = punto(cx, cy, rInt, desde);
    return [
        ...borde,
        `L ${i2.x.toFixed(2)} ${i2.y.toFixed(2)}`,
        `A ${rInt} ${rInt} 0 ${largo} 0 ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
        'Z',
    ].join(' ');
}

export default function GraficaPastel({ rebanadas, total, tamano = 88, hueco = 0, unidad = 'registros' }: {
    rebanadas: Rebanada[];
    /** Denominador; normalmente la suma de las rebanadas. */
    total: number;
    tamano?: number;
    /** Radio interior (0-45). En 0 es un pastel macizo; mayor, una dona. */
    hueco?: number;
    /** Qué se está contando, para la descripción accesible. */
    unidad?: string;
}) {
    const visibles = rebanadas.filter((r) => r.cantidad > 0);
    if (total <= 0 || visibles.length === 0) return null;

    const cx = 50, cy = 50, rExt = 46, rInt = Math.max(0, Math.min(45, hueco));
    // El hueco de 2px entre rebanadas lo da el trazo del color del fondo.
    const separador = '#0f172a';

    let angulo = 0;
    const paths = visibles.map((r) => {
        const barrido = (r.cantidad / total) * 360;
        const d = arco(cx, cy, rExt, rInt, angulo, angulo + barrido);
        angulo += barrido;
        return { ...r, d };
    });

    const descripcion = visibles
        .map((r) => `${r.etiqueta}: ${r.cantidad} (${Math.round((r.cantidad / total) * 100)}%)`)
        .join(', ');

    /* Una sola rebanada cubre los 360°, y un arco que empieza y termina en el mismo
       punto no se traza: se dibuja el círculo (o el anillo) completo. */
    const unica = visibles.length === 1;

    return (
        <svg
            viewBox="0 0 100 100"
            width={tamano}
            height={tamano}
            className="flex-shrink-0"
            role="img"
            aria-label={`Reparto de ${total} ${unidad}. ${descripcion}`}
        >
            {unica ? (
                rInt > 0 ? (
                    <circle
                        cx={cx} cy={cy} r={(rExt + rInt) / 2}
                        fill="none" stroke={visibles[0].color} strokeWidth={rExt - rInt}
                    />
                ) : (
                    <circle cx={cx} cy={cy} r={rExt} fill={visibles[0].color} />
                )
            ) : (
                paths.map((p) => (
                    <path key={p.etiqueta} d={p.d} fill={p.color} stroke={separador} strokeWidth={2} />
                ))
            )}
        </svg>
    );
}
