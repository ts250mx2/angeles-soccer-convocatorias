import { pool } from '@/lib/db';
import { ESTA_INSCRITO, SIN_CLINICS, loadSeasonAndPrevious } from '@/lib/adeudos-db';
import { jugadoresConAdeudo } from '@/lib/adeudos-jugadores';

/**
 * Quién puede ser convocado.
 *
 * Dos condiciones, ambas medidas contra la temporada de la convocatoria:
 *   1. Estar INSCRITO (pago de inscripción de esa temporada; los porteros heredan
 *      cualquier inscripción previa, igual que en Adeudos).
 *   2. No deber mensualidades vencidas.
 *
 * El adeudo se calcula con la MISMA función que Adeudos por Sede y Pagos de Copas
 * (`jugadoresConAdeudo`), para que las tres pantallas nunca digan cosas distintas del
 * mismo jugador. Esa regla ya excluye a quien no paga mensualidad: becas del 100%,
 * porteros/keepers, futsal y clinics. A esos, aquí, simplemente no les sale adeudo.
 */

export interface EstadoTemporada {
    /** Tiene inscripción pagada en la temporada. */
    inscrito: boolean;
    /** Meses vencidos sin pagar. 0 si está al corriente o si la regla no le aplica. */
    mesesDebe: number;
    /**
     * El modelo de inscripción/mensualidad no le aplica (sede de clinics, venta al
     * público). No se le exige inscripción ni se le oculta de la lista.
     */
    exento: boolean;
}

const SIN_DATO: EstadoTemporada = { inscrito: false, mesesDebe: 0, exento: true };

/**
 * Estado de inscripción y adeudo de un grupo de jugadores en una temporada.
 * Los jugadores que no existan en el catálogo quedan fuera del mapa.
 */
export async function estadoEnTemporada(
    seasonId: number,
    idsJugadores: number[],
): Promise<Map<number, EstadoTemporada>> {
    const out = new Map<number, EstadoTemporada>();
    if (idsJugadores.length === 0) return out;

    const [filas] = (await pool.query(
        `SELECT J.IdJugador,
                CASE WHEN ${ESTA_INSCRITO} THEN 1 ELSE 0 END AS Inscrito,
                CASE WHEN ${SIN_CLINICS} THEN 0 ELSE 1 END AS Exento
           FROM tblJugadores J
           LEFT JOIN tblSedes SD ON SD.IdSede = J.IdSede
           LEFT JOIN (
               SELECT DISTINCT P.IdJugador
               FROM tblPagos P
               INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
               WHERE P.IdTemporada = ? AND PR.IdTipoProducto = 2 AND P.Status = 0
                 AND P.IdJugador IN (?)
           ) INS ON INS.IdJugador = J.IdJugador
           LEFT JOIN (
               -- Cualquier inscripción, de cualquier temporada (regla portero/keeper).
               SELECT DISTINCT P.IdJugador
               FROM tblPagos P
               INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
               WHERE PR.IdTipoProducto = 2 AND P.Status = 0
                 AND P.IdJugador IN (?)
           ) KINS ON KINS.IdJugador = J.IdJugador
          WHERE J.IdJugador IN (?)`,
        [seasonId, idsJugadores, idsJugadores, idsJugadores],
    )) as [Array<{ IdJugador: number; Inscrito: number; Exento: number }>, unknown];

    // La MISMA regla que Adeudos por Sede, pero acotada a estos jugadores: sin acotar,
    // la consulta barre tblPagos entera y la lista tardaba segundos en abrir.
    const temporadas = await loadSeasonAndPrevious(String(seasonId));
    const deudores = temporadas ? await jugadoresConAdeudo(temporadas.actual, idsJugadores) : new Map();

    for (const fila of filas) {
        const id = Number(fila.IdJugador);
        const deudor = deudores.get(id);
        out.set(id, {
            inscrito: Number(fila.Inscrito) === 1,
            // Solo cuentan los meses de quien SÍ se inscribió: a quien no, lo que le
            // falta es la inscripción, y eso se informa aparte.
            mesesDebe: deudor?.inscrito ? deudor.mesesDebe : 0,
            exento: Number(fila.Exento) === 1,
        });
    }
    return out;
}

/** ¿Se puede convocar? Devuelve el motivo del rechazo, o null si sí se puede. */
export function motivoNoConvocable(estado: EstadoTemporada | undefined): string | null {
    const e = estado ?? SIN_DATO;
    if (!e.inscrito && !e.exento) {
        return 'No está inscrito en la temporada. Registra su inscripción antes de convocarlo.';
    }
    if (e.mesesDebe > 0) {
        const meses = e.mesesDebe === 1 ? '1 mes' : `${e.mesesDebe} meses`;
        return `Tiene ${meses} de adeudo en la temporada. Ponlo al corriente antes de convocarlo.`;
    }
    return null;
}
