import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, playerId, categoria, color, precio } = await request.json();

        if (!seasonId || !leagueId || !playerId || !categoria || color === undefined || precio === undefined) {
            return NextResponse.json({ success: false, message: 'Missing required parameters (including color)' }, { status: 400 });
        }

        await pool.query(
            'UPDATE tblDetalleConvocatorias SET Precio = ? WHERE IdJugador = ? AND IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND Color = ?',
            [precio, playerId, seasonId, leagueId, categoria, color]
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
