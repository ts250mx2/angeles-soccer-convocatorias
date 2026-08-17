import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { crearConvocatoria } from '@/lib/convocatorias-crear';

export async function POST(request: Request) {
    try {
        const { seasonId, leagueId, categoria, fechaInicio, fechaFin, color, idProfesor, costoLiga, costoProfesor, costoArbitro, cantidadJornadas, eliminatoria } = await request.json();

        if (!seasonId || !leagueId || !categoria || !fechaInicio || !fechaFin) {
            return NextResponse.json(
                { success: false, message: 'Faltan parámetros requeridos' },
                { status: 400 }
            );
        }

        /* Clinics no juega liga ni copa. El selector de categorías ya no las ofrece, pero
           eso es comodidad de pantalla: quien decide es el servidor, y aquí se corta
           tanto por categoría como por liga. */
        const [ligas] = await pool.query(
            'SELECT Liga FROM tblLigas WHERE IdLiga = ?',
            [leagueId]
        ) as unknown as [Array<{ Liga: string | null }>, unknown];
        const nombreLiga = String(ligas[0]?.Liga ?? '');
        const esClinics = (t: string) => t.toUpperCase().includes('CLINIC');

        if (esClinics(String(categoria)) || esClinics(nombreLiga)) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'Clinics no juega liga ni copa, así que no se le pueden crear convocatorias.',
                },
                { status: 409 }
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

        // El alta vive en una sola función, compartida con la creación automática por
        // ligas y copas pagadas, para que las dos produzcan exactamente lo mismo.
        await crearConvocatoria(pool, {
            seasonId, leagueId, categoria, fechaInicio, fechaFin, color, idProfesor,
            costoLiga, costoProfesor, costoArbitro, cantidadJornadas, eliminatoria,
        });

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
