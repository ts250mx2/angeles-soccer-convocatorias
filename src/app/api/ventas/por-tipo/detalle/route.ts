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

// Detalle de ventas de un tipo de producto.
// Mensualidad (IdTipoProducto = 1) => agrupado por mes (P.Mes). Resto => por producto.
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');
        const idSede = searchParams.get('idSede');
        const idTipoProducto = searchParams.get('idTipoProducto');

        if (!idTipoProducto) {
            return NextResponse.json({ success: false, message: 'idTipoProducto requerido' }, { status: 400 });
        }

        const df = buildDateFilter(dateFrom, dateTo);
        const params: any[] = [Number(idTipoProducto), ...df.params];

        let where = `P.Status = 0 AND PR.IdTipoProducto = ? AND ${df.clause}`;
        if (idSede) {
            where += ' AND P.IdSedePago = ?';
            params.push(idSede);
        }

        const esMensualidad = Number(idTipoProducto) === 1;

        const sql = esMensualidad
            ? `SELECT P.Mes AS Mes, COUNT(*) AS Cantidad, COALESCE(SUM(P.Pago), 0) AS Total
               FROM tblPagos P
               INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
               WHERE ${where}
               GROUP BY P.Mes
               ORDER BY P.Mes`
            : `SELECT PR.IdProducto AS IdProducto, PR.Producto AS Producto, COUNT(*) AS Cantidad, COALESCE(SUM(P.Pago), 0) AS Total
               FROM tblPagos P
               INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
               WHERE ${where}
               GROUP BY PR.IdProducto, PR.Producto
               ORDER BY Total DESC`;

        const [rows] = await pool.query(sql, params) as any[];

        const data = (rows as any[]).map((r) => ({
            ...(esMensualidad ? { Mes: Number(r.Mes) } : { IdProducto: r.IdProducto, Producto: r.Producto }),
            Cantidad: Number(r.Cantidad) || 0,
            Total: Number(r.Total) || 0,
        }));

        return NextResponse.json({ success: true, groupBy: esMensualidad ? 'mes' : 'producto', data });
    } catch (error) {
        console.error('Error fetching detalle ventas por tipo:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener el detalle', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
