import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const idProducto = searchParams.get('idProducto');
        const categoria = searchParams.get('categoria');

        if (!idProducto || !categoria) {
            return NextResponse.json({ success: false, message: 'ID de producto y categoría requeridos' }, { status: 400 });
        }

        // La temporada la manda el filtro de la pantalla; sin ella, la activa.
        const temporadaParam = searchParams.get('temporada');
        const [seasonRows] = await pool.query(
            temporadaParam
                ? 'SELECT IdTemporada FROM tblTemporadas WHERE IdTemporada = ? LIMIT 1'
                : 'SELECT IdTemporada FROM tblTemporadas WHERE EsActiva = 1 LIMIT 1',
            temporadaParam ? [temporadaParam] : []
        ) as unknown as [Array<{ IdTemporada: number }>, unknown];

        if (seasonRows.length === 0) {
            return NextResponse.json({ success: false, message: 'No hay temporada activa' }, { status: 404 });
        }

        const seasonId = seasonRows[0].IdTemporada;

        const query = `
            SELECT 
                P.IdPago,
                P.Pago,
                P.FechaPago,
                P.Recibo,
                J.Jugador,
                J.Categoria
            FROM tblPagos P
            INNER JOIN tblJugadores J ON P.IdJugador = J.IdJugador
            WHERE P.IdProducto = ? 
              AND J.Categoria = ?
              AND P.IdTemporada = ? 
              AND P.Status = 0
            ORDER BY P.FechaPago DESC
        `;

        const [rows] = await pool.query(query, [idProducto, categoria, seasonId]);

        return NextResponse.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error in pagos-copas details:', error);
        return NextResponse.json({ success: false, message: 'Error interno del servidor' }, { status: 500 });
    }
}
