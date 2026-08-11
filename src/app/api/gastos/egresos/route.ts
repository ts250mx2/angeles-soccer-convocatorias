import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Egresos agrupados por sede para un período.
 *
 * Se agrupa por tblEgresos.IdSede (la sede a la que pertenece el gasto) y NO por
 * IdSedePago: esa última solo se llena cuando el egreso salió por una caja abierta
 * y viene vacía en la gran mayoría de los registros, así que agrupar por ella
 * perdería casi todo el histórico.
 *
 * Igual que el resto de módulos, FechaEgreso se compara directamente contra NOW()
 * sin convertir husos: se guarda en hora local del servidor.
 */

export type PeriodoEgresos = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';

/** Filtro de fechas sobre E.FechaEgreso. Las fechas del rango van parametrizadas. */
export function filtroFechas(
    periodo: string,
    desde: string | null,
    hasta: string | null,
): { clause: string; params: string[] } {
    if (desde && hasta) {
        return { clause: 'DATE(E.FechaEgreso) BETWEEN ? AND ?', params: [desde, hasta] };
    }
    switch (periodo) {
        case 'today':
            return { clause: 'DATE(E.FechaEgreso) = DATE(NOW())', params: [] };
        case 'yesterday':
            return { clause: 'DATE(E.FechaEgreso) = DATE(NOW() - INTERVAL 1 DAY)', params: [] };
        case 'week':
            return { clause: 'YEARWEEK(E.FechaEgreso, 1) = YEARWEEK(NOW(), 1)', params: [] };
        case 'year':
            return { clause: 'YEAR(E.FechaEgreso) = YEAR(NOW())', params: [] };
        case 'month':
        default:
            return {
                clause: 'YEAR(E.FechaEgreso) = YEAR(NOW()) AND MONTH(E.FechaEgreso) = MONTH(NOW())',
                params: [],
            };
    }
}

/** Status 2 son egresos cancelados; solo cuentan los vigentes. */
export const EGRESO_VIGENTE = 'COALESCE(E.Status, 0) = 0';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const periodo = searchParams.get('periodo') || 'month';
        const desde = searchParams.get('desde');
        const hasta = searchParams.get('hasta');

        const { clause, params } = filtroFechas(periodo, desde, hasta);
        const where = `${EGRESO_VIGENTE} AND ${clause}`;

        // ── Totales por sede ──
        const [sedeRows] = await pool.query(
            `SELECT
                E.IdSede,
                COALESCE(S.Sede, CONCAT('Sede ', E.IdSede)) AS Sede,
                COUNT(*)                    AS Movimientos,
                COALESCE(SUM(E.Total), 0)   AS Total,
                COALESCE(SUM(CASE WHEN COALESCE(E.IdFormaPago, 1) = 1 THEN E.Total ELSE 0 END), 0) AS Efectivo,
                COALESCE(SUM(CASE WHEN COALESCE(E.IdFormaPago, 1) <> 1 THEN E.Total ELSE 0 END), 0) AS Otros
             FROM tblEgresos E
             LEFT JOIN tblSedes S ON S.IdSede = E.IdSede
             WHERE ${where}
             GROUP BY E.IdSede, S.Sede
             ORDER BY Total DESC`,
            params,
        ) as unknown as [Array<Record<string, unknown>>, unknown];

        // ── Desglose por forma de pago (todas las sedes) ──
        const [fpRows] = await pool.query(
            `SELECT
                COALESCE(E.IdFormaPago, 1)                          AS IdFormaPago,
                COALESCE(F.FormaPago, E.FormaPago, 'SIN FORMA')     AS FormaPago,
                COUNT(*)                                            AS Movimientos,
                COALESCE(SUM(E.Total), 0)                           AS Total
             FROM tblEgresos E
             LEFT JOIN tblFormasPago F ON F.IdFormaPago = COALESCE(E.IdFormaPago, 1)
             WHERE ${where}
             GROUP BY COALESCE(E.IdFormaPago, 1), COALESCE(F.FormaPago, E.FormaPago, 'SIN FORMA')
             ORDER BY Total DESC`,
            params,
        ) as unknown as [Array<Record<string, unknown>>, unknown];

        const num = (v: unknown) => Number(v) || 0;
        const porSede = sedeRows.map((r) => ({
            IdSede: num(r.IdSede),
            Sede: String(r.Sede ?? '—'),
            Movimientos: num(r.Movimientos),
            Total: num(r.Total),
            Efectivo: num(r.Efectivo),
            Otros: num(r.Otros),
        }));
        const porFormaPago = fpRows.map((r) => ({
            IdFormaPago: num(r.IdFormaPago),
            FormaPago: String(r.FormaPago ?? '—'),
            Movimientos: num(r.Movimientos),
            Total: num(r.Total),
        }));

        return NextResponse.json({
            success: true,
            periodo,
            desde: desde || null,
            hasta: hasta || null,
            porSede,
            porFormaPago,
            total: porSede.reduce((s, r) => s + r.Total, 0),
            movimientos: porSede.reduce((s, r) => s + r.Movimientos, 0),
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Error fetching egresos por sede:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener los egresos' },
            { status: 500 },
        );
    }
}
