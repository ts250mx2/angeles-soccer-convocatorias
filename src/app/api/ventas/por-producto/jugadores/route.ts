import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

function buildDateFilter(dateFrom: string | null, dateTo: string | null): { clause: string; params: any[] } {
    const col = `DATE(CONVERT_TZ(P.FechaPago, '+00:00', '-06:00'))`;
    if (dateFrom && dateTo) {
        return { clause: `${col} BETWEEN ? AND ?`, params: [dateFrom, dateTo] };
    }
    const localNow = `CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-06:00')`;
    return {
        clause: `YEAR(CONVERT_TZ(P.FechaPago, '+00:00', '-06:00')) = YEAR(${localNow})
                 AND MONTH(CONVERT_TZ(P.FechaPago, '+00:00', '-06:00')) = MONTH(${localNow})`,
        params: [],
    };
}

// Ventas individuales (por jugador) de un producto, opcionalmente acotadas a un mes.
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');
        const idSede = searchParams.get('idSede');
        const idProducto = searchParams.get('idProducto');
        const idProductos = searchParams.get('idProductos'); // lista separada por comas (para "Total" con búsqueda)
        const mes = searchParams.get('mes');

        // Todos los filtros de producto son opcionales: sin ellos se devuelven todas
        // las ventas del período/sede (el detalle del "Total" del grid).
        const df = buildDateFilter(dateFrom, dateTo);
        const params: any[] = [];
        let where = `P.Status = 0`;

        if (idProducto) {
            where += ' AND P.IdProducto = ?';
            params.push(Number(idProducto));
        } else if (idProductos) {
            const ids = idProductos.split(',').map((x) => Number(x)).filter((n) => Number.isFinite(n));
            if (ids.length) {
                where += ` AND P.IdProducto IN (${ids.map(() => '?').join(',')})`;
                params.push(...ids);
            }
        }

        where += ` AND ${df.clause}`;
        params.push(...df.params);

        if (idSede) { where += ' AND P.IdSedePago = ?'; params.push(idSede); }
        if (mes !== null && mes !== undefined && mes !== '') { where += ' AND P.Mes = ?'; params.push(Number(mes)); }

        const [rows] = await pool.query(
            `SELECT
                P.IdPago,
                CONVERT_TZ(P.FechaPago, '+00:00', '-06:00') AS Fecha,
                P.Jugador,
                PR.Producto,
                P.Mes,
                P.FormaPago,
                P.Recibo,
                S.Sede,
                P.Pago
             FROM tblPagos P
             INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             LEFT JOIN tblSedes S ON P.IdSedePago = S.IdSede
             WHERE ${where}
             ORDER BY P.FechaPago DESC
             LIMIT 1000`,
            params
        ) as any[];

        const data = (rows as any[]).map((r) => ({
            IdPago: r.IdPago,
            Fecha: r.Fecha,
            Jugador: r.Jugador,
            Producto: r.Producto,
            Mes: r.Mes,
            FormaPago: r.FormaPago,
            Recibo: r.Recibo,
            Sede: r.Sede,
            Pago: Number(r.Pago) || 0,
        }));

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching jugadores por producto:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener el detalle por jugador', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
