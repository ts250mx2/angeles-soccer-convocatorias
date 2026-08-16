import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { estadoEnTemporada, motivoNoConvocable } from '@/lib/convocatoria-elegibilidad';

export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, playerId, categoria, color } = await request.json();

        if (!seasonId || !leagueId || !playerId || !categoria) {
            return NextResponse.json({ success: false, message: 'Missing required parameters' }, { status: 400 });
        }

        /* La reja de verdad: el botón deshabilitado en pantalla es comodidad, pero el
           que decide si un jugador puede entrar a la convocatoria es el servidor. */
        const estados = await estadoEnTemporada(Number(seasonId), [Number(playerId)]);
        const motivo = motivoNoConvocable(estados.get(Number(playerId)));
        if (motivo) {
            return NextResponse.json({ success: false, message: motivo }, { status: 409 });
        }

        // Get price from tblProductos
        const [priceRows] = await pool.query(
            'SELECT Precio FROM tblProductos WHERE IdLiga = ?',
            [leagueId]
        );

        if (!Array.isArray(priceRows) || priceRows.length === 0) {
            return NextResponse.json(
                { success: false, message: 'No se encontró precio para esta liga' },
                { status: 404 }
            );
        }

        const price = (priceRows[0] as any).Precio;

        await pool.query(
            'UPDATE tblDetalleConvocatorias SET Precio = ?, EsConvocado = 1, EsEliminado = 0 WHERE IdJugador = ? AND IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND Color = ?',
            [price, playerId, seasonId, leagueId, categoria, color]
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating convocatorias:', error);
        return NextResponse.json(
            { success: false, message: 'Error updating convocatorias' },
            { status: 500 }
        );
    }
}
