import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { loadSeasonAndPrevious } from '@/lib/adeudos-db';
import type { SeasonMonths } from '@/lib/adeudos-season';

/** Recaudación de una temporada agrupada por mes de cobro (Anio*100+Mes de FechaPago). */
async function recaudacionPorMes(seasonId: number): Promise<{ code: number; total: number }[]> {
    const [rows] = await pool.query(
        `SELECT YEAR(P.FechaPago) * 100 + MONTH(P.FechaPago) AS Code,
                COALESCE(SUM(P.Pago), 0) AS Total
         FROM tblPagos P
         WHERE P.Status = 0 AND P.IdTemporada = ? AND P.FechaPago IS NOT NULL
         GROUP BY Code
         ORDER BY Code`,
        [seasonId]
    ) as unknown as [Array<{ Code: number | string; Total: number | string }>, unknown];
    return rows.map((r) => ({ code: Number(r.Code), total: Number(r.Total) || 0 }));
}

/**
 * Recaudado en los primeros `meses` meses calendario de la temporada: es lo que
 * permite comparar dos temporadas "a la misma altura" y no contra su total final.
 */
function recaudadoHastaElMes(
    porMes: { code: number; total: number }[],
    m: SeasonMonths,
    meses: number,
): number {
    if (meses <= 0) return 0;
    const desde = m.anioInicio * 100 + m.startMonth;
    const hasta = m.anioInicio * 100 + Math.min(m.startMonth + meses - 1, m.endMonth);
    return porMes
        .filter((r) => r.code >= desde && r.code <= hasta)
        .reduce((acc, r) => acc + r.total, 0);
}

// FechaPago se guarda en hora LOCAL (sigue el reloj NOW() del servidor), así que NO se
// convierte de zona horaria: se compara directamente contra NOW(). Convertirla duplicaba
// el desfase de 6h y desplazaba pagos a un día distinto al capturado.
function buildDateFilter(period: string, dateFrom: string | null, dateTo: string | null): { clause: string, isCustom: boolean } {
    // Custom range overrides period
    if (dateFrom && dateTo) {
        return {
            clause: `DATE(P.FechaPago) BETWEEN '${dateFrom}' AND '${dateTo}'`,
            isCustom: true
        };
    }

    switch (period) {
        case 'today':
            return { clause: `DATE(P.FechaPago) = DATE(NOW())`, isCustom: false };
        case 'yesterday':
            return { clause: `DATE(P.FechaPago) = DATE(NOW() - INTERVAL 1 DAY)`, isCustom: false };
        case 'week':
            return { clause: `YEARWEEK(P.FechaPago, 1) = YEARWEEK(NOW(), 1)`, isCustom: false };
        case 'month':
        default:
            return {
                clause: `YEAR(P.FechaPago) = YEAR(NOW())
                    AND MONTH(P.FechaPago) = MONTH(NOW())`,
                isCustom: false
            };
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') || 'month';
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');

        const { clause: dateFilter } = buildDateFilter(period, dateFrom, dateTo);

        // Get current active season
        const [seasonRows] = await pool.query(
            'SELECT IdTemporada, Temporada FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1'
        ) as any[];
        const currentSeasonId = seasonRows.length > 0 ? seasonRows[0].IdTemporada : null;
        const kpiParams = currentSeasonId ? [currentSeasonId] : [];

        // ─── Main KPIs ───────────────────────────────────────────
        const kpiQuery = `
            SELECT
                COUNT(DISTINCT P.IdPago)    AS TotalPagos,
                COUNT(DISTINCT P.IdJugador) AS JugadoresUnicos,
                COALESCE(SUM(P.Pago), 0)   AS TotalRecaudado,
                COALESCE(AVG(P.Pago), 0)   AS PromedioPago
            FROM tblPagos P
            WHERE P.Status = 0
              AND ${dateFilter}
              ${currentSeasonId ? 'AND P.IdTemporada = ?' : ''}
        `;
        const [kpiRows] = await pool.query(kpiQuery, kpiParams) as any[];
        const kpi = kpiRows[0] || {};

        // ─── Breakdown by Liga ────────────────────────────────────
        const leagueQuery = `
            SELECT
                L.IdLiga,
                L.Liga,
                COUNT(DISTINCT P.IdPago)    AS Pagos,
                COUNT(DISTINCT P.IdJugador) AS Jugadores,
                COALESCE(SUM(P.Pago), 0)   AS Total
            FROM tblPagos P
            INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
            INNER JOIN tblLigas L      ON PR.IdLiga = L.IdLiga
            WHERE P.Status = 0
              AND ${dateFilter}
              ${currentSeasonId ? 'AND P.IdTemporada = ?' : ''}
            GROUP BY L.IdLiga, L.Liga
            ORDER BY Total DESC
        `;
        const [leagueRows] = await pool.query(leagueQuery, kpiParams) as any[];

        // ─── Breakdown by Sede (Consolidated registered & payment Sede) ──
        const sedeQuery = `
            SELECT
                S.IdSede,
                S.Sede,
                COALESCE(SP.Pagos, 0) AS Pagos,
                COALESCE(SP.Jugadores, 0) AS Jugadores,
                COALESCE(SP.Total, 0) AS Total,
                COALESCE(SR.PagosReg, 0) AS PagosReg,
                COALESCE(SR.JugadoresReg, 0) AS JugadoresReg,
                COALESCE(SR.TotalReg, 0) AS TotalReg
            FROM tblSedes S
            LEFT JOIN (
                SELECT 
                    IdSedePago,
                    COUNT(DISTINCT IdPago) AS Pagos,
                    COUNT(DISTINCT IdJugador) AS Jugadores,
                    SUM(Pago) AS Total
                FROM tblPagos P
                WHERE P.Status = 0
                  AND ${dateFilter}
                  ${currentSeasonId ? 'AND P.IdTemporada = ?' : ''}
                GROUP BY IdSedePago
            ) SP ON S.IdSede = SP.IdSedePago
            LEFT JOIN (
                SELECT 
                    J.IdSede,
                    COUNT(DISTINCT P.IdPago) AS PagosReg,
                    COUNT(DISTINCT P.IdJugador) AS JugadoresReg,
                    SUM(P.Pago) AS TotalReg
                FROM tblPagos P
                INNER JOIN tblJugadores J ON P.IdJugador = J.IdJugador
                WHERE P.Status = 0
                  AND ${dateFilter}
                  ${currentSeasonId ? 'AND P.IdTemporada = ?' : ''}
                GROUP BY J.IdSede
            ) SR ON S.IdSede = SR.IdSede
            WHERE SP.Total > 0 OR SR.TotalReg > 0
            ORDER BY Total DESC, TotalReg DESC
        `;
        const sedeParams = currentSeasonId ? [currentSeasonId, currentSeasonId] : [];
        const [sr] = await pool.query(sedeQuery, sedeParams) as any[];
        const sedeRows = sr as any[];

        // ─── Breakdown by Category ────────────────────────────────
        const categoryQuery = `
            SELECT
                DC.Categoria,
                COUNT(DISTINCT P.IdPago)    AS Pagos,
                COALESCE(SUM(P.Pago), 0)   AS Total
            FROM tblPagos P
            INNER JOIN tblDetalleConvocatorias DC ON P.IdJugador = DC.IdJugador
                AND P.IdTemporada = DC.IdTemporada
            WHERE P.Status = 0
              AND DC.EsConvocado = 1
              AND ${dateFilter}
              ${currentSeasonId ? 'AND P.IdTemporada = ?' : ''}
            GROUP BY DC.Categoria
            ORDER BY Total DESC
            LIMIT 8
        `;
        const [categoryRows] = await pool.query(categoryQuery, kpiParams) as any[];

        // ─── 30-day Timeline ──────────────────────────────────────
        /* Fecha como CADENA 'YYYY-MM-DD': con DATE() mysql2 devuelve un objeto Date que
           al serializarse a JSON queda como '2026-08-05T06:00:00.000Z', y el cliente lo
           concatenaba con 'T12:00:00' produciendo "Invalid Date". DATE_FORMAT además
           evita cualquier conversión de zona horaria, igual que el resto del archivo. */
        const timelineQuery = `
            SELECT
                DATE_FORMAT(P.FechaPago, '%Y-%m-%d') AS Fecha,
                COUNT(DISTINCT P.IdPago)  AS Pagos,
                COALESCE(SUM(P.Pago), 0) AS Total
            FROM tblPagos P
            WHERE P.Status = 0
              AND P.FechaPago >= NOW() - INTERVAL 30 DAY
              ${currentSeasonId ? 'AND P.IdTemporada = ?' : ''}
            GROUP BY DATE(P.FechaPago)
            ORDER BY Fecha ASC
        `;
        const [timelineRows] = await pool.query(timelineQuery, kpiParams) as any[];

        // ─── Season totals ────────────────────────────────────────
        let seasonSummary = { TotalPagosTemporada: 0, JugadoresTemporada: 0, TotalTemporada: 0 };
        if (currentSeasonId) {
            const [sRows] = await pool.query(
                `SELECT COUNT(DISTINCT P.IdPago) AS TotalPagosTemporada,
                        COUNT(DISTINCT P.IdJugador) AS JugadoresTemporada,
                        COALESCE(SUM(P.Pago), 0) AS TotalTemporada
                 FROM tblPagos P WHERE P.Status = 0 AND P.IdTemporada = ?`,
                [currentSeasonId]
            ) as any[];
            if ((sRows as any[]).length > 0) seasonSummary = (sRows as any[])[0];
        }

        /* ─── Avance de la temporada: recaudación mes a mes y comparativo con la
           temporada anterior a la misma altura (mismos meses transcurridos). ─── */
        let seasonProgress: {
            mesesTranscurridos: number;
            mesesTotales: number;
            porMes: { code: number; total: number }[];
            comparativo: {
                temporadaAnterior: string;
                mesesComparados: number;
                actual: number;
                anterior: number;
                variacionPct: number | null;
            } | null;
        } | null = null;

        const seasons = await loadSeasonAndPrevious(null);
        if (seasons) {
            const { actual, anterior } = seasons;
            const porMes = await recaudacionPorMes(actual.seasonId);
            // Meses ya corridos de la temporada, sin pasarse de su duración.
            const transcurridos = Math.min(actual.mesesExigibles, actual.numMonthsExpected);

            let comparativo = null;
            if (anterior && transcurridos > 0) {
                // Si la anterior fue más corta, se compara hasta donde alcanza.
                const mesesComparados = Math.min(transcurridos, anterior.numMonthsExpected);
                const porMesAnterior = await recaudacionPorMes(anterior.seasonId);
                const totalAnterior = recaudadoHastaElMes(porMesAnterior, anterior, mesesComparados);
                const totalActual = recaudadoHastaElMes(porMes, actual, mesesComparados);
                comparativo = {
                    temporadaAnterior: anterior.temporadaNombre,
                    mesesComparados,
                    actual: totalActual,
                    anterior: totalAnterior,
                    // Sin base con qué comparar el porcentaje no significa nada.
                    variacionPct: totalAnterior > 0
                        ? ((totalActual - totalAnterior) / totalAnterior) * 100
                        : null,
                };
            }

            seasonProgress = {
                mesesTranscurridos: transcurridos,
                mesesTotales: actual.numMonthsExpected,
                porMes,
                comparativo,
            };
        }

        // ─── Sede de Pago vs. Player Registered Sede Breakdown ────
        const breakdownQuery = `
            SELECT
                P.IdSedePago AS IdSedePago,
                CASE WHEN J.Jugador LIKE '%Ventas%' THEN 99999 ELSE J.IdSede END AS IdSedeJugador,
                CASE WHEN J.Jugador LIKE '%Ventas%' THEN 'VENTAS' ELSE SJ.Sede END AS SedeJugador,
                COUNT(DISTINCT P.IdJugador) AS Jugadores,
                COUNT(P.IdPago) AS Pagos,
                COALESCE(SUM(P.Pago), 0) AS Total
            FROM tblPagos P
            INNER JOIN tblJugadores J ON P.IdJugador = J.IdJugador
            INNER JOIN tblSedes SJ ON J.IdSede = SJ.IdSede
            WHERE P.Status = 0
              AND ${dateFilter}
              ${currentSeasonId ? 'AND P.IdTemporada = ?' : ''}
            GROUP BY P.IdSedePago, 
                     CASE WHEN J.Jugador LIKE '%Ventas%' THEN 99999 ELSE J.IdSede END,
                     CASE WHEN J.Jugador LIKE '%Ventas%' THEN 'Ventas' ELSE SJ.Sede END
        `;
        const [brRows] = await pool.query(breakdownQuery, kpiParams) as any[];

        // ─── Product TYPE breakdown per Sede de Pago (cards nivel 1) ────
        const productBySedeQuery = `
            SELECT
                P.IdSedePago,
                TP.IdTipoProducto,
                TP.TipoProducto,
                COUNT(DISTINCT P.IdPago)    AS Pagos,
                COUNT(DISTINCT P.IdJugador) AS Jugadores,
                COALESCE(SUM(P.Pago), 0)   AS Total
            FROM tblPagos P
            INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
            INNER JOIN tblTiposProductos TP ON PR.IdTipoProducto = TP.IdTipoProducto
            WHERE P.Status = 0
              AND ${dateFilter}
              ${currentSeasonId ? 'AND P.IdTemporada = ?' : ''}
            GROUP BY P.IdSedePago, TP.IdTipoProducto, TP.TipoProducto
            ORDER BY P.IdSedePago, Total DESC
        `;
        const [productBySedeRows] = await pool.query(productBySedeQuery, kpiParams) as any[];

        // ─── Product detail breakdown per Sede+TipoProducto (drill-down nivel 2) ──
        const productDetailBySedeQuery = `
            SELECT
                P.IdSedePago,
                PR.IdTipoProducto,
                PR.IdProducto,
                PR.Producto,
                COUNT(DISTINCT P.IdPago)    AS Pagos,
                COUNT(DISTINCT P.IdJugador) AS Jugadores,
                COALESCE(SUM(P.Pago), 0)   AS Total
            FROM tblPagos P
            INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
            WHERE P.Status = 0
              AND ${dateFilter}
              ${currentSeasonId ? 'AND P.IdTemporada = ?' : ''}
            GROUP BY P.IdSedePago, PR.IdTipoProducto, PR.IdProducto, PR.Producto
            ORDER BY P.IdSedePago, PR.IdTipoProducto, Total DESC
        `;
        const [productDetailBySedeRows] = await pool.query(productDetailBySedeQuery, kpiParams) as any[];

        return NextResponse.json({
            success: true,
            period,
            dateFrom: dateFrom || null,
            dateTo: dateTo || null,
            season: seasonRows[0] || null,
            kpi: {
                totalRecaudado: parseFloat(kpi.TotalRecaudado) || 0,
                totalPagos: parseInt(kpi.TotalPagos) || 0,
                jugadoresUnicos: parseInt(kpi.JugadoresUnicos) || 0,
                promedioPago: parseFloat(kpi.PromedioPago) || 0,
            },
            byLeague: leagueRows,
            bySede: sedeRows,
            byCategory: categoryRows,
            timeline: timelineRows,
            seasonSummary,
            seasonProgress,
            breakdown: brRows,
            productBySede: productBySedeRows,
            productDetailBySede: productDetailBySedeRows,
        });
    } catch (error) {
        console.error('Error fetching dashboard KPIs:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener KPIs', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
