import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, categoria, color } = await request.json();

        // El color es OPCIONAL: hay convocatorias sin color. Ver /api/convocatorias/remove.
        if (!seasonId || !leagueId || !categoria) {
            return NextResponse.json(
                { success: false, message: 'Faltan parámetros requeridos' },
                { status: 400 }
            );
        }
        const colorParam = color ?? '';

        // Update convocatoria to closed
        const updateQuery = `
            UPDATE tblConvocatorias
            SET Cerrada = 1
            WHERE IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND COALESCE(Color, '') = ?
        `;

        await pool.query(updateQuery, [seasonId, leagueId, categoria, colorParam]);

        return NextResponse.json({
            success: true,
            message: 'Convocatoria cerrada exitosamente'
        });
    } catch (error) {
        console.error('Error closing convocatoria:', error);
        return NextResponse.json(
            {
                success: false,
                message: 'Error al cerrar la convocatoria',
                error: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
