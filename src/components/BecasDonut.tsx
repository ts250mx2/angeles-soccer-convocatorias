"use client";

/**
 * Reparto de los inscritos entre quienes no tienen beca y los niveles de beca.
 *
 * Es part-to-whole de un vistazo, con pocos segmentos: la forma correcta para eso es
 * una dona, no una barra apilada, mientras no haya que comparar valores cercanos. Por
 * eso el listado de al lado trae siempre el número y el porcentaje: la comparación fina
 * se hace ahí y no midiendo ángulos.
 *
 * Colores (validados contra el fondo #0f172a con el validador del skill de dataviz):
 *  - "Sin beca" es el resto, o sea contexto: gris neutro que retrocede.
 *  - Los niveles de beca son una escala ORDENADA (100 > 50 > 25), así que llevan una
 *    rampa de un solo tono, no colores distintos. Más beca = más claro, que sobre
 *    fondo oscuro es lo que se lee como "más".
 *  - "Otras becas" no pertenece a la escala, así que sale de ella con un tono aparte.
 * Solo caben tres escalones de un tono que se distingan entre sí con visión normal
 * (ΔE 15.2 sobre un piso de 15), de ahí el tope de tres niveles con nombre.
 */

export const SIN_BECA_COLOR = '#64748b';
/** Rampa ordinal: del nivel de beca más alto al más bajo. */
export const BECA_RAMPA = ['#cde2fb', '#86b6ef', '#3987e5'];
export const OTRAS_BECAS_COLOR = '#d95926';
/** Máximo de niveles con nombre; el resto se agrupa en "Otras becas". */
export const MAX_NIVELES = BECA_RAMPA.length;

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

function arco(cx: number, cy: number, rExt: number, rInt: number, desde: number, hasta: number) {
    const largo = hasta - desde > 180 ? 1 : 0;
    const e1 = punto(cx, cy, rExt, desde);
    const e2 = punto(cx, cy, rExt, hasta);
    const i2 = punto(cx, cy, rInt, hasta);
    const i1 = punto(cx, cy, rInt, desde);
    return [
        `M ${e1.x.toFixed(2)} ${e1.y.toFixed(2)}`,
        `A ${rExt} ${rExt} 0 ${largo} 1 ${e2.x.toFixed(2)} ${e2.y.toFixed(2)}`,
        `L ${i2.x.toFixed(2)} ${i2.y.toFixed(2)}`,
        `A ${rInt} ${rInt} 0 ${largo} 0 ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
        'Z',
    ].join(' ');
}

export default function BecasDonut({ rebanadas, total, tamano = 88 }: {
    rebanadas: Rebanada[];
    /** Denominador; normalmente la suma de las rebanadas. */
    total: number;
    tamano?: number;
}) {
    const visibles = rebanadas.filter((r) => r.cantidad > 0);
    if (total <= 0 || visibles.length === 0) return null;

    const cx = 50, cy = 50, rExt = 46, rInt = 27;
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

    return (
        <svg
            viewBox="0 0 100 100"
            width={tamano}
            height={tamano}
            className="flex-shrink-0"
            role="img"
            aria-label={`Reparto de ${total} inscritos. ${descripcion}`}
        >
            {/* Una sola rebanada no se puede trazar con un arco: se dibuja el anillo entero. */}
            {visibles.length === 1 ? (
                <circle
                    cx={cx} cy={cy} r={(rExt + rInt) / 2}
                    fill="none" stroke={visibles[0].color} strokeWidth={rExt - rInt}
                />
            ) : (
                paths.map((p) => (
                    <path key={p.etiqueta} d={p.d} fill={p.color} stroke={separador} strokeWidth={2} />
                ))
            )}
        </svg>
    );
}
