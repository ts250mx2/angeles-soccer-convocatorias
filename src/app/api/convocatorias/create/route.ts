import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, categoria, fechaInicio, fechaFin, color } = await request.json();

        if (!seasonId || !leagueId || !categoria || !fechaInicio || !fechaFin) {
            return NextResponse.json(
                { success: false, message: 'Faltan parámetros requeridos' },
                { status: 400 }
            );
        }

        // Insert new convocatoria
        const insertQuery = `
            INSERT INTO tblConvocatorias (IdTemporada, IdLiga, Categoria, FechaInicio, FechaFin, Color, Cerrada, Status, FechaAlta)
            VALUES (?, ?, ?, ?, ?, ?, 0, 0, NOW())
        `;

        await pool.query(insertQuery, [seasonId, leagueId, categoria, fechaInicio, fechaFin, color]);

        // Insert players into tblDetalleConvocatorias
        const insertPlayersQuery = `
            INSERT INTO tblDetalleConvocatorias(IdJugador, IdTemporada, IdLiga, Precio, EsConvocado, EsEliminado, Categoria, Color) 
            SELECT DISTINCT IdJugador, ?, ?, 0, 0, 0, ?, ?
            FROM tblJugadores
            WHERE Categoria = ?
            AND IdJugador NOT IN (
                SELECT IdJugador 
                FROM tblDetalleConvocatorias 
                WHERE IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND Color = ?
            )
        `;

        await pool.query(insertPlayersQuery, [
            seasonId,
            leagueId,
            categoria,
            color,
            categoria,
            seasonId,
            leagueId,
            categoria,
            color
        ]);

        return NextResponse.json({
            success: true,
            message: 'Convocatoria creada exitosamente'
        });
    } catch (error) {
        console.error('Error creating convocatoria:', error);
        return NextResponse.json(
            {
                success: false,
                message: 'Error al crear la convocatoria',
                error: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
