import { pool } from '@/lib/db';
import { resolveSeasonMonths, type SeasonMonths, type SeasonRow } from '@/lib/adeudos-season';
import { ES_VENTA_PUBLICO, esKeeperOPortero, esFutsal, esClinicsFutsal } from '@/lib/jugador-filtros';
export { ES_FUTSAL_CATEGORIA } from '@/lib/jugador-filtros';

const SEASON_COLS = 'IdTemporada, Temporada, FechaInicio, FechaFin';

/**
 * Beca total (100%): el jugador no paga nada, así que nunca tiene adeudo aunque no
 * existan registros de mensualidad. Sus conceptos suelen capturarse con importe 0
 * (o ni siquiera capturarse), y contarlos como deuda contradecía el monto, que ya
 * daba $0. tblJugadores.Beca guarda porcentajes limpios ('0','50','100').
 */
export const ES_BECA_TOTAL = `(COALESCE(NULLIF(TRIM(J.Beca), ''), '0') + 0) >= 100`;

/**
 * Las sedes de clinics (tblSedes.EsClinics = 1), las clinics futsal (sede futsal + categoría
 * CLINICS) y los registros de venta al público no manejan inscripción ni mensualidades, así
 * que se excluyen del cálculo de adeudo. El futsal PURO sí cuenta (se maneja como sede
 * normal, solo se separa en los KPIs de totales).
 * Requiere la sede con el alias SD y la tabla de jugadores con el alias J.
 */
const ES_CLINICS_FUTSAL_SD = esClinicsFutsal('SD');
export const SIN_CLINICS =
    `(COALESCE(SD.EsClinics, 0) = 0 AND NOT ${ES_VENTA_PUBLICO} AND NOT ${ES_CLINICS_FUTSAL_SD})`;

/**
 * Jugador "tipo portero": sede keeper (tblSedes.EsKeeper = 1) o categoría de
 * portero/keeper (contiene PORT o KEEP). Estos no re-pagan inscripción cada temporada,
 * así que cualquier inscripción previa cuenta. Requiere el alias de sede SD y la tabla
 * de jugadores J.
 */
export const ES_KEEPER_O_PORTERO = esKeeperOPortero('SD');

/**
 * "Está inscrito" para el cálculo de adeudos.
 *
 * Normal: tiene un pago de inscripción registrado en ESA temporada (INS).
 * Portero (sede keeper o categoría PORTERO): basta con tener CUALQUIER pago de
 * inscripción, de cualquier temporada (KINS).
 *
 * Requiere el alias de sede SD, la tabla J y los LEFT JOIN INS (inscripción de la
 * temporada) y KINS (cualquier inscripción).
 */
export const ESTA_INSCRITO =
    `(INS.IdJugador IS NOT NULL OR (${ES_KEEPER_O_PORTERO} AND KINS.IdJugador IS NOT NULL))`;

/**
 * Resuelve la temporada seleccionada (o la activa) y la INMEDIATA ANTERIOR.
 *
 * "Anterior" se decide por FechaInicio (con IdTemporada como desempate) y no por
 * IdTemporada a secas, para no depender de que los ids vayan en orden cronológico.
 */
export async function loadSeasonAndPrevious(
    temporadaId: string | null
): Promise<{ actual: SeasonMonths; anterior: SeasonMonths | null; siguiente: SeasonMonths | null } | null> {
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

    // La temporada inmediata SIGUIENTE (por FechaInicio) — se usa para la promoción de
    // inscripción: quien pagó la inscripción de la siguiente en el último mes de esta.
    const [next] = await pool.query(
        `SELECT ${SEASON_COLS}
         FROM tblTemporadas
         WHERE (FechaInicio > ?) OR (FechaInicio = ? AND IdTemporada > ?)
         ORDER BY FechaInicio ASC, IdTemporada ASC
         LIMIT 1`,
        [seleccionada.FechaInicio, seleccionada.FechaInicio, seleccionada.IdTemporada]
    ) as any[];

    return {
        actual: resolveSeasonMonths(seleccionada),
        anterior: prev.length ? resolveSeasonMonths(prev[0]) : null,
        siguiente: next.length ? resolveSeasonMonths(next[0]) : null,
    };
}

export interface AdeudoCounts {
    /** Con adeudo, EXCLUYENDO futsal. */
    debe: number;
    /** Al corriente, EXCLUYENDO keepers/porteros y futsal. */
    alCorriente: number;
    /** Keepers/porteros al corriente (inscritos y sin meses vencidos). */
    keepers: number;
    /** Beca 100% sin pago de inscripción. */
    becadosSinInscripcion: number;
    /** Deben absolutamente todo: sin inscripción y sin un solo mes vencido pagado. */
    posiblesBajas: number;
    /** Activos sin pago de inscripción en la temporada. */
    debeInscripcion: number;
    /** Por cada mes ya vencido, cuántos activos no lo han pagado. */
    debeMeses: { mes: number; cantidad: number }[];
    /** Clinics Futsal activos: sede futsal + categoría CLINICS (excluidos de adeudo). */
    clinicsFutsal: number;
    /** Futsal: 0 meses pagados en la temporada. */
    futsalSinPagos: number;
    /** Futsal: 1 mes pagado en la temporada. */
    futsal1Mes: number;
    /** Futsal: 2 meses pagados en la temporada. */
    futsal2Meses: number;
    /** Futsal: 3 o más meses pagados en la temporada. */
    futsal3Mas: number;
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
    sedeId?: number | null,
    siguiente?: SeasonMonths | null,
    excluirPosiblesBajas?: boolean,
): Promise<Map<string | number, AdeudoCounts>> {
    const groupCol = groupBy === 'sede' ? 'J.IdSede' : 'J.Categoria';
    const sedeClause = sedeId ? 'AND J.IdSede = ?' : '';
    const ES_FUTSAL = esFutsal('SD');

    // Meses ya vencidos de la temporada. Si aún no arranca, la lista va vacía y
    // el desglose se reduce a la inscripción.
    const meses: number[] = [];
    for (let mes = m.startMonth; mes <= m.hastaMonth; mes++) meses.push(mes);

    // Código Anio*100+Mes del último mes de la temporada.
    const endCode = m.anioInicio * 100 + m.endMonth;

    /* Promoción de inscripción: el jugador NO tiene inscripción de esta temporada, pero
       pagó la inscripción de la temporada SIGUIENTE durante el último mes de esta
       (PROMO), y su primera mensualidad de la temporada es justo ese último mes. Se
       considera inscrito (promo) y su adeudo arranca en el último mes, que ya pagó. */
    const promoExpr = siguiente
        ? `(NOT ${ESTA_INSCRITO} AND PROMO.IdJugador IS NOT NULL AND COALESCE(MEN.MinMesCode, 0) = ${endCode})`
        : '(1 = 0)';
    const esInscritoExpr = `(${ESTA_INSCRITO} OR ${promoExpr})`;
    const promoJoin = siguiente
        ? `LEFT JOIN (
             SELECT DISTINCT P.IdJugador
             FROM tblPagos P
             INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             WHERE PR.IdTipoProducto = 2 AND P.Status = 0
               AND P.IdTemporada = ${siguiente.seasonId}
               AND (YEAR(P.FechaPago) * 100 + MONTH(P.FechaPago)) = ${endCode}
           ) PROMO ON PROMO.IdJugador = J.IdJugador`
        : '';

    /* Mes de inicio del adeudo POR JUGADOR: el mes en que pagó su inscripción
       (MONTH de la FechaPago del pago de inscripción), acotado al rango de la
       temporada. Sin inscripción se toma el inicio de la temporada. En la promo se
       arranca en el último mes. Así un jugador que se inscribió a mitad de temporada
       no arrastra los meses previos. INS.IniCode ya viene acotado; %100 recupera el mes. */
    const mesIniExpr = `CASE WHEN ${promoExpr} THEN ${m.endMonth} ELSE COALESCE(INS.IniCode % 100, ${m.startMonth}) END`;

    /* Columnas por mes generadas a partir de enteros derivados del servidor
       (nunca de la petición), así que no hay riesgo de inyección. */
    const flagsPorMes = meses
        .map((mes) => `MAX(CASE WHEN (P.Anio * 100 + P.Mes) = ${m.anioInicio * 100 + mes} THEN 1 ELSE 0 END) as M${mes}`)
        .join(', ');

    // Meses vencidos no pagados por jugador, contados desde su mes de inscripción.
    const faltantesExpr = meses.length
        ? meses
              .map((mes) => `(CASE WHEN ${mes} >= ${mesIniExpr} AND COALESCE(MEN.M${mes}, 0) = 0 THEN 1 ELSE 0 END)`)
              .join(' + ')
        : '0';

    /* Descartar posibles bajas: se quitan del "Con adeudo" y su desglose (inscripción /
       meses), PERO NO del conteo de posibles bajas (ese sigue mostrándose para saber
       cuántos se descartaron). El posible baja: sin inscripción y sin un solo mes pagado. */
    const posibleBajaExpr =
        `(NOT ${ES_BECA_TOTAL} AND NOT ${ES_FUTSAL} AND NOT ${esInscritoExpr} AND COALESCE(MEN.PagosCount, 0) = 0)`;
    const excluirPBClause = (excluirPosiblesBajas && m.mesesExigibles > 0)
        ? `AND NOT ${posibleBajaExpr}`
        : '';

    // El desglose por mes es del "Con adeudo" normal, que excluye futsal (va aparte).
    const conteosPorMes = meses
        .map((mes) => `SUM(CASE WHEN J.Status = 0 AND NOT ${ES_BECA_TOTAL}
                                 AND NOT ${ES_FUTSAL}
                                 AND ${mes} >= ${mesIniExpr}
                                 AND COALESCE(MEN.M${mes}, 0) = 0
                                 ${excluirPBClause}
                            THEN 1 ELSE 0 END) as Debe${mes}`)
        .join(', ');

    const params: any[] = [
        m.seasonId,         // inscripción (sí va por temporada: no tiene mes)
        m.desdeCodigo,      // mensualidades: rango mes-año exigible
        m.hastaCodigo,
    ];
    if (sedeId) params.push(sedeId);

    const [rows] = await pool.query(
        `SELECT
            ${groupCol} as Grupo,
            -- Con adeudo, EXCLUYENDO futsal (que no maneja adeudo).
            SUM(CASE WHEN J.Status = 0
                      AND NOT ${ES_BECA_TOTAL}
                      AND NOT ${ES_FUTSAL}
                      AND (NOT ${esInscritoExpr} OR (${faltantesExpr}) > 0)
                      ${excluirPBClause}
                 THEN 1 ELSE 0 END) as Debe,
            -- Al corriente exige estar inscrito; futsal y porteros van por separado.
            SUM(CASE WHEN J.Status = 0
                      AND ${esInscritoExpr}
                      AND NOT ${ES_KEEPER_O_PORTERO}
                      AND NOT ${ES_FUTSAL}
                      AND (${ES_BECA_TOTAL} OR (${faltantesExpr}) = 0)
                 THEN 1 ELSE 0 END) as AlCorriente,
            -- Keepers/porteros al corriente.
            SUM(CASE WHEN J.Status = 0
                      AND ${esInscritoExpr}
                      AND ${ES_KEEPER_O_PORTERO}
                      AND (${ES_BECA_TOTAL} OR (${faltantesExpr}) = 0)
                 THEN 1 ELSE 0 END) as Keepers,
            -- Futsal clasificado por cantidad de meses pagados en la temporada:
            SUM(CASE WHEN J.Status = 0 AND ${ES_FUTSAL} AND NOT ${ES_KEEPER_O_PORTERO} AND COALESCE(MEN.PagosCount, 0) = 0 THEN 1 ELSE 0 END) as FutsalSinPagos,
            SUM(CASE WHEN J.Status = 0 AND ${ES_FUTSAL} AND NOT ${ES_KEEPER_O_PORTERO} AND COALESCE(MEN.PagosCount, 0) = 1 THEN 1 ELSE 0 END) as Futsal1Mes,
            SUM(CASE WHEN J.Status = 0 AND ${ES_FUTSAL} AND NOT ${ES_KEEPER_O_PORTERO} AND COALESCE(MEN.PagosCount, 0) = 2 THEN 1 ELSE 0 END) as Futsal2Meses,
            SUM(CASE WHEN J.Status = 0 AND ${ES_FUTSAL} AND NOT ${ES_KEEPER_O_PORTERO} AND COALESCE(MEN.PagosCount, 0) >= 3 THEN 1 ELSE 0 END) as Futsal3Mas,
            SUM(CASE WHEN J.Status = 0 AND ${ES_BECA_TOTAL} AND NOT ${esInscritoExpr}
                 THEN 1 ELSE 0 END) as BecadosSinInscripcion,
            -- Posible baja: no pagó la inscripción ni un solo mes ya vencido (sin futsal).
            SUM(CASE WHEN J.Status = 0 AND NOT ${ES_BECA_TOTAL}
                      AND NOT ${ES_FUTSAL}
                      AND NOT ${esInscritoExpr}
                      AND COALESCE(MEN.PagosCount, 0) = 0
                 THEN 1 ELSE 0 END) as PosiblesBajas,
            -- Deben inscripción del "Con adeudo" normal (sin futsal).
            SUM(CASE WHEN J.Status = 0 AND NOT ${ES_BECA_TOTAL}
                      AND NOT ${ES_FUTSAL} AND NOT ${esInscritoExpr}
                      ${excluirPBClause}
                 THEN 1 ELSE 0 END) as DebeInscripcion
            ${conteosPorMes ? ', ' + conteosPorMes : ''}
         FROM tblJugadores J
         LEFT JOIN tblSedes SD ON SD.IdSede = J.IdSede
         LEFT JOIN (
             SELECT P.IdJugador,
                    -- Mes-año en que se pagó la inscripción, acotado al rango de la temporada.
                    GREATEST(${m.desdeCodigo},
                             LEAST(${m.anioInicio * 100 + m.endMonth},
                                   MIN(YEAR(P.FechaPago) * 100 + MONTH(P.FechaPago)))) as IniCode
             FROM tblPagos P
             INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             WHERE P.IdTemporada = ? AND PR.IdTipoProducto = 2 AND P.Status = 0
             GROUP BY P.IdJugador
         ) INS ON INS.IdJugador = J.IdJugador
         LEFT JOIN (
             -- Cualquier inscripción, de cualquier temporada (para la regla keeper).
             SELECT DISTINCT P.IdJugador
             FROM tblPagos P
             INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             WHERE PR.IdTipoProducto = 2 AND P.Status = 0
         ) KINS ON KINS.IdJugador = J.IdJugador
         LEFT JOIN (
             SELECT P.IdJugador, COUNT(DISTINCT P.Mes) as PagosCount,
                    MIN(P.Anio * 100 + P.Mes) as MinMesCode
                    ${flagsPorMes ? ', ' + flagsPorMes : ''}
             FROM tblPagos P
             INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             WHERE PR.IdTipoProducto = 1 AND P.Status = 0
               AND P.Anio IS NOT NULL AND P.Mes BETWEEN 1 AND 12
               AND (P.Anio * 100 + P.Mes) BETWEEN ? AND ?
             GROUP BY P.IdJugador
         ) MEN ON MEN.IdJugador = J.IdJugador
         ${promoJoin}
         WHERE ${SIN_CLINICS} ${sedeClause}
         GROUP BY ${groupCol}`,
        params
    ) as any[];

    const out = new Map<string | number, AdeudoCounts>();
    for (const r of rows as any[]) {
        out.set(r.Grupo, {
            debe: Number(r.Debe) || 0,
            alCorriente: Number(r.AlCorriente) || 0,
            keepers: Number(r.Keepers) || 0,
            becadosSinInscripcion: Number(r.BecadosSinInscripcion) || 0,
            /* Sin meses vencidos la condición "debe todos los meses" se cumpliría
               de forma vacía, así que el corte solo aplica con temporada transcurrida. */
            posiblesBajas: m.mesesExigibles > 0 ? Number(r.PosiblesBajas) || 0 : 0,
            debeInscripcion: Number(r.DebeInscripcion) || 0,
            debeMeses: meses.map((mes) => ({ mes, cantidad: Number(r[`Debe${mes}`]) || 0 })),
            clinicsFutsal: 0,
            futsalSinPagos: Number(r.FutsalSinPagos) || 0,
            futsal1Mes: Number(r.Futsal1Mes) || 0,
            futsal2Meses: Number(r.Futsal2Meses) || 0,
            futsal3Mas: Number(r.Futsal3Mas) || 0,
        });
    }
    return out;
}

export const SIN_ADEUDOS: AdeudoCounts = {
    debe: 0, alCorriente: 0, keepers: 0, becadosSinInscripcion: 0,
    posiblesBajas: 0, debeInscripcion: 0, debeMeses: [], clinicsFutsal: 0,
    futsalSinPagos: 0, futsal1Mes: 0, futsal2Meses: 0, futsal3Mas: 0,
};
