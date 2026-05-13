import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET() {
    try {
        // 1. Get active season
        const [seasonRows] = await pool.query(
            'SELECT IdTemporada, Temporada FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1'
        ) as any[];

        if (seasonRows.length === 0) {
            return NextResponse.json({ success: false, message: 'No hay temporada activa' }, { status: 404 });
        }

        const seasonId = seasonRows[0].IdTemporada;

        // 2. Get products of type 3 or 4 and their total payments in current season
        const query = `
            SELECT 
                PR.IdProducto,
                PR.Producto,
                PR.IdTipoProducto,
                CASE 
                    WHEN PR.IdTipoProducto = 3 THEN 'Liga'
                    WHEN PR.IdTipoProducto = 4 THEN 'Copa'
                    ELSE COALESCE(TP.TipoProducto, 'Torneo')
                END AS TipoProducto,
                COALESCE(SUM(P.Pago), 0) AS TotalRecaudado,
                COUNT(DISTINCT P.IdPago) AS CantidadPagos,
                COUNT(DISTINCT P.IdJugador) AS CantidadJugadores
            FROM tblProductos PR
            LEFT JOIN tblTiposProductos TP ON PR.IdTipoProducto = TP.IdTipoProducto
            LEFT JOIN tblPagos P ON PR.IdProducto = P.IdProducto AND P.IdTemporada = ? AND P.Status = 0
            WHERE PR.IdTipoProducto IN (3, 4)
            GROUP BY PR.IdProducto, PR.Producto, PR.IdTipoProducto, TP.TipoProducto
            ORDER BY TotalRecaudado DESC, PR.Producto ASC
        `;

        const [rows] = await pool.query(query, [seasonId]);

        return NextResponse.json({
            success: true,
            season: seasonRows[0],
            data: rows
        });
    } catch (error) {
        console.error('Error in pagos-copas summary:', error);
        return NextResponse.json({ success: false, message: 'Error interno del servidor' }, { status: 500 });
    }
}
