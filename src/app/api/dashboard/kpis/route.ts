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

        // ─── Breakdown by Sede (tblSedes join) ────────────────────
        const sedeQuery = `
            SELECT
                S.IdSede,
                S.Sede,
                COUNT(DISTINCT P.IdPago)    AS Pagos,
                COUNT(DISTINCT P.IdJugador) AS Jugadores,
                COALESCE(SUM(P.Pago), 0)   AS Total
            FROM tblPagos P
            INNER JOIN tblSedes S ON P.IdSedePago = S.IdSede
            WHERE P.Status = 0
              AND ${dateFilter}
              ${currentSeasonId ? 'AND P.IdTemporada = ?' : ''}
            GROUP BY S.IdSede, S.Sede
            ORDER BY Total DESC
        `;
        const [sr] = await pool.query(sedeQuery, kpiParams) as any[];
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
        });
    } catch (error) {
        console.error('Error fetching dashboard KPIs:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener KPIs', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
