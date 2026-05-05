import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const seasonId = searchParams.get('seasonId');
        const leagueId = searchParams.get('leagueId');
        const playerId = searchParams.get('playerId');

        if (!seasonId || !leagueId || !playerId) {
            return NextResponse.json(
                { success: false, message: 'Faltan parámetros requeridos' },
                { status: 400 }
            );
        }

        const selectQuery = `
            SELECT P.IdPago, P.Pago, P.FechaPago, P.Observaciones AS Comentario, P.Recibo
            FROM tblPagos P
            INNER JOIN tblProductos PR ON P.IdProducto = PR.IdProducto
            WHERE P.IdJugador = ? 
              AND P.IdTemporada = ? 
              AND PR.IdLiga = ? 
              AND P.Status = 0
            ORDER BY P.FechaPago DESC
        `;

        const [rows] = await pool.query(selectQuery, [playerId, seasonId, leagueId]);

        return NextResponse.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching payment details:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener detalles de pago' },
            { status: 500 }
        );
    }
}
