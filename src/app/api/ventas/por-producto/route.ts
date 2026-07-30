import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Filtro de fechas sobre tblPagos.FechaPago (almacenada en UTC, se convierte a hora local -06:00).
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

// Ventas agrupadas por producto (para el treemap y el grid).
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');
        const idSede = searchParams.get('idSede');

        const df = buildDateFilter(dateFrom, dateTo);
        const params: any[] = [...df.params];

        let where = `P.Status = 0 AND ${df.clause}`;
        if (idSede) {
            where += ' AND P.IdSedePago = ?';
            params.push(idSede);
        }

        const [rows] = await pool.query(
            `SELECT
                PR.IdProducto,
                COALESCE(PR.Producto, 'OTRO') AS Producto,
                PR.IdTipoProducto,
                COALESCE(TP.TipoProducto, 'OTRO') AS TipoProducto,
                COUNT(*) AS Cantidad,
                COALESCE(SUM(P.Pago), 0) AS Total
             FROM tblPagos P
             INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             LEFT JOIN tblTiposProductos TP ON PR.IdTipoProducto = TP.IdTipoProducto
             WHERE ${where}
             GROUP BY PR.IdProducto, PR.Producto, PR.IdTipoProducto, TP.TipoProducto
             ORDER BY Total DESC`,
            params
        ) as any[];

        const data = (rows as any[]).map((r) => ({
            IdProducto: r.IdProducto,
            Producto: r.Producto,
            IdTipoProducto: r.IdTipoProducto,
            TipoProducto: r.TipoProducto,
            Cantidad: Number(r.Cantidad) || 0,
            Total: Number(r.Total) || 0,
        }));

        // Sedes con ventas en el período (independiente del filtro de sede seleccionado)
        const [sedeRows] = await pool.query(
            `SELECT S.IdSede, S.Sede, COALESCE(SUM(P.Pago), 0) AS Total
             FROM tblPagos P
             INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
             INNER JOIN tblSedes S ON P.IdSedePago = S.IdSede
             WHERE P.Status = 0 AND S.Status = 0 AND ${df.clause}
             GROUP BY S.IdSede, S.Sede
             HAVING Total <> 0
             ORDER BY S.Sede ASC`,
            [...df.params]
        ) as any[];
        const sedes = (sedeRows as any[]).map((r) => ({
            IdSede: r.IdSede,
            Sede: r.Sede,
            Total: Number(r.Total) || 0,
        }));

        return NextResponse.json({ success: true, data, sedes });
    } catch (error) {
        console.error('Error fetching ventas por producto:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener ventas por producto', error: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
