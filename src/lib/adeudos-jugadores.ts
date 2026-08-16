import { pool } from '@/lib/db';
import type { SeasonMonths } from '@/lib/adeudos-season';
import {
    ES_BECA_TOTAL, ESTA_INSCRITO, SIN_CLINICS, ES_KEEPER_O_PORTERO,
} from '@/lib/adeudos-db';
import { esFutsal } from '@/lib/jugador-filtros';

/**
 * Quién debe, jugador por jugador, en una temporada.
 *
 * Existe aparte de countsByGroup (que devuelve conteos agregados) porque hay pantallas
 * que necesitan cruzar la deuda contra otra lista de jugadores; el primer caso es la
 * alerta de Pagos de Copas y Ligas.
 *
 * Aplica LAS MISMAS reglas que el bloque "Adeudos esta temporada" de Adeudos por Sede:
 * grupo normal (sin futsal, porteros, clinics ni venta al público), sin becas del 100%,
 * y con el adeudo contado desde el mes en que el jugador pagó su inscripción.
 */

export interface JugadorConAdeudo {
    idJugador: number;
    jugador: string;
    categoria: string;
    sede: string;
    /** Meses vencidos sin pagar. 0 en quien no se ha inscrito. */
    mesesDebe: number;
    /** false = no se ha inscrito en la temporada; su pendiente es la inscripción. */
    inscrito: boolean;
}

/**
 * Devuelve solo a quien tiene algo pendiente: o no se inscribió, o se inscribió y le
 * faltan meses vencidos. Quien está al corriente no aparece en el mapa.
 *
 * `soloJugadores` acota el cálculo a una lista concreta. Sin él se recorre la
 * temporada entera (lo que necesitan Adeudos por Sede y Pagos de Copas); con él, las
 * pantallas que solo preguntan por un puñado de jugadores —la lista de una
 * convocatoria— no pagan el barrido completo de tblPagos. La REGLA es la misma en
 * ambos casos: lo único que cambia es cuántos jugadores entran al cálculo.
 */
export async function jugadoresConAdeudo(
    m: SeasonMonths,
    soloJugadores?: number[],
): Promise<Map<number, JugadorConAdeudo>> {
    const ES_FUTSAL = esFutsal('SD');
    const finCodigo = m.anioInicio * 100 + m.endMonth;

    // Lista vacía = ningún jugador que consultar; no es lo mismo que no acotar.
    if (soloJugadores && soloJugadores.length === 0) return new Map();

    // Sin lista, los filtros quedan vacíos y el SQL es idéntico al de antes.
    const acotado = Array.isArray(soloJugadores);
    const filtroP = acotado ? 'AND P.IdJugador IN (?)' : '';
    const filtroPagos = acotado ? 'AND IdJugador IN (?)' : '';
    const filtroJ = acotado ? 'AND J.IdJugador IN (?)' : '';
    /** El mismo arreglo de ids como parámetro, una vez por filtro aplicado. */
    const ids: unknown[] = acotado ? [soloJugadores] : [];

    const [rows] = await pool.query(
        `SELECT
            J.IdJugador,
            J.Jugador,
            J.Categoria,
            COALESCE(SD.Sede, J.Sede) AS Sede,
            CASE WHEN ${ESTA_INSCRITO} THEN 1 ELSE 0 END AS Inscrito,
            INS.MesInscripcion,
            COALESCE(MEN.MesesPagados, '') AS MesesPagados
         FROM tblJugadores J
         LEFT JOIN tblSedes SD ON SD.IdSede = J.IdSede
         LEFT JOIN (
             SELECT P.IdJugador,
                    GREATEST(?, LEAST(?, MIN(YEAR(P.FechaPago) * 100 + MONTH(P.FechaPago)))) % 100 AS MesInscripcion
             FROM tblPagos P
             INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             WHERE P.IdTemporada = ? AND PR.IdTipoProducto = 2 AND P.Status = 0 ${filtroP}
             GROUP BY P.IdJugador
         ) INS ON INS.IdJugador = J.IdJugador
         LEFT JOIN (
             -- Cualquier inscripción, de cualquier temporada (regla portero/keeper).
             SELECT DISTINCT P.IdJugador
             FROM tblPagos P
             INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             WHERE PR.IdTipoProducto = 2 AND P.Status = 0 ${filtroP}
         ) KINS ON KINS.IdJugador = J.IdJugador
         LEFT JOIN (
             SELECT P.IdJugador, GROUP_CONCAT(DISTINCT P.Mes) AS MesesPagados
             FROM tblPagos P
             INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             WHERE PR.IdTipoProducto = 1 AND P.Status = 0
               AND P.Anio IS NOT NULL AND P.Mes BETWEEN 1 AND 12
               AND (P.Anio * 100 + P.Mes) BETWEEN ? AND ? ${filtroP}
             GROUP BY P.IdJugador
         ) MEN ON MEN.IdJugador = J.IdJugador
         LEFT JOIN (
             -- Temporada del primer pago: quien solo tiene pagos posteriores no estuvo aquí.
             SELECT IdJugador, MIN(IdTemporada) AS minTemp
             FROM tblPagos WHERE Status = 0 ${filtroPagos} GROUP BY IdJugador
         ) PT ON PT.IdJugador = J.IdJugador
         WHERE ${SIN_CLINICS}
           AND J.Status = 0
           AND NOT ${ES_BECA_TOTAL}
           AND NOT ${ES_FUTSAL}
           AND NOT ${ES_KEEPER_O_PORTERO}
           AND (
               (PT.minTemp IS NOT NULL AND PT.minTemp <= ?)
               OR (PT.minTemp IS NULL AND COALESCE(J.IdTemporadaActiva, 0) <= ?)
           )
           ${filtroJ}`,
        [
            m.desdeCodigo, finCodigo, m.seasonId, ...ids,  // INS
            ...ids,                                        // KINS
            m.desdeCodigo, finCodigo, ...ids,              // MEN
            ...ids,                                        // PT
            m.seasonId, m.seasonId, ...ids,                // WHERE externo
        ],
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    // Tope de cobro por categoría: categorías que dejaron de cobrarse antes de que
    // terminara la temporada. Sin la tabla, el tope es el último mes exigible.
    const catFin = new Map<string, number>();
    try {
        const [cf] = await pool.query(
            `SELECT UPPER(TRIM(Categoria)) AS Cat, MesFin FROM tblAdeudosCategoriaFin WHERE IdTemporada = ?`,
            [m.seasonId],
        ) as unknown as [Array<{ Cat: string; MesFin: number }>, unknown];
        for (const r of cf) catFin.set(String(r.Cat), Number(r.MesFin));
    } catch { /* tabla ausente: sin topes */ }

    const topeDe = (categoria: unknown): number => {
        const f = catFin.get(String(categoria ?? '').trim().toUpperCase());
        return Number.isInteger(f) ? Math.min(m.hastaMonth, f as number) : m.hastaMonth;
    };

    const out = new Map<number, JugadorConAdeudo>();
    for (const p of rows) {
        const inscrito = Number(p.Inscrito) === 1;

        // El adeudo arranca en el mes en que pagó su inscripción, no al inicio de la
        // temporada: quien entró a mitad de ciclo no arrastra los meses previos.
        const mesIns = Number(p.MesInscripcion);
        const mesInicio = Number.isInteger(mesIns) && mesIns >= m.startMonth && mesIns <= m.endMonth
            ? mesIns
            : m.startMonth;

        const pagados = String(p.MesesPagados || '')
            .split(',')
            .map((x) => parseInt(x.trim(), 10))
            .filter((x) => !isNaN(x));

        let mesesDebe = 0;
        if (inscrito) {
            const tope = topeDe(p.Categoria);
            for (let mes = mesInicio; mes <= tope; mes++) {
                if (!pagados.includes(mes)) mesesDebe++;
            }
        }

        // Al corriente: se inscribió y no le falta ningún mes vencido.
        if (inscrito && mesesDebe === 0) continue;

        out.set(Number(p.IdJugador), {
            idJugador: Number(p.IdJugador),
            jugador: String(p.Jugador ?? ''),
            categoria: String(p.Categoria ?? ''),
            sede: String(p.Sede ?? ''),
            mesesDebe,
            inscrito,
        });
    }
    return out;
}
