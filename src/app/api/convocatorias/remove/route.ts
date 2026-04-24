import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, playerId, categoria, color } = await request.json();

        if (!seasonId || !leagueId || !playerId || !categoria || !color) {
            return NextResponse.json({ success: false, message: 'Missing required parameters (including color)' }, { status: 400 });
        }

        await pool.query(
            'UPDATE tblDetalleConvocatorias SET EsConvocado = 0, EsEliminado = 1 WHERE IdJugador = ? AND IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND Color = ?',
            [playerId, seasonId, leagueId, categoria, color]
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error removing player:', error);
        return NextResponse.json(
            { success: false, message: 'Error removing player' },
            { status: 500 }
        );
    }
}
