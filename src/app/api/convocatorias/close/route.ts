import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, categoria, color } = await request.json();

        if (!seasonId || !leagueId || !categoria || !color) {
            return NextResponse.json(
                { success: false, message: 'Faltan parámetros requeridos (incluyendo color)' },
                { status: 400 }
            );
        }

        // Update convocatoria to closed
        const updateQuery = `
            UPDATE tblConvocatorias 
            SET Cerrada = 1 
            WHERE IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND Color = ?
        `;

        await pool.query(updateQuery, [seasonId, leagueId, categoria, color]);

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
