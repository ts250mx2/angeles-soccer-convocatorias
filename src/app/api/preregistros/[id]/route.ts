import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { CLAVE_PLANTILLAS, CLAVE_PREREGISTROS } from '@/lib/navegacion';
import { requiereAlgunaPagina } from '@/lib/permisos';

export const dynamic = 'force-dynamic';

/**
 * Borra un preregistro.
 *
 * ── Por que se borra de verdad y no se marca de baja ──
 *
 * tblJugadoresPre.Status existe, pero en produccion las 186 filas estan en 0: el sistema
 * de escritorio nunca lo escribe ni lo lee. Marcar una baja ahi la veria unicamente esta
 * aplicacion, y el escritorio seguiria ofreciendo para alta al preregistro que alguien
 * acaba de dar por basura —que es justo lo contrario de lo que se pidio al borrarlo—.
 *
 * Lo que se borra tampoco es informacion que se pueda extranar: un preregistro es un
 * prospecto sin convertir, y lo que se quita son capturas de prueba, duplicados y
 * tecleos sueltos. El dato que importa —el jugador— vive en tblJugadores y esto no lo
 * toca ni cuando el preregistro ya se convirtio.
 *
 * ── Los dos permisos ──
 *
 * Se borra desde dos pantallas —el reporte de Preregistros y la Plantilla de Equipos— y
 * es la misma fila. Pedir solo la clave del reporte dejaria fuera a quien arma plantillas
 * y ve ahi al preregistrado que quiere quitar de su lista.
 */
export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const guardia = await requiereAlgunaPagina([CLAVE_PREREGISTROS, CLAVE_PLANTILLAS]);
    if (!guardia.ok) {
        return NextResponse.json({ success: false, message: guardia.message }, { status: guardia.status });
    }

    try {
        const { id } = await params;
        const idJugadorPre = Number(id);
        if (!Number.isInteger(idJugadorPre) || idJugadorPre <= 0) {
            return NextResponse.json({ success: false, message: 'Preregistro no válido' }, { status: 400 });
        }

        /* Se lee antes de borrar para poder decir a quién se borró: despues de la
           sentencia ya no hay de donde sacar el nombre, y un aviso que dijera solo
           "listo" no deja comprobar que se fue el que se queria. */
        const [filas] = (await pool.query(
            'SELECT IdJugadorPre, JugadorPre FROM tblJugadoresPre WHERE IdJugadorPre = ?',
            [idJugadorPre],
        )) as [Array<{ IdJugadorPre: number; JugadorPre: string | null }>, unknown];

        if (filas.length === 0) {
            return NextResponse.json({ success: false, message: 'El preregistro ya no existe' }, { status: 404 });
        }
        const jugador = String(filas[0].JugadorPre ?? '').trim() || `Preregistro ${idJugadorPre}`;

        /* Primero su lugar en la cancha y luego la fila: al reves quedaria un acomodo
           apuntando a alguien que ya no existe, y la hoja del equipo lo seguiria
           pintando hasta que alguien la volviera a guardar. La tabla puede no existir
           todavia —la migracion 029 es reciente—, y eso no puede impedir el borrado. */
        try {
            await pool.query('DELETE FROM tblEquiposPlantillaPre WHERE IdJugadorPre = ?', [idJugadorPre]);
        } catch (error) {
            if ((error as { code?: string })?.code !== 'ER_NO_SUCH_TABLE') throw error;
        }

        await pool.query('DELETE FROM tblJugadoresPre WHERE IdJugadorPre = ?', [idJugadorPre]);

        return NextResponse.json({ success: true, message: `Se borró el preregistro de ${jugador}.`, jugador });
    } catch (error) {
        console.error('Error al borrar el preregistro:', error);
        return NextResponse.json(
            { success: false, message: 'Error al borrar el preregistro' },
            { status: 500 },
        );
    }
}
