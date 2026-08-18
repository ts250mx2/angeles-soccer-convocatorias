import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { normalizarEliminatoria, normalizarJornadas } from '@/lib/convocatoria-opciones';
import { mueveColorDePreciosManuales } from '@/lib/convocatorias-precios';

export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, oldCategoria, oldColor, newColor, fechaInicio, fechaFin, idProfesor, costoLiga, costoProfesor, costoArbitro, cantidadJornadas, eliminatoria } = await request.json();

        if (!seasonId || !leagueId || !oldCategoria || oldColor === undefined || newColor === undefined || !fechaInicio || !fechaFin) {
            return NextResponse.json(
                { success: false, message: 'Faltan parámetros requeridos' },
                { status: 400 }
            );
        }

        // Check if the new color already exists for this convocatoria (excluding itself)
        if (oldColor !== newColor) {
            const [exists] = await pool.query(
                'SELECT 1 FROM tblConvocatorias WHERE IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND Color = ? AND Status = 0',
                [seasonId, leagueId, oldCategoria, newColor]
            );
            if (Array.isArray(exists) && exists.length > 0) {
                return NextResponse.json(
                    { success: false, message: 'Ya existe una convocatoria con ese color para esta categoría' },
                    { status: 409 }
                );
            }
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Update tblConvocatorias
            await connection.query(
                `UPDATE tblConvocatorias
                 SET Color = ?, FechaInicio = ?, FechaFin = ?, IdProfesor = ?, CostoLiga = ?, CostoProfesor = ?, CostoArbitro = ?,
                     CantidadJornadas = ?, Eliminatoria = ?
                 WHERE IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND Color = ?`,
                [
                    newColor, fechaInicio, fechaFin, idProfesor,
                    costoLiga || 0, costoProfesor || 0, costoArbitro || 0,
                    normalizarJornadas(cantidadJornadas), normalizarEliminatoria(eliminatoria),
                    seasonId, leagueId, oldCategoria, oldColor,
                ]
            );

            // 2. Update tblDetalleConvocatorias (since Color is part of the identity/PK)
            await connection.query(
                `UPDATE tblDetalleConvocatorias 
                 SET Color = ?
                 WHERE IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND Color = ?`,
                [newColor, seasonId, leagueId, oldCategoria, oldColor]
            );

            // 3. Y las marcas de precio fijado a mano, que se identifican igual.
            await mueveColorDePreciosManuales(connection, seasonId, leagueId, oldCategoria, oldColor, newColor);

            await connection.commit();
            return NextResponse.json({ success: true, message: 'Convocatoria actualizada exitosamente' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Error updating convocatoria:', error);
        return NextResponse.json(
            { success: false, message: 'Error al actualizar la convocatoria', error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
