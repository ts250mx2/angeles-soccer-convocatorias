import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, categoria } = await request.json();

        if (!seasonId || !leagueId || !categoria) {
            return NextResponse.json(
                { success: false, message: 'Faltan parámetros requeridos' },
                { status: 400 }
            );
        }

        const updateQuery = `
            UPDATE tblConvocatorias 
            SET Status = 2 
            WHERE IdTemporada = ? AND IdLiga = ? AND Categoria = ?
        `;

        await pool.query(updateQuery, [seasonId, leagueId, categoria]);

        return NextResponse.json({
            success: true,
            message: 'Convocatoria eliminada exitosamente'
        });
    } catch (error) {
        console.error('Error deleting convocatoria:', error);
        return NextResponse.json(
            {
                success: false,
                message: 'Error al eliminar la convocatoria',
                error: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
