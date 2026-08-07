import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, playerId, categoria, color, precio } = await request.json();

        // El color es OPCIONAL: hay convocatorias sin color. Ver /api/convocatorias/remove.
        if (!seasonId || !leagueId || !playerId || !categoria || precio === undefined) {
            return NextResponse.json({ success: false, message: 'Faltan parámetros requeridos' }, { status: 400 });
        }
        const colorParam = color ?? '';

        await pool.query(
            `UPDATE tblDetalleConvocatorias SET Precio = ?
             WHERE IdJugador = ? AND IdTemporada = ? AND IdLiga = ? AND Categoria = ?
               AND COALESCE(Color, '') = ?`,
            [precio, playerId, seasonId, leagueId, categoria, colorParam]
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating price:', error);
        return NextResponse.json(
            { success: false, message: 'Error updating price' },
            { status: 500 }
        );
    }
}
