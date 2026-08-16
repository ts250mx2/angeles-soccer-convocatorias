import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { estadoEnTemporada, motivoNoConvocable } from '@/lib/convocatoria-elegibilidad';

export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, playerId, categoria, color } = await request.json();

        if (!seasonId || !leagueId || !playerId || !categoria) {
            return NextResponse.json(
                { success: false, message: 'Faltan parámetros requeridos' },
                { status: 400 }
            );
        }

        /* La misma reja que convoke: la opción deshabilitada en el modal es comodidad,
           pero quien decide si un jugador puede ser invitado es el servidor. */
        const estados = await estadoEnTemporada(Number(seasonId), [Number(playerId)]);
        const motivo = motivoNoConvocable(estados.get(Number(playerId)));
        if (motivo) {
            return NextResponse.json({ success: false, message: motivo }, { status: 409 });
        }

        const insertQuery = `
            INSERT INTO tblDetalleConvocatorias(IdJugador, IdTemporada, IdLiga, Precio, EsConvocado, EsEliminado, Categoria, Color) 
            SELECT IdJugador, ?, ?, 0, 0, 0, ?, ?
            FROM tblJugadores 
            WHERE IdJugador = ?
        `;

        await pool.query(insertQuery, [seasonId, leagueId, categoria, color, playerId]);

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
