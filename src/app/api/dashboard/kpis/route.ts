import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

function buildDateFilter(period: string, dateFrom: string | null, dateTo: string | null): { clause: string, isCustom: boolean } {
    // Custom range overrides period
    if (dateFrom && dateTo) {
        return {
            clause: `DATE(CONVERT_TZ(P.FechaPago, '+00:00', '-06:00')) BETWEEN '${dateFrom}' AND '${dateTo}'`,
            isCustom: true
        };
    }

    switch (period) {
        case 'today':
            return { clause: `DATE(CONVERT_TZ(P.FechaPago, '+00:00', '-06:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '-06:00'))`, isCustom: false };
        case 'yesterday':
            return { clause: `DATE(CONVERT_TZ(P.FechaPago, '+00:00', '-06:00')) = DATE(CONVERT_TZ(NOW() - INTERVAL 1 DAY, '+00:00', '-06:00'))`, isCustom: false };
        case 'week':
            return { clause: `YEARWEEK(CONVERT_TZ(P.FechaPago, '+00:00', '-06:00'), 1) = YEARWEEK(CONVERT_TZ(NOW(), '+00:00', '-06:00'), 1)`, isCustom: false };
        case 'month':
        default:
            return {
                clause: `YEAR(CONVERT_TZ(P.FechaPago, '+00:00', '-06:00')) = YEAR(CONVERT_TZ(NOW(), '+00:00', '-06:00'))
                    AND MONTH(CONVERT_TZ(P.FechaPago, '+00:00', '-06:00')) = MONTH(CONVERT_TZ(NOW(), '+00:00', '-06:00'))`,
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
        const timelineQuery = `
            SELECT
                DATE(CONVERT_TZ(P.FechaPago, '+00:00', '-06:00')) AS Fecha,
                COUNT(DISTINCT P.IdPago)  AS Pagos,
                COALESCE(SUM(P.Pago), 0) AS Total
            FROM tblPagos P
            WHERE P.Status = 0
              AND CONVERT_TZ(P.FechaPago, '+00:00', '-06:00') >= CONVERT_TZ(NOW(), '+00:00', '-06:00') - INTERVAL 30 DAY
              ${currentSeasonId ? 'AND P.IdTemporada = ?' : ''}
            GROUP BY DATE(CONVERT_TZ(P.FechaPago, '+00:00', '-06:00'))
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
