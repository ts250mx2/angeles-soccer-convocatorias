import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, playerId, categoria, precio } = await request.json();

        if (!seasonId || !leagueId || !playerId || !categoria || precio === undefined) {
            return NextResponse.json({ success: false, message: 'Missing required parameters' }, { status: 400 });
        }

        await pool.query(
            'UPDATE tblDetalleConvocatorias SET Precio = ? WHERE IdJugador = ? AND IdTemporada = ? AND IdLiga = ? AND Categoria = ?',
            [precio, playerId, seasonId, leagueId, categoria]
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
