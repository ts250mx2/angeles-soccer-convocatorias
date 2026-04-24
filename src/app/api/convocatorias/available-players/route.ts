import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const seasonId = searchParams.get('seasonId');
        const leagueId = searchParams.get('leagueId');
        const categoria = searchParams.get('categoria');
        const color = searchParams.get('color');

        if (!seasonId || !leagueId || !categoria || color === null) {
            return NextResponse.json(
                { success: false, message: 'Faltan parámetros requeridos (incluyendo color)' },
                { status: 400 }
            );
        }

        const query = `
            SELECT IdJugador, Jugador, Categoria 
            FROM tblJugadores 
            WHERE Status = 0 
            AND IdJugador NOT IN (
                SELECT IdJugador 
                FROM tblDetalleConvocatorias 
                WHERE IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND Color = ?
            )
            ORDER BY Jugador ASC
        `;

        const [rows] = await pool.query(query, [seasonId, leagueId, categoria, color]);

        return NextResponse.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching available players:', error);
        return NextResponse.json(
            { success: false, message: 'Error al obtener jugadores disponibles' },
            { status: 500 }
        );
    }
}
