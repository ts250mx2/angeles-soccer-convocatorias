import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, playerId, categoria } = await request.json();

        if (!seasonId || !leagueId || !playerId || !categoria) {
            return NextResponse.json({ success: false, message: 'Missing required parameters' }, { status: 400 });
        }

        await pool.query(
            'UPDATE tblDetalleConvocatorias SET EsConvocado = 0, EsEliminado = 1 WHERE IdJugador = ? AND IdTemporada = ? AND IdLiga = ? AND Categoria = ?',
            [playerId, seasonId, leagueId, categoria]
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
