import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

function buildDateFilter(dateFrom: string | null, dateTo: string | null): { clause: string; params: any[] } {
    // FechaPago ya está en hora LOCAL (sigue el reloj NOW() del servidor); no se
    // convierte de zona horaria. Se compara contra NOW() (mismo reloj).
    const col = `DATE(P.FechaPago)`;
    if (dateFrom && dateTo) {
        return { clause: `${col} BETWEEN ? AND ?`, params: [dateFrom, dateTo] };
    }
    return {
        clause: `YEAR(P.FechaPago) = YEAR(NOW()) AND MONTH(P.FechaPago) = MONTH(NOW())`,
        params: [],
    };
}

// Detalle de ventas de un producto, agrupado por mes (P.Mes).
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');
        const idSede = searchParams.get('idSede');
        const idProducto = searchParams.get('idProducto');

        if (!idProducto) {
            return NextResponse.json({ success: false, message: 'idProducto requerido' }, { status: 400 });
        }

        const df = buildDateFilter(dateFrom, dateTo);
        const params: any[] = [Number(idProducto), ...df.params];

        let where = `P.Status = 0 AND P.IdProducto = ? AND ${df.clause}`;
        if (idSede) {
            where += ' AND P.IdSedePago = ?';
            params.push(idSede);
        }

        const [rows] = await pool.query(
            `SELECT P.Mes AS Mes, COUNT(*) AS Cantidad, COALESCE(SUM(P.Pago), 0) AS Total
             FROM tblPagos P
             WHERE ${where}
             GROUP BY P.Mes
             ORDER BY P.Mes`,
            params
        ) as any[];

        const data = (rows as any[]).map((r) => ({
            Mes: Number(r.Mes) || 0,
            Cantidad: Number(r.Cantidad) || 0,
            Total: Number(r.Total) || 0,
        }));

        return NextResponse.json({ success: true, groupBy: 'mes', data });
    } catch (error) {
        console.error('Error fetching detalle ventas por producto:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener el detalle', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
