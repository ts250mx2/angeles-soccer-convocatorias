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

// Ventas individuales (por jugador) de un tipo de producto, opcionalmente acotadas a un mes o a un producto.
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');
        const idSede = searchParams.get('idSede');
        const idTipoProducto = searchParams.get('idTipoProducto');
        const mes = searchParams.get('mes');
        const idProducto = searchParams.get('idProducto');

        // idTipoProducto es opcional: sin él se devuelven todas las ventas del
        // período/sede (el detalle del "Total" del grid).
        const df = buildDateFilter(dateFrom, dateTo);
        const params: any[] = [];
        let where = `P.Status = 0`;

        if (idTipoProducto) { where += ' AND PR.IdTipoProducto = ?'; params.push(Number(idTipoProducto)); }

        where += ` AND ${df.clause}`;
        params.push(...df.params);

        if (idSede) { where += ' AND P.IdSedePago = ?'; params.push(idSede); }
        if (mes !== null && mes !== undefined && mes !== '') { where += ' AND P.Mes = ?'; params.push(Number(mes)); }
        if (idProducto) { where += ' AND P.IdProducto = ?'; params.push(Number(idProducto)); }

        const [rows] = await pool.query(
            `SELECT
                P.IdPago,
                -- FechaPago ya está en hora LOCAL (sigue el reloj NOW() del servidor);
                -- NO se convierte de zona horaria. Se devuelve como texto sin offset
                -- (YYYY-MM-DDTHH:mm:ss) para que el navegador la interprete como local.
                DATE_FORMAT(P.FechaPago, '%Y-%m-%dT%H:%i:%s') AS Fecha,
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
        console.error('Error fetching jugadores por tipo:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener el detalle por jugador', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
