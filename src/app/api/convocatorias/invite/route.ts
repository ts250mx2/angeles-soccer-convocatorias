import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, playerId, categoria } = await request.json();

        if (!seasonId || !leagueId || !playerId || !categoria) {
            return NextResponse.json(
                { success: false, message: 'Faltan parámetros requeridos' },
                { status: 400 }
            );
        }

        const insertQuery = `
            INSERT INTO tblDetalleConvocatorias(IdJugador, IdTemporada, IdLiga, Precio, EsConvocado, EsEliminado, Categoria) 
            SELECT IdJugador, ?, ?, 0, 0, 0, ?
            FROM tblJugadores 
            WHERE IdJugador = ?
        `;

        await pool.query(insertQuery, [seasonId, leagueId, categoria, playerId]);

        return NextResponse.json({
            success: true,
            message: 'Jugador invitado exitosamente'
        });
    } catch (error) {
        console.error('Error inviting player:', error);
        return NextResponse.json(
            {
                success: false,
                message: 'Error al invitar jugador',
                error: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
