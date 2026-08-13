import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { normalizarEliminatoria, normalizarJornadas } from '@/lib/convocatoria-opciones';

export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, categoria, fechaInicio, fechaFin, color, idProfesor, costoLiga, costoProfesor, costoArbitro, cantidadJornadas, eliminatoria } = await request.json();

        if (!seasonId || !leagueId || !categoria || !fechaInicio || !fechaFin) {
            return NextResponse.json(
                { success: false, message: 'Faltan parámetros requeridos' },
                { status: 400 }
            );
        }

        // La llave primaria de tblConvocatorias es (IdTemporada, IdLiga, Categoria, Color),
        // así que esa combinación solo puede existir una vez. Dos casos muy distintos:
        //   Status = 0  sigue vigente  -> no se toca nada y se avisa
        //   Status = 2  fue eliminada  -> se reemplaza
        // Reemplazar una eliminada es seguro porque /api/convocatorias/delete ya borra
        // sus renglones de tblDetalleConvocatorias, así que la nueva arranca sin jugadores
        // heredados.
        const [existentes] = await pool.query(
            'SELECT Status FROM tblConvocatorias WHERE IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND Color = ?',
            [seasonId, leagueId, categoria, color]
        ) as unknown as [Array<{ Status: number }>, unknown];

        if (existentes.length > 0 && Number(existentes[0].Status) === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'Ya existe una convocatoria vigente con esa misma liga, categoría y color. Elimínala primero o créala con otro color.',
                },
                { status: 409 }
            );
        }

        // REPLACE reescribe la fila completa, así que Cerrada y Status vuelven a 0: la
        // convocatoria eliminada queda otra vez vigente y abierta.
        const insertQuery = `
            REPLACE INTO tblConvocatorias (IdTemporada, IdLiga, Categoria, FechaInicio, FechaFin, Color, IdProfesor, CostoLiga, CostoProfesor, CostoArbitro, CantidadJornadas, Eliminatoria, Cerrada, Status, FechaAlta)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NOW())
        `;

        await pool.query(insertQuery, [
            seasonId, leagueId, categoria, fechaInicio, fechaFin, color, idProfesor,
            costoLiga || 0, costoProfesor || 0, costoArbitro || 0,
            normalizarJornadas(cantidadJornadas), normalizarEliminatoria(eliminatoria),
        ]);

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
