import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Ventas canceladas: pagos de tblPagos con Status <> 0 (0 = venta válida). La tabla
// no guarda motivo ni fecha de cancelación, solo el Status. FechaPago ya está en
// hora LOCAL (sigue el reloj NOW() del servidor); no se convierte de zona horaria.
function buildVentasDateFilter(period: string, dateFrom: string | null, dateTo: string | null): { clause: string; params: string[] } {
    const fecha = `DATE(P.FechaPago)`;
    const now = `NOW()`;
    if (dateFrom && dateTo) {
        return { clause: `${fecha} BETWEEN ? AND ?`, params: [dateFrom, dateTo] };
    }
    switch (period) {
        case 'today':
            return { clause: `${fecha} = DATE(${now})`, params: [] };
        case 'yesterday':
            return { clause: `${fecha} = DATE(${now} - INTERVAL 1 DAY)`, params: [] };
        case 'week':
            return { clause: `YEARWEEK(P.FechaPago, 1) = YEARWEEK(${now}, 1)`, params: [] };
        case 'month':
            return {
                clause: `YEAR(P.FechaPago) = YEAR(${now}) AND MONTH(P.FechaPago) = MONTH(${now})`,
                params: [],
            };
        case 'all':
            return { clause: `1=1`, params: [] };
        default:
            // Default to last 30 days
            return { clause: `P.FechaPago >= DATE_SUB(${now}, INTERVAL 30 DAY)`, params: [] };
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const idSede = searchParams.get('idSede');
        const buyerName = searchParams.get('q') || '';
        const period = searchParams.get('period') || 'default';
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');

        let query = `
            SELECT
                P.IdPago AS IdVenta,
                -- FechaPago ya está en hora LOCAL; no se convierte (se devuelve sin
                -- offset para que el navegador la interprete como local, no UTC).
                DATE_FORMAT(P.FechaPago, '%Y-%m-%dT%H:%i:%s') AS FechaVenta,
                P.IdJugador,
                P.Jugador,
                CASE WHEN P.Mes > 0 THEN CONCAT(PR.Producto, ' · mes ', P.Mes) ELSE PR.Producto END AS ConceptoVenta,
                P.Pago AS Total,
                P.Status,
                P.IdSedePago AS IdSede,
                S.Sede,
                P.FormaPago,
                P.Recibo,
                P.Referencia
            FROM tblPagos P
            INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
            LEFT JOIN tblSedes S ON P.IdSedePago = S.IdSede
            WHERE P.Status <> 0
        `;
        const params: string[] = [];

        if (idSede) {
            query += ' AND P.IdSedePago = ?';
            params.push(idSede);
        }

        if (buyerName.trim()) {
            query += ' AND P.Jugador LIKE ?';
            params.push(`%${buyerName.trim()}%`);
        }

        const dateFilter = buildVentasDateFilter(period, dateFrom, dateTo);
        query += ` AND ${dateFilter.clause}`;
        params.push(...dateFilter.params);

        query += ' ORDER BY P.FechaPago DESC, P.IdPago DESC LIMIT 200';

        const [rows] = await pool.query(query, params);

        // Sedes con cancelaciones en el rango (para las tarjetas de filtro). Aplica
        // los mismos filtros de fecha y búsqueda, pero NO el de sede, para que las
        // tarjetas siempre muestren todas las sedes con cancelaciones.
        let sedeWhere = `P.Status <> 0 AND S.Status = 0 AND ${dateFilter.clause}`;
        const sedeParams: string[] = [...dateFilter.params];
        if (buyerName.trim()) {
            sedeWhere += ' AND P.Jugador LIKE ?';
            sedeParams.push(`%${buyerName.trim()}%`);
        }
        const [sedeRows] = await pool.query(
            `SELECT S.IdSede, S.Sede, COUNT(*) AS Num, COALESCE(SUM(P.Pago), 0) AS Total
             FROM tblPagos P
             INNER JOIN tblSedes S ON P.IdSedePago = S.IdSede
             WHERE ${sedeWhere}
             GROUP BY S.IdSede, S.Sede
             ORDER BY S.Sede ASC`,
            sedeParams
        ) as unknown as [{ IdSede: number; Sede: string; Num: number; Total: number }[]];
        const sedes = sedeRows.map((r) => ({
            IdSede: r.IdSede,
            Sede: r.Sede,
            Num: Number(r.Num) || 0,
            Total: Number(r.Total) || 0,
        }));

        return NextResponse.json({ success: true, data: rows, sedes });
    } catch (error) {
        console.error('Error fetching cancelled sales:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener las ventas canceladas', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
