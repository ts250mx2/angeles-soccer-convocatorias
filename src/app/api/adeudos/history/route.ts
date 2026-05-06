import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const playerId = searchParams.get('playerId');
        const seasonId = searchParams.get('seasonId');

        if (!playerId || !seasonId) {
            return NextResponse.json({ success: false, message: 'Faltan parámetros' }, { status: 400 });
        }

        const query = `
            SELECT 
                P.IdPago, 
                P.Pago, 
                P.FechaPago, 
                P.Mes, 
                P.Anio,
                PR.Producto,
                PR.IdTipoProducto,
                P.Observaciones,
                P.Recibo
            FROM tblPagos P
            INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
            WHERE P.IdJugador = ? AND P.IdTemporada = ? AND P.Status = 0
            ORDER BY P.FechaPago DESC
        `;

        const [rows] = await pool.query(query, [playerId, seasonId]);

        return NextResponse.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching player history:', error);
        return NextResponse.json({ success: false, message: 'Error al obtener historial' }, { status: 500 });
    }
}
