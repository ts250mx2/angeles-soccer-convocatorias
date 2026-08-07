import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, playerId, categoria, color } = await request.json();

        /* El color es OPCIONAL: hay convocatorias sin color (la lista las pinta como '-')
           y exigirlo hacía fallar quitar/eliminar en todas ellas. Se normaliza a cadena
           vacía y se compara con COALESCE para que empate tanto con '' como con NULL. */
        if (!seasonId || !leagueId || !playerId || !categoria) {
            return NextResponse.json({ success: false, message: 'Faltan parámetros requeridos' }, { status: 400 });
        }
        const colorParam = color ?? '';

        await pool.query(
            `UPDATE tblDetalleConvocatorias SET EsConvocado = 0, EsEliminado = 1
             WHERE IdJugador = ? AND IdTemporada = ? AND IdLiga = ? AND Categoria = ?
               AND COALESCE(Color, '') = ?`,
            [playerId, seasonId, leagueId, categoria, colorParam]
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
