import { pool } from '@/lib/db';
import { resolveSeasonMonths, type SeasonMonths, type SeasonRow } from '@/lib/adeudos-season';

const SEASON_COLS = 'IdTemporada, Temporada, FechaInicio, FechaFin';

/**
 * Beca total (100%): el jugador no paga nada, así que nunca tiene adeudo aunque no
 * existan registros de mensualidad. Sus conceptos suelen capturarse con importe 0
 * (o ni siquiera capturarse), y contarlos como deuda contradecía el monto, que ya
 * daba $0. tblJugadores.Beca guarda porcentajes limpios ('0','50','100').
 */
export const ES_BECA_TOTAL = `(COALESCE(NULLIF(TRIM(J.Beca), ''), '0') + 0) >= 100`;

/**
 * Las sedes de clinics (tblSedes.EsClinics = 1) no manejan inscripción ni
 * mensualidades como el resto, así que se excluyen de todo cálculo de adeudo.
 * Requiere tener la sede unida con el alias SD.
 */
export const SIN_CLINICS = `COALESCE(SD.EsClinics, 0) = 0`;

/**
 * Resuelve la temporada seleccionada (o la activa) y la INMEDIATA ANTERIOR.
 *
 * "Anterior" se decide por FechaInicio (con IdTemporada como desempate) y no por
 * IdTemporada a secas, para no depender de que los ids vayan en orden cronológico.
 */
export async function loadSeasonAndPrevious(
    temporadaId: string | null
): Promise<{ actual: SeasonMonths; anterior: SeasonMonths | null } | null> {
    let seleccionada: SeasonRow | null = null;

    if (temporadaId) {
        const [rows] = await pool.query(
            `SELECT ${SEASON_COLS} FROM tblTemporadas WHERE IdTemporada = ? LIMIT 1`,
            [temporadaId]
        ) as any[];
        if (rows.length) seleccionada = rows[0];
    }
    if (!seleccionada) {
        const [rows] = await pool.query(
            `SELECT ${SEASON_COLS} FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1`
        ) as any[];
        seleccionada = rows[0] ?? null;
    }
    if (!seleccionada) return null;

    const [prev] = await pool.query(
        `SELECT ${SEASON_COLS}
         FROM tblTemporadas
         WHERE (FechaInicio < ?) OR (FechaInicio = ? AND IdTemporada < ?)
         ORDER BY FechaInicio DESC, IdTemporada DESC
         LIMIT 1`,
        [seleccionada.FechaInicio, seleccionada.FechaInicio, seleccionada.IdTemporada]
    ) as any[];

    return {
        actual: resolveSeasonMonths(seleccionada),
        anterior: prev.length ? resolveSeasonMonths(prev[0]) : null,
    };
}

export interface AdeudoCounts {
    debe: number;
    alCorriente: number;
    /** Beca 100% sin pago de inscripción: no deben, pero tampoco están inscritos. */
    becadosSinInscripcion: number;
    /** Deben absolutamente todo: sin inscripción y sin un solo mes vencido pagado. */
    posiblesBajas: number;
    /** Activos sin pago de inscripción en la temporada. */
    debeInscripcion: number;
    /** Por cada mes ya vencido, cuántos activos no lo han pagado. */
    debeMeses: { mes: number; cantidad: number }[];
}

/**
 * Cuenta, para una temporada, cuántos jugadores activos deben algo (inscripción o
 * un mes ya vencido) y cuántos van al corriente, agrupado por sede o por categoría.
 *
 * Las definiciones son idénticas a los filtros `debe` / `al-corriente` del endpoint
 * de jugadores, para que el conteo de la tarjeta y el del modal siempre coincidan.
 */
export async function countsByGroup(
    m: SeasonMonths,
    groupBy: 'sede' | 'categoria',
    sedeId?: number | null
): Promise<Map<string | number, AdeudoCounts>> {
    const groupCol = groupBy === 'sede' ? 'J.IdSede' : 'J.Categoria';
    const sedeClause = sedeId ? 'AND J.IdSede = ?' : '';

    // Meses ya vencidos de la temporada. Si aún no arranca, la lista va vacía y
    // el desglose se reduce a la inscripción.
    const meses: number[] = [];
    for (let mes = m.startMonth; mes <= m.hastaMonth; mes++) meses.push(mes);

    /* Columnas por mes generadas a partir de enteros derivados del servidor
       (nunca de la petición), así que no hay riesgo de inyección. */
    const flagsPorMes = meses
        .map((mes) => `MAX(CASE WHEN (P.Anio * 100 + P.Mes) = ${m.anioInicio * 100 + mes} THEN 1 ELSE 0 END) as M${mes}`)
        .join(', ');
    const conteosPorMes = meses
        .map((mes) => `SUM(CASE WHEN J.Status = 0 AND NOT ${ES_BECA_TOTAL}
                                 AND COALESCE(MEN.M${mes}, 0) = 0
                            THEN 1 ELSE 0 END) as Debe${mes}`)
        .join(', ');

    const params: any[] = [
        m.mesesExigibles,   // Debe
        m.mesesExigibles,   // AlCorriente
        m.seasonId,         // inscripción (sí va por temporada: no tiene mes)
        m.desdeCodigo,      // mensualidades: rango mes-año exigible
        m.hastaCodigo,
    ];
    if (sedeId) params.push(sedeId);

    const [rows] = await pool.query(
        `SELECT
            ${groupCol} as Grupo,
            SUM(CASE WHEN J.Status = 0
                      AND NOT ${ES_BECA_TOTAL}
                      AND (INS.IdJugador IS NULL OR COALESCE(MEN.PagosCount, 0) < ?)
                 THEN 1 ELSE 0 END) as Debe,
            -- Al corriente exige estar inscrito; el becado sin inscripción va aparte.
            SUM(CASE WHEN J.Status = 0
                      AND INS.IdJugador IS NOT NULL
                      AND (${ES_BECA_TOTAL} OR COALESCE(MEN.PagosCount, 0) >= ?)
                 THEN 1 ELSE 0 END) as AlCorriente,
            SUM(CASE WHEN J.Status = 0 AND ${ES_BECA_TOTAL} AND INS.IdJugador IS NULL
                 THEN 1 ELSE 0 END) as BecadosSinInscripcion,
            -- Posible baja: no pagó la inscripción ni un solo mes ya vencido.
            SUM(CASE WHEN J.Status = 0 AND NOT ${ES_BECA_TOTAL}
                      AND INS.IdJugador IS NULL
                      AND COALESCE(MEN.PagosCount, 0) = 0
                 THEN 1 ELSE 0 END) as PosiblesBajas,
            SUM(CASE WHEN J.Status = 0 AND NOT ${ES_BECA_TOTAL} AND INS.IdJugador IS NULL
                 THEN 1 ELSE 0 END) as DebeInscripcion
            ${conteosPorMes ? ', ' + conteosPorMes : ''}
         FROM tblJugadores J
         LEFT JOIN tblSedes SD ON SD.IdSede = J.IdSede
         LEFT JOIN (
             SELECT P.IdJugador
             FROM tblPagos P
             INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             WHERE P.IdTemporada = ? AND PR.IdTipoProducto = 2 AND P.Status = 0
             GROUP BY P.IdJugador
         ) INS ON INS.IdJugador = J.IdJugador
         LEFT JOIN (
             SELECT P.IdJugador, COUNT(DISTINCT P.Mes) as PagosCount
                    ${flagsPorMes ? ', ' + flagsPorMes : ''}
             FROM tblPagos P
             INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             WHERE PR.IdTipoProducto = 1 AND P.Status = 0
               AND P.Anio IS NOT NULL AND P.Mes BETWEEN 1 AND 12
               AND (P.Anio * 100 + P.Mes) BETWEEN ? AND ?
             GROUP BY P.IdJugador
         ) MEN ON MEN.IdJugador = J.IdJugador
         WHERE ${SIN_CLINICS} ${sedeClause}
         GROUP BY ${groupCol}`,
        params
    ) as any[];

    const out = new Map<string | number, AdeudoCounts>();
    for (const r of rows as any[]) {
        out.set(r.Grupo, {
            debe: Number(r.Debe) || 0,
            alCorriente: Number(r.AlCorriente) || 0,
            becadosSinInscripcion: Number(r.BecadosSinInscripcion) || 0,
            /* Sin meses vencidos la condición "debe todos los meses" se cumpliría
               de forma vacía, así que el corte solo aplica con temporada transcurrida. */
            posiblesBajas: m.mesesExigibles > 0 ? Number(r.PosiblesBajas) || 0 : 0,
            debeInscripcion: Number(r.DebeInscripcion) || 0,
            debeMeses: meses.map((mes) => ({ mes, cantidad: Number(r[`Debe${mes}`]) || 0 })),
        });
    }
    return out;
}

export const SIN_ADEUDOS: AdeudoCounts = {
    debe: 0, alCorriente: 0, becadosSinInscripcion: 0, posiblesBajas: 0,
    debeInscripcion: 0, debeMeses: [],
};
